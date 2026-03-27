// test/integration/hardening.test.ts
//
// Integration tests that verify the container's network hardening.
// These spin up a real container with the firewall, exec commands inside,
// and verify that traffic is properly blocked or allowed.
//
// Run with: npm test -- --grep "hardening"
// Requires: Docker running, claude-sandbox:latest image built

import {expect} from 'chai'
import Docker from 'dockerode'
import {join} from 'node:path'
import {homedir} from 'node:os'
import {PassThrough} from 'node:stream'
import {ensureSSHKeyPair} from '../../src/lib/ssh.js'
import {getConfigDir} from '../../src/lib/config.js'

const IMAGE = 'claude-sandbox:latest'
const CONTAINER_NAME = 'claude-sandbox-hardening-test'

// A minimal GitHub token is needed for the entrypoint (gh auth login).
// We use the real token from `gh auth token` so the container can start fully.
async function getGitHubToken(): Promise<string> {
  const {execFile} = await import('node:child_process')
  const {promisify} = await import('node:util')
  const execFileAsync = promisify(execFile)
  const {stdout} = await execFileAsync('gh', ['auth', 'token'])
  return stdout.trim()
}

function execInContainer(docker: Docker, container: Docker.Container, cmd: string[]): Promise<{exitCode: number; output: string}> {
  return new Promise(async (resolve, reject) => {
    try {
      const exec = await container.exec({
        AttachStderr: true,
        AttachStdout: true,
        Cmd: cmd,
      })

      const stream = await exec.start({hijack: true, stdin: false})
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      docker.modem.demuxStream(stream, stdout, stderr)

      const chunks: Buffer[] = []
      stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      stderr.on('data', (chunk: Buffer) => chunks.push(chunk))

      stream.on('end', async () => {
        const inspectResult = await exec.inspect()
        resolve({
          exitCode: inspectResult.ExitCode ?? -1,
          output: Buffer.concat(chunks).toString('utf8'),
        })
      })
      stream.on('error', reject)
    } catch (error) {
      reject(error)
    }
  })
}

describe('hardening', function () {
  // These tests are slow — they start a real container with firewall init
  this.timeout(180_000)

  const docker = new Docker()
  let container: Docker.Container

  before(async function () {
    // Clean up any previous test container
    try {
      const old = docker.getContainer(CONTAINER_NAME)
      await old.remove({force: true})
    } catch {
      // doesn't exist, fine
    }

    const token = await getGitHubToken()
    const keys = await ensureSSHKeyPair(getConfigDir())

    // Start a container that will run the entrypoint (firewall + sshd + clone).
    // We use a known public repo so the clone succeeds.
    container = await docker.createContainer({
      Env: [
        'REPO=octocat/Hello-World',
        'PROMPT=exit immediately',
        `GITHUB_TOKEN=${token}`,
        'CREATE_PR=false',
      ],
      ExposedPorts: {'22/tcp': {}},
      HostConfig: {
        Binds: [
          `${join(homedir(), '.claude')}:/home/claude/.claude:ro`,
          `${keys.publicKeyPath}:/home/claude/.ssh/authorized_keys:ro`,
        ],
        CapAdd: ['NET_ADMIN', 'NET_RAW'],
        PortBindings: {
          '22/tcp': [{HostPort: '2299'}],
        },
      },
      Image: IMAGE,
      Labels: {
        app: 'claude-sandbox',
        'claude-sandbox.test': 'hardening',
      },
      name: CONTAINER_NAME,
    })

    await container.start()

    // Wait for the firewall to be ready. The entrypoint logs "=== Claude Sandbox ready ===" when done.
    // Poll the container logs until we see the ready message.
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const logStream = await container.logs({stdout: true, stderr: true, tail: 50})
      const logText = logStream.toString('utf8')
      if (logText.includes('Claude Sandbox ready')) {
        break
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
  })

  after(async function () {
    if (container) {
      await container.remove({force: true})
    }
  })

  // --- BLOCKED traffic tests ---

  it('blocks access to example.com', async function () {
    const result = await execInContainer(docker, container, [
      'curl', '--connect-timeout', '5', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://example.com',
    ])
    // Should fail — curl returns exit code 7 (connection refused) or 28 (timeout)
    expect(result.exitCode).to.not.equal(0)
  })

  it('blocks access to arbitrary HTTP sites', async function () {
    const result = await execInContainer(docker, container, [
      'curl', '--connect-timeout', '5', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://httpbin.org/get',
    ])
    expect(result.exitCode).to.not.equal(0)
  })

  it('blocks access to Google DNS (8.8.8.8:443)', async function () {
    const result = await execInContainer(docker, container, [
      'curl', '--connect-timeout', '5', '-s', '-o', '/dev/null', 'https://8.8.8.8',
    ])
    expect(result.exitCode).to.not.equal(0)
  })

  it('blocks outbound SMTP (port 25)', async function () {
    const result = await execInContainer(docker, container, [
      'bash', '-c', 'echo test | timeout 5 bash -c "cat > /dev/tcp/1.1.1.1/25" 2>&1 || exit 1',
    ])
    expect(result.exitCode).to.not.equal(0)
  })

  // --- ALLOWED traffic tests ---

  it('allows access to api.github.com', async function () {
    const result = await execInContainer(docker, container, [
      'curl', '--connect-timeout', '10', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://api.github.com/zen',
    ])
    expect(result.exitCode).to.equal(0)
    expect(result.output.trim()).to.match(/200|403/) // 403 is fine if rate-limited
  })

  it('allows access to github.com', async function () {
    const result = await execInContainer(docker, container, [
      'curl', '--connect-timeout', '10', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://github.com',
    ])
    expect(result.exitCode).to.equal(0)
  })

  it('allows access to api.anthropic.com', async function () {
    const result = await execInContainer(docker, container, [
      'curl', '--connect-timeout', '10', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://api.anthropic.com',
    ])
    // Should connect (even if returns 401/403 without auth, that's fine — connection succeeded)
    expect(result.exitCode).to.equal(0)
  })

  it('allows access to registry.npmjs.org', async function () {
    const result = await execInContainer(docker, container, [
      'curl', '--connect-timeout', '10', '-s', '-o', '/dev/null', '-w', '%{http_code}', 'https://registry.npmjs.org/',
    ])
    expect(result.exitCode).to.equal(0)
    expect(result.output.trim()).to.equal('200')
  })

  it('allows DNS resolution', async function () {
    const result = await execInContainer(docker, container, [
      'dig', '+short', 'github.com',
    ])
    expect(result.exitCode).to.equal(0)
    expect(result.output.trim()).to.not.be.empty
  })

  // --- Firewall state verification ---

  it('has DROP as default OUTPUT policy', async function () {
    const result = await execInContainer(docker, container, [
      'sudo', 'iptables', '-L', 'OUTPUT', '-n', '--line-numbers',
    ])
    expect(result.output).to.include('DROP')
  })

  it('has DROP as default INPUT policy', async function () {
    const result = await execInContainer(docker, container, [
      'sudo', 'iptables', '-L', 'INPUT', '-n', '--line-numbers',
    ])
    expect(result.output).to.include('DROP')
  })

  it('has the allowed-domains ipset populated', async function () {
    const result = await execInContainer(docker, container, [
      'sudo', 'ipset', 'list', 'allowed-domains', '-t',
    ])
    expect(result.exitCode).to.equal(0)
    expect(result.output).to.include('hash:net')
  })

  it('REJECT rule gives immediate feedback (not silent drop)', async function () {
    // The firewall adds REJECT --reject-with icmp-admin-prohibited as the final OUTPUT rule.
    // This means blocked connections fail fast instead of timing out.
    const result = await execInContainer(docker, container, [
      'sudo', 'iptables', '-L', 'OUTPUT', '-n', '-v',
    ])
    expect(result.output).to.include('REJECT')
    expect(result.output).to.include('icmp-admin-prohibited')
  })
})

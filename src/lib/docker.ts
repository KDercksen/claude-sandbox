// src/lib/docker.ts
import Docker from 'dockerode'
import * as net from 'node:net'
import {PassThrough} from 'node:stream'
import * as tar from 'tar-fs'

const LABEL = 'app=claude-sandbox'
const LABEL_KEY = 'app'
const LABEL_VALUE = 'claude-sandbox'

export interface ContainerInfo {
  created: string
  name: string
  repo: string
  sshPort: number
  status: string
}

export interface CreateContainerOpts {
  branch?: string
  claudeConfigDir: string
  claudeConfigFile: string
  createPr: boolean
  extraAllowedDomains?: string[]
  githubToken: string
  image: string
  name: string
  prompt: string
  repo: string
  sshPort: number
  sshPublicKeyPath: string
}

export class SandboxDocker {
  private docker: Docker

  constructor() {
    this.docker = new Docker()
  }

  async buildImage(dockerDir: string, tag: string): Promise<void> {
    const tarStream = tar.pack(dockerDir)
    const stream = await this.docker.buildImage(tarStream, {t: tag})

    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => {
          if (err) reject(err)
          else resolve()
        },
        (event: {stream?: string}) => {
          if (event.stream) process.stdout.write(event.stream)
        },
      )
    })
  }

  async createAndStartContainer(opts: CreateContainerOpts): Promise<ContainerInfo> {
    const env = [
      `REPO=${opts.repo}`,
      `PROMPT=${opts.prompt}`,
      `GITHUB_TOKEN=${opts.githubToken}`,
      `CREATE_PR=${opts.createPr}`,
    ]

    if (opts.branch) {
      env.push(`BRANCH=${opts.branch}`)
    }

    if (opts.extraAllowedDomains && opts.extraAllowedDomains.length > 0) {
      env.push(`EXTRA_ALLOWED_DOMAINS=${opts.extraAllowedDomains.join(',')}`)
    }

    const container = await this.docker.createContainer({
      Env: env,
      ExposedPorts: {'22/tcp': {}},
      HostConfig: {
        Binds: [
          `${opts.claudeConfigDir}:/home/claude/.claude.host:ro`,
          `${opts.claudeConfigFile}:/home/claude/.claude.json.host:ro`,
          `${opts.sshPublicKeyPath}:/home/claude/.ssh/authorized_keys:ro`,
        ],
        CapAdd: ['NET_ADMIN', 'NET_RAW'],
        PortBindings: {
          '22/tcp': [{HostPort: String(opts.sshPort)}],
        },
      },
      Image: opts.image,
      Labels: {
        'claude-sandbox.repo': opts.repo,
        'claude-sandbox.ssh-port': String(opts.sshPort),
        [LABEL_KEY]: LABEL_VALUE,
      },
      name: opts.name,
    })

    await container.start()

    return {
      created: new Date().toISOString(),
      name: opts.name,
      repo: opts.repo,
      sshPort: opts.sshPort,
      status: 'running',
    }
  }

  async execInContainer(name: string, cmd: string[]): Promise<string> {
    const container = this.docker.getContainer(name)
    const exec = await container.exec({
      AttachStderr: true,
      AttachStdout: true,
      Cmd: cmd,
    })

    const stream = await exec.start({hijack: true, stdin: false})
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    this.docker.modem.demuxStream(stream, stdout, stderr)

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      stdout.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      stdout.on('error', reject)
    })
  }

  async findFreePort(min: number, max: number): Promise<number> {
    // Shuffle candidates to reduce collisions
    const candidates = Array.from({length: max - min + 1}, (_, i) => min + i)
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }

    const results = await Promise.all(candidates.map((port) => this.isPortFree(port).then((free) => ({free, port}))))
    const found = results.find((r) => r.free)
    if (found) return found.port

    throw new Error(`No free port in range ${min}-${max}`)
  }

  async listContainers(): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {label: [LABEL]},
    })

    return containers.map((c) => ({
      created: c.Created ? new Date(c.Created * 1000).toISOString() : 'unknown',
      name: c.Names[0]?.replace(/^\//, '') ?? 'unknown',
      repo: c.Labels['claude-sandbox.repo'] ?? 'unknown',
      sshPort: Number.parseInt(c.Labels['claude-sandbox.ssh-port'] ?? '0', 10),
      status: c.State ?? 'unknown',
    }))
  }

  async removeContainer(name: string): Promise<void> {
    const container = this.docker.getContainer(name)
    await container.remove({force: true})
  }

  async stopContainer(name: string): Promise<void> {
    const container = this.docker.getContainer(name)
    try {
      await container.stop()
    } catch (error: unknown) {
      if ((error as {statusCode?: number}).statusCode !== 304) throw error // already stopped
    }
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.once('error', () => resolve(false))
      server.once('listening', () => {
        server.close(() => resolve(true))
      })
      server.listen(port, '0.0.0.0')
    })
  }
}

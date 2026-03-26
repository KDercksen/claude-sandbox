# Claude Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool and Docker image that runs Claude Code in isolated, disposable containers with network-hardened egress and SSH observability.

**Architecture:** oclif TypeScript CLI wraps dockerode to manage containers built from a custom Docker image. The image includes Claude Code, SSH server, tmux, iptables firewall, and uv for Python. Containers are launched with a prompt (optionally enriched from GitHub issues/PRs), and Claude runs autonomously inside tmux.

**Tech Stack:** TypeScript, oclif v4 (ESM), dockerode, Docker, iptables/ipset, tmux, openssh-server, gh CLI, uv

---

## File Structure

```
claude-sandbox/
├── docker/
│   ├── Dockerfile
│   ├── init-firewall.sh        # iptables allowlist setup
│   ├── entrypoint.sh           # container boot sequence
│   └── claude-wrapper.sh       # runs claude in tmux, handles post-exit
├── src/
│   ├── commands/
│   │   ├── attach.ts           # SSH + tmux attach shortcut
│   │   ├── build.ts            # build/rebuild Docker image
│   │   ├── logs.ts             # stream tmux pane output
│   │   ├── ls.ts               # list sandbox containers
│   │   ├── rm.ts               # remove container
│   │   ├── start.ts            # launch a new sandbox
│   │   └── stop.ts             # stop container
│   ├── lib/
│   │   ├── config.ts           # config loading/saving (~/.claude-sandbox/config.json)
│   │   ├── container-name.ts   # auto-generate container names
│   │   ├── docker.ts           # dockerode wrapper for sandbox operations
│   │   ├── prompt-builder.ts   # combine --prompt, --issue, --pr into full prompt
│   │   └── ssh.ts              # SSH keypair management
│   └── index.ts                # oclif re-export
├── test/
│   ├── lib/
│   │   ├── config.test.ts
│   │   ├── container-name.test.ts
│   │   ├── prompt-builder.test.ts
│   │   └── ssh.test.ts
│   └── commands/
│       └── ls.test.ts
├── bin/
│   ├── run.js
│   └── dev.js
├── package.json
├── tsconfig.json
└── .gitignore
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `bin/run.js`, `bin/dev.js`, `src/index.ts`

- [ ] **Step 1: Initialize git repo and scaffold oclif project**

```bash
cd /mnt/storage/projects/claude-sandbox
git init
npx oclif generate claude-sandbox --defaults
```

This scaffolds the project. When prompted, accept defaults (ESM, mocha, MIT). Then move the generated files up if oclif creates a subdirectory:

```bash
# If oclif created a claude-sandbox/ subdirectory, move contents up
# and remove the empty directory
```

- [ ] **Step 2: Install additional dependencies**

```bash
npm install dockerode
npm install -D @types/dockerode @types/node
```

- [ ] **Step 3: Clean up scaffolded files**

Remove the example hello command that oclif generates:

```bash
rm -rf src/commands/hello
rm -rf test/commands/hello
```

- [ ] **Step 4: Update package.json oclif config**

Edit `package.json` to set the binary name and topic separator:

```json
{
  "name": "claude-sandbox",
  "bin": {
    "claude-sandbox": "./bin/run.js"
  },
  "oclif": {
    "bin": "claude-sandbox",
    "dirname": "claude-sandbox",
    "commands": "./dist/commands",
    "topicSeparator": " "
  }
}
```

- [ ] **Step 5: Add .gitignore entries**

Append to `.gitignore`:

```
dist/
node_modules/
oclif.manifest.json
*.tgz
```

- [ ] **Step 6: Verify build works**

```bash
npm run build
```

Expected: Compiles with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold oclif project with TypeScript and dockerode"
```

---

### Task 2: Docker Image — Dockerfile

**Files:**
- Create: `docker/Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

```dockerfile
FROM node:20-bookworm

ARG CLAUDE_CODE_VERSION=latest

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  curl \
  build-essential \
  jq \
  openssh-server \
  tmux \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  sudo \
  procps \
  less \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv (astral)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Create claude user
RUN useradd -m -s /bin/bash -G sudo claude \
  && echo "claude ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/claude \
  && chmod 0440 /etc/sudoers.d/claude

# SSH server setup
RUN mkdir /var/run/sshd \
  && sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config \
  && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config \
  && sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Prepare directories
RUN mkdir -p /workspace /home/claude/.ssh /home/claude/.claude \
  && chown -R claude:claude /workspace /home/claude/.ssh /home/claude/.claude \
  && chmod 700 /home/claude/.ssh

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Copy scripts
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY claude-wrapper.sh /usr/local/bin/claude-wrapper.sh

RUN chmod +x /usr/local/bin/init-firewall.sh \
  /usr/local/bin/entrypoint.sh \
  /usr/local/bin/claude-wrapper.sh

# Restrict firewall script to sudo only
RUN echo "claude ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/claude-firewall \
  && chmod 0440 /etc/sudoers.d/claude-firewall

WORKDIR /workspace
USER claude

EXPOSE 22

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

- [ ] **Step 2: Commit**

```bash
git add docker/Dockerfile
git commit -m "feat: add Dockerfile for claude-sandbox image"
```

---

### Task 3: Docker Image — init-firewall.sh

**Files:**
- Create: `docker/init-firewall.sh`

- [ ] **Step 1: Write the firewall init script**

Adapted from Anthropic's reference devcontainer. Allows only: GitHub, Anthropic API, npm, PyPI, Sentry/Statsig telemetry. Blocks everything else.

```bash
#!/bin/bash
set -euo pipefail
IFS=$'\n\t'

echo "=== Initializing firewall ==="

# 1. Preserve Docker internal DNS before flushing
DOCKER_DNS_RULES=$(iptables-save -t nat | grep "127\.0\.0\.11" || true)

# Flush all existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X
ipset destroy allowed-domains 2>/dev/null || true

# 2. Restore Docker DNS rules
if [ -n "$DOCKER_DNS_RULES" ]; then
    echo "Restoring Docker DNS rules..."
    iptables -t nat -N DOCKER_OUTPUT 2>/dev/null || true
    iptables -t nat -N DOCKER_POSTROUTING 2>/dev/null || true
    echo "$DOCKER_DNS_RULES" | xargs -L 1 iptables -t nat
else
    echo "No Docker DNS rules to restore"
fi

# 3. Allow DNS, SSH, and localhost before restrictions
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A INPUT -p udp --sport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 22 -j ACCEPT
iptables -A INPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
# Allow inbound SSH connections (for attach)
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
iptables -A OUTPUT -p tcp --sport 22 -m state --state ESTABLISHED -j ACCEPT
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# 4. Create ipset allowlist
ipset create allowed-domains hash:net

# 5. Fetch and add GitHub IP ranges
echo "Fetching GitHub IP ranges..."
gh_ranges=$(curl -s https://api.github.com/meta)
if [ -z "$gh_ranges" ]; then
    echo "ERROR: Failed to fetch GitHub IP ranges"
    exit 1
fi

if ! echo "$gh_ranges" | jq -e '.web and .api and .git' >/dev/null; then
    echo "ERROR: GitHub API response missing required fields"
    exit 1
fi

echo "Processing GitHub IPs..."
while read -r cidr; do
    if [[ ! "$cidr" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/[0-9]{1,2}$ ]]; then
        echo "ERROR: Invalid CIDR range from GitHub meta: $cidr"
        exit 1
    fi
    ipset add allowed-domains "$cidr"
done < <(echo "$gh_ranges" | jq -r '(.web + .api + .git)[]' | aggregate -q)

# 6. Resolve and add other allowed domains
for domain in \
    "api.anthropic.com" \
    "registry.npmjs.org" \
    "pypi.org" \
    "files.pythonhosted.org" \
    "sentry.io" \
    "statsig.anthropic.com" \
    "statsig.com"; do
    echo "Resolving $domain..."
    ips=$(dig +noall +answer A "$domain" | awk '$4 == "A" {print $5}')
    if [ -z "$ips" ]; then
        echo "WARNING: Failed to resolve $domain, skipping"
        continue
    fi

    while read -r ip; do
        if [[ "$ip" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            ipset add allowed-domains "$ip" 2>/dev/null || true
        fi
    done < <(echo "$ips")
done

# 7. Allow host network (Docker bridge)
HOST_IP=$(ip route | grep default | cut -d" " -f3)
if [ -n "$HOST_IP" ]; then
    HOST_NETWORK=$(echo "$HOST_IP" | sed "s/\.[0-9]*$/.0\/24/")
    echo "Host network: $HOST_NETWORK"
    iptables -A INPUT -s "$HOST_NETWORK" -j ACCEPT
    iptables -A OUTPUT -d "$HOST_NETWORK" -j ACCEPT
fi

# 8. Set default policy to DROP
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow outbound to allowlisted IPs only
iptables -A OUTPUT -m set --match-set allowed-domains dst -j ACCEPT

# Reject everything else with immediate feedback
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

# 9. Verify
echo "Verifying firewall..."
if curl --connect-timeout 5 https://example.com >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed — example.com is reachable"
    exit 1
else
    echo "PASS: example.com blocked"
fi

if ! curl --connect-timeout 5 https://api.github.com/zen >/dev/null 2>&1; then
    echo "ERROR: Firewall verification failed — api.github.com unreachable"
    exit 1
else
    echo "PASS: api.github.com reachable"
fi

echo "=== Firewall ready ==="
```

- [ ] **Step 2: Commit**

```bash
git add docker/init-firewall.sh
git commit -m "feat: add iptables firewall allowlist script"
```

---

### Task 4: Docker Image — entrypoint.sh + claude-wrapper.sh

**Files:**
- Create: `docker/entrypoint.sh`, `docker/claude-wrapper.sh`

- [ ] **Step 1: Write entrypoint.sh**

This is the container boot sequence. It reads env vars set by the CLI: `REPO`, `BRANCH`, `PROMPT`, `CREATE_PR`, `GITHUB_TOKEN`.

```bash
#!/bin/bash
set -euo pipefail

echo "=== Claude Sandbox starting ==="

# 1. Init firewall
sudo /usr/local/bin/init-firewall.sh

# 2. Start SSH daemon
sudo /usr/sbin/sshd

# 3. Configure git credentials using PAT
git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=${GITHUB_TOKEN}"; }; f'
git config --global user.name "Claude Sandbox"
git config --global user.email "claude@sandbox.local"

# 4. Authenticate gh CLI
echo "${GITHUB_TOKEN}" | gh auth login --with-token

# 5. Clone repo
echo "Cloning ${REPO}..."
git clone "https://github.com/${REPO}.git" /workspace
cd /workspace

# 6. Checkout or create branch
if [ -n "${BRANCH:-}" ]; then
    echo "Checking out branch: ${BRANCH}"
    git checkout -b "${BRANCH}" 2>/dev/null || git checkout "${BRANCH}"
fi

# 7. Launch claude inside tmux via wrapper
echo "Starting Claude in tmux session..."
tmux new-session -d -s claude /usr/local/bin/claude-wrapper.sh

echo "=== Claude Sandbox ready ==="
echo "Container will stay alive for SSH access."

# 8. Keep container alive
exec tail -f /dev/null
```

- [ ] **Step 2: Write claude-wrapper.sh**

This runs inside tmux. It invokes Claude, then handles post-exit tasks (push, PR creation).

```bash
#!/bin/bash
set -euo pipefail

cd /workspace

echo "=== Starting Claude Code ==="
echo "Prompt: ${PROMPT}"
echo ""

# Run Claude
set +e
claude --dangerously-skip-permissions -p "${PROMPT}"
EXIT_CODE=$?
set -e

echo ""
echo "=== Claude exited with code ${EXIT_CODE} ==="

# Stage and commit any uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Committing remaining changes..."
    git add -A
    git commit -m "claude-sandbox: uncommitted changes from session" || true
fi

# Push if we have a branch
if [ -n "${BRANCH:-}" ]; then
    echo "Pushing branch ${BRANCH}..."
    git push -u origin "${BRANCH}" 2>&1 || echo "WARNING: push failed"
fi

# Create PR if requested
if [ "${CREATE_PR:-false}" = "true" ] && [ -n "${BRANCH:-}" ]; then
    echo "Creating pull request..."
    gh pr create \
      --title "Claude Sandbox: ${BRANCH}" \
      --body "Automated PR created by claude-sandbox." \
      --head "${BRANCH}" \
      2>&1 || echo "WARNING: PR creation failed"
fi

# Write completion marker
echo "${EXIT_CODE}" > /workspace/.claude-done
echo ""
echo "=== Session complete. Container stays alive for inspection. ==="
echo "To resume work, run: claude --dangerously-skip-permissions"

# Drop into a shell so tmux session stays open
exec bash
```

- [ ] **Step 3: Commit**

```bash
git add docker/entrypoint.sh docker/claude-wrapper.sh
git commit -m "feat: add container entrypoint and claude wrapper scripts"
```

---

### Task 5: lib/config.ts (TDD)

**Files:**
- Create: `src/lib/config.ts`
- Test: `test/lib/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/lib/config.test.ts
import {expect} from 'chai'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {loadConfig, saveConfig, type SandboxConfig} from '../../src/lib/config.js'

describe('config', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-sandbox-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true})
  })

  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig(tempDir)
    expect(config.image).to.equal('claude-sandbox:latest')
    expect(config.sshPortRange).to.deep.equal([2200, 2299])
    expect(config.defaultBranchPrefix).to.equal('claude/')
    expect(config.githubPat).to.be.undefined
  })

  it('loads config from file', async () => {
    const configPath = join(tempDir, 'config.json')
    const data: SandboxConfig = {
      image: 'my-image:v2',
      sshPortRange: [3000, 3099] as [number, number],
      defaultBranchPrefix: 'bot/',
      githubPat: 'github_pat_test123',
    }
    const {writeFile, mkdir} = await import('node:fs/promises')
    await writeFile(configPath, JSON.stringify(data))

    const config = await loadConfig(tempDir)
    expect(config.image).to.equal('my-image:v2')
    expect(config.sshPortRange).to.deep.equal([3000, 3099])
    expect(config.githubPat).to.equal('github_pat_test123')
  })

  it('saves config to file', async () => {
    const config: SandboxConfig = {
      image: 'claude-sandbox:dev',
      sshPortRange: [4000, 4099] as [number, number],
      defaultBranchPrefix: 'dev/',
    }
    await saveConfig(tempDir, config)

    const raw = await readFile(join(tempDir, 'config.json'), 'utf-8')
    const saved = JSON.parse(raw)
    expect(saved.image).to.equal('claude-sandbox:dev')
  })

  it('merges partial config with defaults', async () => {
    const {writeFile} = await import('node:fs/promises')
    await writeFile(join(tempDir, 'config.json'), JSON.stringify({image: 'custom:v1'}))

    const config = await loadConfig(tempDir)
    expect(config.image).to.equal('custom:v1')
    expect(config.sshPortRange).to.deep.equal([2200, 2299])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run build && npm test -- --grep "config"
```

Expected: FAIL — module `../../src/lib/config.js` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/config.ts
import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {homedir} from 'node:os'

export interface SandboxConfig {
  githubPat?: string
  image: string
  sshPortRange: [number, number]
  defaultBranchPrefix: string
}

const DEFAULTS: SandboxConfig = {
  image: 'claude-sandbox:latest',
  sshPortRange: [2200, 2299],
  defaultBranchPrefix: 'claude/',
}

export function getConfigDir(): string {
  return join(homedir(), '.claude-sandbox')
}

export async function loadConfig(configDir?: string): Promise<SandboxConfig> {
  const dir = configDir ?? getConfigDir()
  const configPath = join(dir, 'config.json')

  try {
    const raw = await readFile(configPath, 'utf-8')
    const partial = JSON.parse(raw) as Partial<SandboxConfig>
    return {...DEFAULTS, ...partial}
  } catch {
    return {...DEFAULTS}
  }
}

export async function saveConfig(configDir: string | undefined, config: SandboxConfig): Promise<void> {
  const dir = configDir ?? getConfigDir()
  await mkdir(dir, {recursive: true})
  const configPath = join(dir, 'config.json')
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run build && npm test -- --grep "config"
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts test/lib/config.test.ts
git commit -m "feat: add config loading/saving with defaults"
```

---

### Task 6: lib/ssh.ts (TDD)

**Files:**
- Create: `src/lib/ssh.ts`
- Test: `test/lib/ssh.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/lib/ssh.test.ts
import {expect} from 'chai'
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {ensureSSHKeyPair} from '../../src/lib/ssh.js'

describe('ssh', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-sandbox-ssh-'))
  })

  afterEach(async () => {
    await rm(tempDir, {recursive: true, force: true})
  })

  it('generates a new keypair when none exists', async () => {
    const keys = await ensureSSHKeyPair(tempDir)

    expect(keys.privateKeyPath).to.equal(join(tempDir, 'ssh', 'id_ed25519'))
    expect(keys.publicKeyPath).to.equal(join(tempDir, 'ssh', 'id_ed25519.pub'))

    const privStat = await stat(keys.privateKeyPath)
    expect(privStat.isFile()).to.be.true

    const pubContent = await readFile(keys.publicKeyPath, 'utf-8')
    expect(pubContent).to.include('ssh-ed25519')
  })

  it('reuses existing keypair on subsequent calls', async () => {
    const first = await ensureSSHKeyPair(tempDir)
    const firstPub = await readFile(first.publicKeyPath, 'utf-8')

    const second = await ensureSSHKeyPair(tempDir)
    const secondPub = await readFile(second.publicKeyPath, 'utf-8')

    expect(firstPub).to.equal(secondPub)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run build && npm test -- --grep "ssh"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/ssh.ts
import {execFile} from 'node:child_process'
import {access, mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

export interface SSHKeyPair {
  privateKeyPath: string
  publicKeyPath: string
}

export async function ensureSSHKeyPair(configDir: string): Promise<SSHKeyPair> {
  const sshDir = join(configDir, 'ssh')
  const privateKeyPath = join(sshDir, 'id_ed25519')
  const publicKeyPath = join(sshDir, 'id_ed25519.pub')

  try {
    await access(privateKeyPath)
    await access(publicKeyPath)
    return {privateKeyPath, publicKeyPath}
  } catch {
    // Keys don't exist, generate them
  }

  await mkdir(sshDir, {recursive: true})

  await execFileAsync('ssh-keygen', [
    '-t', 'ed25519',
    '-f', privateKeyPath,
    '-N', '',  // no passphrase
    '-C', 'claude-sandbox',
  ])

  return {privateKeyPath, publicKeyPath}
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run build && npm test -- --grep "ssh"
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ssh.ts test/lib/ssh.test.ts
git commit -m "feat: add SSH keypair generation and reuse"
```

---

### Task 7: lib/container-name.ts (TDD)

**Files:**
- Create: `src/lib/container-name.ts`
- Test: `test/lib/container-name.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/lib/container-name.test.ts
import {expect} from 'chai'

import {generateContainerName} from '../../src/lib/container-name.js'

describe('container-name', () => {
  it('uses explicit name with prefix', () => {
    const name = generateContainerName('org/repo', 'fix-auth-bug')
    expect(name).to.equal('claude-sandbox-fix-auth-bug')
  })

  it('auto-generates name from repo when no name given', () => {
    const name = generateContainerName('org/my-repo')
    expect(name).to.match(/^claude-sandbox-my-repo-[a-f0-9]{6}$/)
  })

  it('generates unique names on each call', () => {
    const a = generateContainerName('org/repo')
    const b = generateContainerName('org/repo')
    expect(a).to.not.equal(b)
  })

  it('sanitizes repo names with special characters', () => {
    const name = generateContainerName('org/My_Repo.v2', 'test run')
    expect(name).to.equal('claude-sandbox-test-run')
  })

  it('sanitizes auto-generated names', () => {
    const name = generateContainerName('org/My_Repo.v2')
    expect(name).to.match(/^claude-sandbox-my-repo-v2-[a-f0-9]{6}$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run build && npm test -- --grep "container-name"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/container-name.ts
import {randomBytes} from 'node:crypto'

const PREFIX = 'claude-sandbox'

function sanitize(input: string): string {
  return input
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function generateContainerName(repo: string, name?: string): string {
  if (name) {
    return `${PREFIX}-${sanitize(name)}`
  }

  const repoName = repo.split('/').pop() ?? 'sandbox'
  const suffix = randomBytes(3).toString('hex')
  return `${PREFIX}-${sanitize(repoName)}-${suffix}`
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run build && npm test -- --grep "container-name"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/container-name.ts test/lib/container-name.test.ts
git commit -m "feat: add container name generation with sanitization"
```

---

### Task 8: lib/prompt-builder.ts (TDD)

**Files:**
- Create: `src/lib/prompt-builder.ts`
- Test: `test/lib/prompt-builder.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/lib/prompt-builder.test.ts
import {expect} from 'chai'

import {buildPrompt, type PromptSource} from '../../src/lib/prompt-builder.js'

describe('prompt-builder', () => {
  // We mock the gh CLI calls by injecting a fake executor
  const fakeExec = async (cmd: string, args: string[]): Promise<string> => {
    if (args.includes('issue') && args.includes('view')) {
      return JSON.stringify({
        title: 'Auth is broken',
        body: 'Login fails with 500 error when using SSO.',
      })
    }

    if (args.includes('pr') && args.includes('view')) {
      return JSON.stringify({
        title: 'Fix auth middleware',
        body: 'This PR fixes the SSO login flow.',
      })
    }

    throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`)
  }

  it('uses prompt directly when only --prompt given', async () => {
    const result = await buildPrompt({prompt: 'Fix the bug', repo: 'org/repo'}, fakeExec)
    expect(result).to.equal('Fix the bug')
  })

  it('builds prompt from issue when --issue given', async () => {
    const result = await buildPrompt({issue: 42, repo: 'org/repo'}, fakeExec)
    expect(result).to.include('Auth is broken')
    expect(result).to.include('Login fails with 500 error')
    expect(result).to.include('#42')
  })

  it('builds prompt from PR when --pr given', async () => {
    const result = await buildPrompt({pr: 10, repo: 'org/repo'}, fakeExec)
    expect(result).to.include('Fix auth middleware')
    expect(result).to.include('SSO login flow')
    expect(result).to.include('#10')
  })

  it('combines prompt with issue context', async () => {
    const result = await buildPrompt({prompt: 'Focus on tests', issue: 42, repo: 'org/repo'}, fakeExec)
    expect(result).to.include('Focus on tests')
    expect(result).to.include('Auth is broken')
  })

  it('throws when no prompt source given', async () => {
    try {
      await buildPrompt({repo: 'org/repo'}, fakeExec)
      expect.fail('should have thrown')
    } catch (error: any) {
      expect(error.message).to.include('at least one of')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run build && npm test -- --grep "prompt-builder"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/prompt-builder.ts
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

export interface PromptSource {
  prompt?: string
  issue?: number
  pr?: number
  repo: string
}

type ExecFn = (cmd: string, args: string[]) => Promise<string>

async function defaultExec(cmd: string, args: string[]): Promise<string> {
  const {stdout} = await execFileAsync(cmd, args)
  return stdout
}

async function fetchIssue(repo: string, issue: number, exec: ExecFn): Promise<{title: string; body: string}> {
  const raw = await exec('gh', ['issue', 'view', String(issue), '--repo', repo, '--json', 'title,body'])
  return JSON.parse(raw)
}

async function fetchPR(repo: string, pr: number, exec: ExecFn): Promise<{title: string; body: string}> {
  const raw = await exec('gh', ['pr', 'view', String(pr), '--repo', repo, '--json', 'title,body'])
  return JSON.parse(raw)
}

export async function buildPrompt(source: PromptSource, exec: ExecFn = defaultExec): Promise<string> {
  const parts: string[] = []

  if (source.prompt) {
    parts.push(source.prompt)
  }

  if (source.issue) {
    const data = await fetchIssue(source.repo, source.issue, exec)
    parts.push(
      `\n---\nGitHub Issue #${source.issue}:\n\n# ${data.title}\n\n${data.body}`,
    )
  }

  if (source.pr) {
    const data = await fetchPR(source.repo, source.pr, exec)
    parts.push(
      `\n---\nGitHub PR #${source.pr}:\n\n# ${data.title}\n\n${data.body}`,
    )
  }

  if (parts.length === 0) {
    throw new Error('Prompt required: provide at least one of --prompt, --issue, or --pr')
  }

  // If only issue/PR and no explicit prompt, add a default instruction
  if (!source.prompt && parts.length > 0) {
    parts.unshift('Resolve the following. Make the necessary code changes, ensure tests pass, and commit your work.')
  }

  return parts.join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run build && npm test -- --grep "prompt-builder"
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompt-builder.ts test/lib/prompt-builder.test.ts
git commit -m "feat: add prompt builder with issue/PR fetching"
```

---

### Task 9: lib/docker.ts — Docker Client Wrapper

**Files:**
- Create: `src/lib/docker.ts`

- [ ] **Step 1: Write the Docker client wrapper**

This wraps dockerode with sandbox-specific operations. All containers are labeled `app=claude-sandbox` for filtering.

```typescript
// src/lib/docker.ts
import Docker from 'dockerode'
import {createReadStream} from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import {PassThrough} from 'node:stream'
import * as tar from 'tar-fs'

const LABEL = 'app=claude-sandbox'
const LABEL_KEY = 'app'
const LABEL_VALUE = 'claude-sandbox'

export interface ContainerInfo {
  name: string
  repo: string
  status: string
  sshPort: number
  created: string
}

export interface CreateContainerOpts {
  name: string
  image: string
  repo: string
  branch?: string
  prompt: string
  createPr: boolean
  githubToken: string
  sshPublicKeyPath: string
  claudeConfigDir: string
  sshPort: number
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

    const container = await this.docker.createContainer({
      Image: opts.image,
      name: opts.name,
      Env: env,
      Labels: {
        [LABEL_KEY]: LABEL_VALUE,
        'claude-sandbox.repo': opts.repo,
        'claude-sandbox.ssh-port': String(opts.sshPort),
      },
      ExposedPorts: {'22/tcp': {}},
      HostConfig: {
        CapAdd: ['NET_ADMIN', 'NET_RAW'],
        Binds: [
          `${opts.claudeConfigDir}:/home/claude/.claude:ro`,
          `${opts.sshPublicKeyPath}:/home/claude/.ssh/authorized_keys:ro`,
        ],
        PortBindings: {
          '22/tcp': [{HostPort: String(opts.sshPort)}],
        },
      },
    })

    await container.start()

    return {
      name: opts.name,
      repo: opts.repo,
      status: 'running',
      sshPort: opts.sshPort,
      created: new Date().toISOString(),
    }
  }

  async listContainers(): Promise<ContainerInfo[]> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {label: [LABEL]},
    })

    return containers.map((c) => ({
      name: c.Names[0]?.replace(/^\//, '') ?? 'unknown',
      repo: c.Labels['claude-sandbox.repo'] ?? 'unknown',
      status: c.State ?? 'unknown',
      sshPort: Number.parseInt(c.Labels['claude-sandbox.ssh-port'] ?? '0', 10),
      created: c.Created ? new Date(c.Created * 1000).toISOString() : 'unknown',
    }))
  }

  async execInContainer(name: string, cmd: string[]): Promise<string> {
    const container = this.docker.getContainer(name)
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    })

    const stream = await exec.start({hijack: true, stdin: false})
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    this.docker.modem.demuxStream(stream, stdout, stderr)

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      stdout.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      stdout.on('error', reject)
    })
  }

  async stopContainer(name: string): Promise<void> {
    const container = this.docker.getContainer(name)
    try {
      await container.stop()
    } catch (error: any) {
      if (error.statusCode !== 304) throw error // already stopped
    }
  }

  async removeContainer(name: string): Promise<void> {
    const container = this.docker.getContainer(name)
    await container.remove({force: true})
  }

  async findFreePort(min: number, max: number): Promise<number> {
    // Shuffle candidates to reduce collisions
    const candidates = Array.from({length: max - min + 1}, (_, i) => min + i)
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }

    for (const port of candidates) {
      const free = await this.isPortFree(port)
      if (free) return port
    }

    throw new Error(`No free port in range ${min}-${max}`)
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/docker.ts
git commit -m "feat: add dockerode wrapper for sandbox container operations"
```

---

### Task 10: commands/build.ts

**Files:**
- Create: `src/commands/build.ts`

- [ ] **Step 1: Write the build command**

```typescript
// src/commands/build.ts
import {Command, Flags} from '@oclif/core'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'

import {loadConfig} from '../lib/config.js'
import {SandboxDocker} from '../lib/docker.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default class Build extends Command {
  static description = 'Build or rebuild the claude-sandbox Docker image'

  static flags = {
    tag: Flags.string({
      description: 'Image tag',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Build)
    const config = await loadConfig()
    const tag = flags.tag ?? config.image

    this.log(`Building image ${tag}...`)

    const dockerDir = path.resolve(__dirname, '../../docker')
    const docker = new SandboxDocker()

    try {
      await docker.buildImage(dockerDir, tag)
      this.log(`Image ${tag} built successfully.`)
    } catch (error: any) {
      this.error(`Build failed: ${error.message}`)
    }
  }
}
```

Note: The `dockerDir` path resolves relative to the compiled `dist/commands/build.js`, so `../../docker` goes to the project root's `docker/` directory. If installed globally via npm link, this still works because the docker directory is included in the package files.

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/build.ts
git commit -m "feat: add build command for Docker image"
```

---

### Task 11: commands/start.ts

**Files:**
- Create: `src/commands/start.ts`

- [ ] **Step 1: Write the start command**

```typescript
// src/commands/start.ts
import {Command, Flags} from '@oclif/core'
import {execFile} from 'node:child_process'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {loadConfig, getConfigDir} from '../lib/config.js'
import {generateContainerName} from '../lib/container-name.js'
import {SandboxDocker} from '../lib/docker.js'
import {buildPrompt} from '../lib/prompt-builder.js'
import {ensureSSHKeyPair} from '../lib/ssh.js'

const execFileAsync = promisify(execFile)

export default class Start extends Command {
  static description = 'Start a new Claude sandbox container'

  static flags = {
    name: Flags.string({
      description: 'Container name (auto-generated if omitted)',
    }),
    repo: Flags.string({
      char: 'r',
      description: 'GitHub repo (org/name)',
      required: true,
    }),
    prompt: Flags.string({
      char: 'p',
      description: 'Prompt for Claude',
    }),
    issue: Flags.integer({
      char: 'i',
      description: 'GitHub issue number to fetch as context',
    }),
    pr: Flags.integer({
      description: 'GitHub PR number to fetch as context',
    }),
    branch: Flags.string({
      char: 'b',
      description: 'Git branch to create or checkout',
    }),
    'create-pr': Flags.boolean({
      description: 'Create a PR when Claude finishes',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Start)
    const config = await loadConfig()
    const configDir = getConfigDir()

    // Validate that at least one prompt source is given
    if (!flags.prompt && !flags.issue && !flags.pr) {
      this.error('Provide at least one of --prompt, --issue, or --pr')
    }

    // Build the prompt
    this.log('Building prompt...')
    const prompt = await buildPrompt({
      prompt: flags.prompt,
      issue: flags.issue,
      pr: flags.pr,
      repo: flags.repo,
    })

    // Resolve GitHub token
    const githubToken = await this.resolveGitHubToken(config.githubPat)

    // Ensure SSH keypair exists
    const keys = await ensureSSHKeyPair(configDir)

    // Generate container name
    const containerName = generateContainerName(flags.repo, flags.name)

    // Generate branch name if not provided but --create-pr is set
    let branch = flags.branch
    if (!branch && flags['create-pr']) {
      branch = `${config.defaultBranchPrefix}${containerName}`
    }

    // Find a free SSH port
    const docker = new SandboxDocker()
    const sshPort = await docker.findFreePort(config.sshPortRange[0], config.sshPortRange[1])

    this.log(`Starting container ${containerName}...`)

    const info = await docker.createAndStartContainer({
      name: containerName,
      image: config.image,
      repo: flags.repo,
      branch,
      prompt,
      createPr: flags['create-pr'],
      githubToken,
      sshPublicKeyPath: keys.publicKeyPath,
      claudeConfigDir: join(homedir(), '.claude'),
      sshPort,
    })

    this.log('')
    this.log(`Container started: ${info.name}`)
    this.log(`  Repo:     ${info.repo}`)
    this.log(`  SSH port: ${info.sshPort}`)
    this.log(`  Attach:   claude-sandbox attach ${info.name}`)
    this.log(`  Logs:     claude-sandbox logs ${info.name}`)
  }

  private async resolveGitHubToken(configPat?: string): Promise<string> {
    if (configPat) return configPat

    try {
      const {stdout} = await execFileAsync('gh', ['auth', 'token'])
      const token = stdout.trim()
      if (token) return token
    } catch {
      // gh not available or not logged in
    }

    this.error('No GitHub token found. Set github_pat in config or run "gh auth login".')
  }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/start.ts
git commit -m "feat: add start command with prompt/issue/PR support"
```

---

### Task 12: commands/ls.ts

**Files:**
- Create: `src/commands/ls.ts`
- Test: `test/commands/ls.test.ts`

- [ ] **Step 1: Write the ls command**

```typescript
// src/commands/ls.ts
import {Command} from '@oclif/core'

import {SandboxDocker} from '../lib/docker.js'

export default class Ls extends Command {
  static description = 'List running and stopped sandbox containers'

  async run(): Promise<void> {
    const docker = new SandboxDocker()
    const containers = await docker.listContainers()

    if (containers.length === 0) {
      this.log('No sandbox containers found.')
      return
    }

    // Header
    this.log(
      formatRow('NAME', 'REPO', 'STATUS', 'SSH PORT', 'CREATED'),
    )

    for (const c of containers) {
      this.log(
        formatRow(c.name, c.repo, c.status, String(c.sshPort), c.created),
      )
    }
  }
}

function formatRow(...cols: string[]): string {
  const widths = [30, 25, 12, 10, 25]
  return cols.map((col, i) => col.padEnd(widths[i] ?? 20)).join('')
}
```

- [ ] **Step 2: Write a basic test**

```typescript
// test/commands/ls.test.ts
import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('ls', () => {
  it('runs ls without error', async () => {
    const {error} = await runCommand('ls')
    expect(error).to.be.undefined
  })
})
```

- [ ] **Step 3: Run test**

```bash
npm run build && npm test -- --grep "ls"
```

Expected: PASS (will show "No sandbox containers found." if Docker is available and no containers exist, or fail gracefully).

- [ ] **Step 4: Commit**

```bash
git add src/commands/ls.ts test/commands/ls.test.ts
git commit -m "feat: add ls command to list sandbox containers"
```

---

### Task 13: commands/attach.ts

**Files:**
- Create: `src/commands/attach.ts`

- [ ] **Step 1: Write the attach command**

```typescript
// src/commands/attach.ts
import {Args, Command} from '@oclif/core'
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'

import {getConfigDir} from '../lib/config.js'
import {SandboxDocker} from '../lib/docker.js'

export default class Attach extends Command {
  static description = 'SSH into a sandbox container and attach to the Claude tmux session'

  static args = {
    name: Args.string({description: 'Container name', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Attach)
    const docker = new SandboxDocker()

    const containers = await docker.listContainers()
    const container = containers.find((c) => c.name === args.name)

    if (!container) {
      this.error(`Container "${args.name}" not found. Run "claude-sandbox ls" to see available containers.`)
    }

    if (container.status !== 'running') {
      this.error(`Container "${args.name}" is not running (status: ${container.status}).`)
    }

    const configDir = getConfigDir()
    const keyPath = join(configDir, 'ssh', 'id_ed25519')

    this.log(`Attaching to ${args.name} on port ${container.sshPort}...`)

    // Replace current process with SSH
    execFileSync('ssh', [
      '-i', keyPath,
      '-p', String(container.sshPort),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
      'claude@localhost',
      '-t', 'tmux attach -t claude',
    ], {stdio: 'inherit'})
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/attach.ts
git commit -m "feat: add attach command for SSH + tmux access"
```

---

### Task 14: commands/logs.ts

**Files:**
- Create: `src/commands/logs.ts`

- [ ] **Step 1: Write the logs command**

```typescript
// src/commands/logs.ts
import {Args, Command, Flags} from '@oclif/core'

import {SandboxDocker} from '../lib/docker.js'

export default class Logs extends Command {
  static description = 'Show tmux pane output from a sandbox container'

  static args = {
    name: Args.string({description: 'Container name', required: true}),
  }

  static flags = {
    follow: Flags.boolean({
      char: 'f',
      description: 'Poll for new output every 2 seconds',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Logs)
    const docker = new SandboxDocker()

    const capture = async (): Promise<string> => {
      return docker.execInContainer(args.name, [
        'tmux', 'capture-pane', '-t', 'claude', '-p', '-S', '-200',
      ])
    }

    if (flags.follow) {
      let lastOutput = ''
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const output = await capture()
        if (output !== lastOutput) {
          // Clear and reprint (simple approach)
          process.stdout.write('\x1B[2J\x1B[H')
          process.stdout.write(output)
          lastOutput = output
        }

        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    } else {
      const output = await capture()
      this.log(output)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/logs.ts
git commit -m "feat: add logs command with follow mode"
```

---

### Task 15: commands/stop.ts + rm.ts

**Files:**
- Create: `src/commands/stop.ts`, `src/commands/rm.ts`

- [ ] **Step 1: Write the stop command**

```typescript
// src/commands/stop.ts
import {Args, Command} from '@oclif/core'

import {SandboxDocker} from '../lib/docker.js'

export default class Stop extends Command {
  static description = 'Stop a sandbox container (keeps it for inspection)'

  static args = {
    name: Args.string({description: 'Container name', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Stop)
    const docker = new SandboxDocker()

    this.log(`Stopping ${args.name}...`)
    await docker.stopContainer(args.name)
    this.log(`Container ${args.name} stopped.`)
  }
}
```

- [ ] **Step 2: Write the rm command**

```typescript
// src/commands/rm.ts
import {Args, Command, Flags} from '@oclif/core'

import {SandboxDocker} from '../lib/docker.js'

export default class Rm extends Command {
  static description = 'Remove a sandbox container'

  static args = {
    name: Args.string({description: 'Container name', required: true}),
  }

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Force removal of running container',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Rm)
    const docker = new SandboxDocker()

    if (!flags.force) {
      const containers = await docker.listContainers()
      const container = containers.find((c) => c.name === args.name)
      if (container?.status === 'running') {
        this.error(`Container "${args.name}" is still running. Use --force or stop it first.`)
      }
    }

    this.log(`Removing ${args.name}...`)
    await docker.removeContainer(args.name)
    this.log(`Container ${args.name} removed.`)
  }
}
```

- [ ] **Step 3: Verify both compile**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/commands/stop.ts src/commands/rm.ts
git commit -m "feat: add stop and rm commands"
```

---

### Task 16: Packaging and Smoke Test

**Files:**
- Modify: `package.json` (add `files` field, verify bin config)

- [ ] **Step 1: Update package.json files field**

Ensure the `docker/` directory is included in the package so the build command can find the Dockerfile:

```json
{
  "files": [
    "./bin",
    "./dist",
    "./docker",
    "./oclif.manifest.json"
  ]
}
```

- [ ] **Step 2: Run full build and test suite**

```bash
npm run build && npm test
```

Expected: All tests pass.

- [ ] **Step 3: Link the CLI locally**

```bash
npm link
```

- [ ] **Step 4: Smoke test — build the Docker image**

```bash
claude-sandbox build
```

Expected: Docker image `claude-sandbox:latest` builds successfully.

- [ ] **Step 5: Smoke test — start a container**

```bash
claude-sandbox start \
  --repo <your-test-repo> \
  --prompt "List all files in the repo and describe the project structure" \
  --branch claude/smoke-test
```

Expected: Container starts, prints name and SSH port.

- [ ] **Step 6: Smoke test — list, logs, attach**

```bash
claude-sandbox ls
claude-sandbox logs <container-name>
claude-sandbox attach <container-name>
# Inside tmux: Ctrl-b d to detach
```

Expected: ls shows the container, logs shows tmux output, attach connects to tmux.

- [ ] **Step 7: Smoke test — stop and remove**

```bash
claude-sandbox stop <container-name>
claude-sandbox rm <container-name>
claude-sandbox ls
```

Expected: Container stopped, removed, ls shows empty.

- [ ] **Step 8: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "chore: packaging and smoke test fixes"
```

---

## Notes

- **`tar-fs` dependency**: `docker.ts` imports `tar-fs` for building Docker images. Add it in Task 1 or Task 9: `npm install tar-fs && npm install -D @types/tar-fs`.
- **Docker path resolution**: The `build` command resolves the `docker/` directory relative to the compiled JS. When installed via `npm link`, the symlink preserves the project root, so `../../docker` from `dist/commands/build.js` reaches `docker/`. If this breaks, switch to using `__dirname` resolution based on the package root.
- **Firewall domain resolution**: DNS results for domains like `api.anthropic.com` may change over time. The firewall is only initialized at container startup — long-running containers could lose connectivity if IPs change. Acceptable for v1.

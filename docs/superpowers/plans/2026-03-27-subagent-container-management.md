# Subagent Container Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `run` command that spawns containers and delegates monitoring to background Claude Code subagents.

**Architecture:** Extract shared spawn logic from `start` into `src/lib/spawn.ts`. New `run` command calls `spawnContainer()` for each target, then launches a background monitor subagent per container. The subagent polls tmux output, uses LLM reasoning to identify milestones, and reports back.

**Tech Stack:** TypeScript, oclif v4, dockerode v4, mocha + chai

---

### Task 1: Extract `resolveGitHubToken` to shared utility

The `start` command has a private `resolveGitHubToken` method. Both `start` and `run` need it, so extract it to a shared module.

**Files:**
- Create: `src/lib/github-token.ts`
- Create: `test/lib/github-token.test.ts`
- Modify: `src/commands/start.ts`

- [ ] **Step 1: Write the failing test**

Create `test/lib/github-token.test.ts`:

```typescript
import {expect} from 'chai'

import {resolveGitHubToken} from '../../src/lib/github-token.js'

describe('resolveGitHubToken', () => {
  it('returns config PAT when provided', async () => {
    const token = await resolveGitHubToken('ghp_configtoken')
    expect(token).to.equal('ghp_configtoken')
  })

  it('falls back to gh CLI when no config PAT', async () => {
    const exec = async (): Promise<string> => 'ghp_clitoken\n'
    const token = await resolveGitHubToken(undefined, exec)
    expect(token).to.equal('ghp_clitoken')
  })

  it('throws when no token available', async () => {
    const exec = async (): Promise<string> => { throw new Error('gh not found') }
    try {
      await resolveGitHubToken(undefined, exec)
      expect.fail('should have thrown')
    } catch (error: unknown) {
      expect((error as Error).message).to.include('No GitHub token found')
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha --require ts-node/esm "test/lib/github-token.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `resolveGitHubToken`**

Create `src/lib/github-token.ts`:

```typescript
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

type ExecFn = () => Promise<string>

async function defaultExec(): Promise<string> {
  const {stdout} = await execFileAsync('gh', ['auth', 'token'])
  return stdout
}

export async function resolveGitHubToken(configPat?: string, exec: ExecFn = defaultExec): Promise<string> {
  if (configPat) return configPat

  try {
    const output = await exec()
    const token = output.trim()
    if (token) return token
  } catch {
    // gh not available or not logged in
  }

  throw new Error('No GitHub token found. Set github_pat in config or run "gh auth login".')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha --require ts-node/esm "test/lib/github-token.test.ts"`
Expected: 3 passing

- [ ] **Step 5: Update `start.ts` to use shared `resolveGitHubToken`**

In `src/commands/start.ts`, remove the private `resolveGitHubToken` method and import from the shared module. Replace `this.resolveGitHubToken(config.githubPat)` with `resolveGitHubToken(config.githubPat)`. Wrap the call in a try/catch that calls `this.error()` on failure (to produce oclif-style error output).

Replace the import block and remove the private method:

```typescript
// src/commands/start.ts
import {Command, Flags} from '@oclif/core'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getConfigDir, loadConfig} from '../lib/config.js'
import {generateContainerName} from '../lib/container-name.js'
import {SandboxDocker} from '../lib/docker.js'
import {resolveGitHubToken} from '../lib/github-token.js'
import {buildPrompt} from '../lib/prompt-builder.js'
import {ensureSSHKeyPair} from '../lib/ssh.js'
```

In the `run()` method, replace:
```typescript
const githubToken = await this.resolveGitHubToken(config.githubPat)
```
with:
```typescript
let githubToken: string
try {
  githubToken = await resolveGitHubToken(config.githubPat)
} catch {
  this.error('No GitHub token found. Set github_pat in config or run "gh auth login".')
}
```

Delete the entire `private async resolveGitHubToken(...)` method at the bottom of the class.

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/github-token.ts test/lib/github-token.test.ts src/commands/start.ts
git commit -m "refactor: extract resolveGitHubToken to shared module"
```

---

### Task 2: Create `spawnContainer` shared function

Extract the container creation logic from `start.ts` into a reusable function.

**Files:**
- Create: `src/lib/spawn.ts`
- Create: `test/lib/spawn.test.ts`
- Modify: `src/commands/start.ts`

- [ ] **Step 1: Write the failing test**

Create `test/lib/spawn.test.ts`:

```typescript
import {expect} from 'chai'

import {spawnContainer, SpawnOptions} from '../../src/lib/spawn.js'

// Stub SandboxDocker
const fakeDocker = {
  createAndStartContainer: async (opts: Record<string, unknown>) => ({
    created: new Date().toISOString(),
    name: opts.name as string,
    repo: opts.repo as string,
    sshPort: opts.sshPort as number,
    status: 'running',
  }),
  findFreePort: async () => 2200,
}

// Stub prompt builder
const fakeExec = async (cmd: string, args: string[]): Promise<string> => {
  if (args.includes('issue') && args.includes('view')) {
    return JSON.stringify({body: 'Issue body', title: 'Issue title'})
  }

  throw new Error(`Unexpected: ${cmd} ${args.join(' ')}`)
}

describe('spawnContainer', () => {
  it('creates a container with prompt and returns info', async () => {
    const opts: SpawnOptions = {
      createPr: false,
      githubToken: 'ghp_test',
      prompt: 'Fix the bug',
      repo: 'org/repo',
    }
    const result = await spawnContainer(opts, {docker: fakeDocker as any, exec: fakeExec})
    expect(result.repo).to.equal('org/repo')
    expect(result.sshPort).to.equal(2200)
    expect(result.containerName).to.be.a('string')
    expect(result.containerName).to.include('claude-sandbox')
  })

  it('generates branch name when create-pr is set', async () => {
    const opts: SpawnOptions = {
      createPr: true,
      defaultBranchPrefix: 'claude/',
      githubToken: 'ghp_test',
      prompt: 'Fix it',
      repo: 'org/repo',
    }
    const result = await spawnContainer(opts, {docker: fakeDocker as any, exec: fakeExec})
    expect(result.branch).to.be.a('string')
    expect(result.branch).to.include('claude/')
  })

  it('uses explicit branch when provided', async () => {
    const opts: SpawnOptions = {
      branch: 'my-branch',
      createPr: true,
      githubToken: 'ghp_test',
      prompt: 'Fix it',
      repo: 'org/repo',
    }
    const result = await spawnContainer(opts, {docker: fakeDocker as any, exec: fakeExec})
    expect(result.branch).to.equal('my-branch')
  })

  it('builds prompt from issue number', async () => {
    const opts: SpawnOptions = {
      createPr: false,
      githubToken: 'ghp_test',
      issue: 42,
      repo: 'org/repo',
    }
    const result = await spawnContainer(opts, {docker: fakeDocker as any, exec: fakeExec})
    expect(result.containerName).to.include('claude-sandbox')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha --require ts-node/esm "test/lib/spawn.test.ts"`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `spawnContainer`**

Create `src/lib/spawn.ts`:

```typescript
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getConfigDir, loadConfig} from './config.js'
import {generateContainerName} from './container-name.js'
import {SandboxDocker} from './docker.js'
import {buildPrompt, type PromptSource} from './prompt-builder.js'
import {ensureSSHKeyPair} from './ssh.js'

export interface SpawnOptions {
  branch?: string
  createPr: boolean
  defaultBranchPrefix?: string
  githubToken: string
  image?: string
  issue?: number
  name?: string
  pr?: number
  prompt?: string
  repo: string
  sshPortRange?: [number, number]
}

export interface SpawnResult {
  branch?: string
  containerName: string
  repo: string
  sshPort: number
}

export interface SpawnDeps {
  docker: SandboxDocker
  exec?: (cmd: string, args: string[]) => Promise<string>
}

export async function spawnContainer(opts: SpawnOptions, deps?: Partial<SpawnDeps>): Promise<SpawnResult> {
  const config = await loadConfig()
  const configDir = getConfigDir()
  const image = opts.image ?? config.image
  const portRange = opts.sshPortRange ?? config.sshPortRange
  const branchPrefix = opts.defaultBranchPrefix ?? config.defaultBranchPrefix

  // Build prompt
  const source: PromptSource = {
    issue: opts.issue,
    pr: opts.pr,
    prompt: opts.prompt,
    repo: opts.repo,
  }
  const prompt = await buildPrompt(source, deps?.exec, {createPr: opts.createPr})

  // Ensure SSH keypair
  const keys = await ensureSSHKeyPair(configDir)

  // Generate container name
  const containerName = generateContainerName(opts.repo, opts.name)

  // Resolve branch
  let branch = opts.branch
  if (!branch && opts.createPr) {
    branch = `${branchPrefix}${containerName}`
  }

  // Find free port and create container
  const docker = deps?.docker ?? new SandboxDocker()
  const sshPort = await docker.findFreePort(portRange[0], portRange[1])

  await docker.createAndStartContainer({
    branch,
    claudeConfigDir: join(homedir(), '.claude'),
    claudeConfigFile: join(homedir(), '.claude.json'),
    createPr: opts.createPr,
    githubToken: opts.githubToken,
    image,
    name: containerName,
    prompt,
    repo: opts.repo,
    sshPort,
    sshPublicKeyPath: keys.publicKeyPath,
  })

  return {
    branch,
    containerName,
    repo: opts.repo,
    sshPort,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx mocha --require ts-node/esm "test/lib/spawn.test.ts"`
Expected: 4 passing

- [ ] **Step 5: Refactor `start.ts` to use `spawnContainer`**

Replace the body of `start.ts`'s `run()` method. The command becomes a thin wrapper:

```typescript
// src/commands/start.ts
import {Command, Flags} from '@oclif/core'

import {loadConfig} from '../lib/config.js'
import {resolveGitHubToken} from '../lib/github-token.js'
import {spawnContainer} from '../lib/spawn.js'

export default class Start extends Command {
  static description = 'Start a new Claude sandbox container'
  static flags = {
    branch: Flags.string({
      char: 'b',
      description: 'Git branch to create or checkout',
    }),
    'create-pr': Flags.boolean({
      default: false,
      description: 'Create a PR when Claude finishes',
    }),
    issue: Flags.integer({
      char: 'i',
      description: 'GitHub issue number to fetch as context',
    }),
    name: Flags.string({
      description: 'Container name (auto-generated if omitted)',
    }),
    pr: Flags.integer({
      description: 'GitHub PR number to fetch as context',
    }),
    prompt: Flags.string({
      char: 'p',
      description: 'Prompt for Claude',
    }),
    repo: Flags.string({
      char: 'r',
      description: 'GitHub repo (org/name)',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Start)
    const config = await loadConfig()

    if (!flags.prompt && !flags.issue && !flags.pr) {
      this.error('Provide at least one of --prompt, --issue, or --pr')
    }

    let githubToken: string
    try {
      githubToken = await resolveGitHubToken(config.githubPat)
    } catch {
      this.error('No GitHub token found. Set github_pat in config or run "gh auth login".')
    }

    this.log('Starting container...')

    const result = await spawnContainer({
      branch: flags.branch,
      createPr: flags['create-pr'],
      githubToken,
      issue: flags.issue,
      name: flags.name,
      pr: flags.pr,
      prompt: flags.prompt,
      repo: flags.repo,
    })

    this.log('')
    this.log(`Container started: ${result.containerName}`)
    this.log(`  Repo:     ${result.repo}`)
    this.log(`  SSH port: ${result.sshPort}`)
    this.log(`  Attach:   claude-sandbox attach ${result.containerName}`)
    this.log(`  Logs:     claude-sandbox logs ${result.containerName}`)
  }
}
```

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/spawn.ts test/lib/spawn.test.ts src/commands/start.ts
git commit -m "refactor: extract spawnContainer to shared module"
```

---

### Task 3: Create the `run` command

The new high-level command that spawns containers and launches monitor subagents.

**Files:**
- Create: `src/commands/run.ts`
- Create: `test/commands/run.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/commands/run.test.ts`:

```typescript
import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('run', () => {
  it('shows help text with expected flags', async () => {
    const {stdout} = await runCommand('run --help')
    expect(stdout).to.include('--repo')
    expect(stdout).to.include('--issue')
    expect(stdout).to.include('--prompt')
  })

  it('errors when no repo provided', async () => {
    const {error} = await runCommand('run --prompt "test"')
    expect(error?.message).to.include('Missing required flag repo')
  })

  it('errors when no prompt source provided', async () => {
    const {error} = await runCommand('run --repo org/repo')
    expect(error?.message).to.include('at least one of')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx mocha --require ts-node/esm "test/commands/run.test.ts"`
Expected: FAIL — command not found

- [ ] **Step 3: Implement the `run` command**

Create `src/commands/run.ts`:

```typescript
// src/commands/run.ts
import {Command, Flags} from '@oclif/core'

import {loadConfig} from '../lib/config.js'
import {resolveGitHubToken} from '../lib/github-token.js'
import {spawnContainer, type SpawnResult} from '../lib/spawn.js'

export default class Run extends Command {
  static description = 'Start sandbox containers with background monitoring via Claude Code subagents'
  static flags = {
    branch: Flags.string({
      char: 'b',
      description: 'Git branch (single container only)',
    }),
    'create-pr': Flags.boolean({
      default: false,
      description: 'Create a PR when Claude finishes',
    }),
    issue: Flags.integer({
      char: 'i',
      description: 'GitHub issue number(s)',
      multiple: true,
    }),
    name: Flags.string({
      description: 'Container name (single container only)',
    }),
    pr: Flags.integer({
      description: 'GitHub PR number(s)',
      multiple: true,
    }),
    prompt: Flags.string({
      char: 'p',
      description: 'Prompt for Claude',
    }),
    repo: Flags.string({
      char: 'r',
      description: 'GitHub repo (org/name)',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Run)
    const config = await loadConfig()

    // Collect targets: each issue/PR is a separate container, prompt is one container
    const targets = this.buildTargets(flags)
    if (targets.length === 0) {
      this.error('Provide at least one of --prompt, --issue, or --pr')
    }

    // Validate single-container flags
    if (targets.length > 1 && (flags.branch || flags.name)) {
      this.error('--branch and --name can only be used with a single target')
    }

    // Resolve shared resources once
    let githubToken: string
    try {
      githubToken = await resolveGitHubToken(config.githubPat)
    } catch {
      this.error('No GitHub token found. Set github_pat in config or run "gh auth login".')
    }

    // Spawn all containers concurrently
    this.log(`Spawning ${targets.length} container${targets.length > 1 ? 's' : ''}...`)

    const results = await Promise.allSettled(
      targets.map((target) =>
        spawnContainer({
          branch: flags.branch,
          createPr: flags['create-pr'],
          githubToken,
          issue: target.issue,
          name: flags.name,
          pr: target.pr,
          prompt: target.prompt,
          repo: flags.repo,
        }),
      ),
    )

    // Report results and collect successful spawns
    const spawned: SpawnResult[] = []
    for (const [i, result] of results.entries()) {
      const target = targets[i]
      const label = target.issue ? `issue #${target.issue}` : target.pr ? `PR #${target.pr}` : 'prompt'

      if (result.status === 'fulfilled') {
        spawned.push(result.value)
        this.log(`  [ok] ${result.value.containerName} (${label})`)
      } else {
        this.log(`  [fail] ${label}: ${result.reason}`)
      }
    }

    if (spawned.length === 0) {
      this.error('All containers failed to start')
    }

    // Print monitoring instructions
    this.log('')
    this.log('Containers are running. Monitor subagents will report milestones.')
    this.log('You can also use these commands manually:')
    for (const s of spawned) {
      this.log(`  logs:   claude-sandbox logs ${s.containerName}`)
      this.log(`  attach: claude-sandbox attach ${s.containerName}`)
    }

    // Print subagent launch instructions for Claude Code
    this.log('')
    this.log('--- MONITOR SUBAGENT INSTRUCTIONS ---')
    for (const s of spawned) {
      this.log(JSON.stringify(this.buildMonitorPrompt(s)))
    }
  }

  private buildMonitorPrompt(result: SpawnResult): {containerName: string; prompt: string} {
    return {
      containerName: result.containerName,
      prompt: [
        `Monitor the Docker container "${result.containerName}" (repo: ${result.repo}).`,
        '',
        'Your job:',
        '1. Every 10 seconds, run this command inside the container to capture tmux output:',
        `   execInContainer("${result.containerName}", ["tmux", "capture-pane", "-t", "claude", "-p", "-S", "-500"])`,
        '2. Read the output and identify milestone events:',
        '   - Repository cloned',
        '   - Tests running / passing / failing',
        '   - Commits made',
        '   - PR created (extract the URL)',
        '   - Claude finished or errored',
        '3. Report each milestone to the user ONCE (no duplicates).',
        `4. Also check for completion: execInContainer("${result.containerName}", ["cat", "/workspace/.claude-done"])`,
        '   If the file exists, Claude is done. Read the exit code from its contents.',
        '5. On completion, report:',
        '   - Exit code (0 = success)',
        '   - PR URL if one was created',
        '   - Brief summary of what happened',
        '   Then ask the user: "Keep or clean up this container?"',
        '',
        'Error handling:',
        '- If execInContainer fails, retry up to 3 consecutive times before reporting a problem.',
        '- A single successful poll resets the failure counter.',
        '',
        'Use the Bash tool to run: claude-sandbox logs <name> for tmux capture,',
        'and claude-sandbox stop <name> / claude-sandbox rm <name> if the user asks to clean up.',
      ].join('\n'),
    }
  }

  private buildTargets(flags: {issue?: number[]; pr?: number[]; prompt?: string}): Array<{issue?: number; pr?: number; prompt?: string}> {
    const targets: Array<{issue?: number; pr?: number; prompt?: string}> = []

    if (flags.prompt) {
      targets.push({prompt: flags.prompt})
    }

    if (flags.issue) {
      for (const issue of flags.issue) {
        targets.push({issue})
      }
    }

    if (flags.pr) {
      for (const pr of flags.pr) {
        targets.push({pr})
      }
    }

    return targets
  }
}
```

- [ ] **Step 4: Build and run tests**

Run: `npm run build && npx mocha --require ts-node/esm "test/commands/run.test.ts"`
Expected: 3 passing

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/commands/run.ts test/commands/run.test.ts
git commit -m "feat: add run command with parallel spawn and monitor prompt generation"
```

---

### Task 4: Wire up monitor subagent launching

The `run` command currently prints monitor prompts as JSON. This task makes it actually usable by Claude Code — when the `run` command is invoked as a plugin command within a Claude Code session, the calling agent reads the output and launches subagents. This task adds a `delegate` skill that Claude Code invokes, which calls `run` and then launches the subagents.

**Files:**
- Create: `skills/run/run.md`

- [ ] **Step 1: Create the `run` skill**

Create `skills/run/run.md`:

```markdown
---
name: run
description: Delegate work to sandbox containers with automatic monitoring. Use when the user asks to run issues, PRs, or prompts in sandbox containers.
---

## How to use

1. Run the `claude-sandbox run` command with the user's flags (--repo, --issue, --pr, --prompt, --create-pr, --branch, --name).
2. Parse the JSON monitor instructions from the output (lines after "--- MONITOR SUBAGENT INSTRUCTIONS ---").
3. For each monitor instruction, launch a background subagent using the Agent tool with `run_in_background: true`:
   - Pass the `prompt` field as the agent's prompt
   - The agent will monitor the container and report milestones
4. Tell the user which containers are running and that they'll receive milestone updates.

### Example

User: "Run issue #5 on org/repo"

```bash
claude-sandbox run --repo org/repo --issue 5 --create-pr
```

Then parse the monitor JSON from stdout and launch background agents.

### Cleanup

When a monitor agent reports completion and asks "keep or clean up?":
- If user says clean up: run `claude-sandbox stop <name> && claude-sandbox rm <name>`
- If user says keep: do nothing, container stays for inspection
```

- [ ] **Step 2: Verify skill is discoverable**

Run: `ls skills/run/run.md`
Expected: File exists

- [ ] **Step 3: Commit**

```bash
git add skills/run/run.md
git commit -m "feat: add run skill for Claude Code subagent orchestration"
```

---

### Task 5: Build and verify end-to-end

**Files:**
- None new — verification only

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass, lint passes

- [ ] **Step 3: Verify `run` command appears in help**

Run: `./bin/run.js run --help`
Expected: Shows description, all flags (--repo, --issue, --pr, --prompt, --create-pr, --branch, --name)

- [ ] **Step 4: Verify `start` command still works**

Run: `./bin/run.js start --help`
Expected: Shows same flags as before, no changes to interface

- [ ] **Step 5: Commit any fixes if needed**

Only if previous steps revealed issues. Otherwise skip.

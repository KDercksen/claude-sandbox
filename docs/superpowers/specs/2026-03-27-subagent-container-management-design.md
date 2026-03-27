# Subagent Container Management

**Date:** 2026-03-27
**Issue:** #3 — Move container spawning and monitoring to a subagent

## Problem

Container spawning, monitoring, and lifecycle management currently runs on the main thread in the `start` command, blocking the CLI during Docker operations. There's no way to launch multiple containers in parallel, and no autonomous monitoring of container progress.

## Solution

Add a new `run` command that handles container creation directly (it's fast) and delegates long-running monitoring to background Claude Code subagents. Each container gets its own monitor subagent that reads tmux output, identifies milestones, and reports back to the user.

## Architecture

### Approach: Orchestrator command + monitor subagents

The `run` command handles spawning (seconds of async work) and launches background monitor subagents for the long-running monitoring phase. This keeps spawning simple while putting the subagent where LLM intelligence adds value — parsing tmux output and deciding what's noteworthy.

```
User: claude-sandbox run --repo org/repo --issue 1 --issue 2

┌─────────────────────────────────────────────────────┐
│ run command                                          │
│                                                      │
│  1. Resolve shared resources (token, SSH key)        │
│  2. spawnContainer() × N  (concurrent)               │
│  3. Launch monitor subagent × N  (background)        │
│  4. Return summary to user                           │
└─────────────────────────────────────────────────────┘
         │                            │
         ▼                            ▼
┌─────────────────┐        ┌─────────────────┐
│ Monitor Agent 1  │        │ Monitor Agent 2  │
│ (background)     │        │ (background)     │
│                  │        │                  │
│ Loop:            │        │ Loop:            │
│  - capture tmux  │        │  - capture tmux  │
│  - identify      │        │  - identify      │
│    milestones    │        │    milestones    │
│  - report back   │        │  - report back   │
│  - check .done   │        │  - check .done   │
│                  │        │                  │
│ On complete:     │        │ On complete:     │
│  - final summary │        │  - final summary │
│  - ask: keep or  │        │  - ask: keep or  │
│    clean up?     │        │    clean up?     │
└─────────────────┘        └─────────────────┘
```

## New Files

### `src/lib/spawn.ts` — Shared container creation logic

Extracted from the current `start` command to avoid duplication. Both `run` and `start` call this.

```typescript
interface SpawnOptions {
  repo: string
  prompt?: string
  issue?: number
  pr?: number
  branch?: string
  name?: string
  createPr: boolean
  githubToken: string
  sshKeyPath: string
}

interface ContainerResult {
  containerName: string
  sshPort: number
  repo: string
  branch?: string
}

export async function spawnContainer(opts: SpawnOptions): Promise<ContainerResult>
```

The function handles: prompt building, container name generation, free port discovery, and `docker.createAndStartContainer()`.

### `src/commands/run.ts` — High-level orchestrated command

Accepts the same flags as `start` plus support for multiple targets:

- `--repo` (required): target repository
- `--prompt`: explicit prompt text
- `--issue` (multiple): one or more GitHub issue numbers
- `--pr` (multiple): one or more PR numbers
- `--branch`: branch name (single container only)
- `--name`: container name (single container only)
- `--create-pr`: whether to create PRs

**Flow:**

1. Validate flags, resolve GitHub token and SSH keypair once upfront
2. For each target, call `spawnContainer()` concurrently via `Promise.all`
3. For each successfully started container, launch a background monitor subagent
4. Return immediately with a summary of launched containers

### Monitor Subagent

Launched via Claude Code's `Agent` tool with `run_in_background: true`. One subagent per container.

**Input:** Container name, repo, whether a PR is expected.

**Monitoring loop (~10 second interval):**

1. Capture tmux output: `execInContainer(name, ['tmux', 'capture-pane', '-t', 'claude', '-p', '-S', '-500'])`
2. LLM reads the output and identifies milestone events:
   - Repository cloned
   - Tests running / passing / failing
   - Commits made
   - PR created (extract URL)
   - Claude finished or errored
3. Report each milestone to the user once (no duplicates)
4. Poll for `.claude-done` file to detect completion

**On completion:**
- Report final status: exit code, PR URL (if any), summary of work done
- Ask the user whether to keep or clean up the container

**What the subagent does NOT do:**
- Create or start containers (already done by `run`)
- Stream continuous output (only discrete milestones)
- Make cleanup decisions autonomously (asks the user)

## Modified Files

### `src/commands/start.ts`

Refactored to call `spawnContainer()` from `src/lib/spawn.ts` instead of inlining the creation logic. External behavior is unchanged.

## Unchanged Files

- All other commands: `logs.ts`, `attach.ts`, `stop.ts`, `rm.ts`, `ls.ts`, `build.ts`
- `src/lib/docker.ts` — `SandboxDocker` class unchanged
- All Docker-side files: `entrypoint.sh`, `claude-wrapper.sh`, `init-firewall.sh`, `Dockerfile`
- Config, container naming, SSH utilities

## Error Handling

**Container spawn failures:** If a container fails to start (image missing, port exhaustion, Docker down), `run` reports the error for that container and continues spawning the rest. No monitor subagent is launched for failed containers.

**Monitor subagent failures:** If a subagent crashes, the container keeps running — it's just Docker. The user falls back to manual commands (`logs`, `attach`, `stop`, `rm`). No automatic restart of subagents.

**Container crashes:** The monitor subagent detects this when `execInContainer` fails. It reports the failure and offers cleanup.

**Transient Docker API errors:** Up to 3 consecutive exec failures are tolerated before the subagent reports a problem. A single successful poll resets the counter.

**Philosophy:** The monitor subagent is a convenience layer. The underlying system (Docker containers + low-level commands) remains fully functional without it.

## Testing

- `test/lib/spawn.test.ts` — Unit tests for `spawnContainer()` (stub Docker interactions)
- `test/commands/run.test.ts` — Command tests for `run` (verify spawn calls, subagent launches)
- Existing `start` command tests must keep passing after the refactor

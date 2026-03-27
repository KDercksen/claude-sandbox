# Architecture

## Overview

Three-layer architecture:

- **CLI layer** (`src/commands/`) — user-facing commands, flag parsing, output formatting
- **Lib layer** (`src/lib/`) — business logic: Docker operations, config, prompt building, SSH, naming
- **Docker layer** (`docker/`) — container image, entrypoint, firewall rules, Claude wrapper

---

## Component Map

### Commands

| File | Responsibility |
|------|---------------|
| `src/commands/start.ts` | Orchestrates container launch: validates flags, builds prompt, resolves token, generates name, finds port, calls `SandboxDocker.createAndStartContainer()` |
| `src/commands/attach.ts` | Looks up container SSH port, replaces current process with `ssh ... tmux attach -t claude` via `execFileSync` |
| `src/commands/ls.ts` | Queries Docker for labeled containers, formats table output |
| `src/commands/logs.ts` | Runs `tmux capture-pane -t claude -p -S -200` via `execInContainer`; optional 2-second polling loop with screen-clear on change |
| `src/commands/build.ts` | Tar-streams the `docker/` directory to the Docker build API |
| `src/commands/stop.ts` | Graceful container stop (ignores 304 "already stopped") |
| `src/commands/rm.ts` | Container removal; requires `--force` to remove running containers |

### Lib

| File | Responsibility |
|------|---------------|
| `src/lib/docker.ts` | `SandboxDocker` class wrapping dockerode: `buildImage`, `createAndStartContainer`, `execInContainer`, `listContainers`, `stopContainer`, `removeContainer`, `findFreePort` |
| `src/lib/config.ts` | Loads/saves `~/.claude-sandbox/config.json`, merges user overrides with defaults |
| `src/lib/prompt-builder.ts` | Assembles prompt from `--prompt`, `--issue`, `--pr` flags; fetches issue/PR content via `gh` CLI; prepends default instruction when no explicit `--prompt` |
| `src/lib/ssh.ts` | Ensures Ed25519 keypair exists at `~/.claude-sandbox/ssh/id_ed25519` |
| `src/lib/container-name.ts` | Generates `claude-sandbox-{repo}-{hex}` names, or `claude-sandbox-{sanitized-name}` when `--name` is provided |

### Docker

| File | Responsibility |
|------|---------------|
| `docker/Dockerfile` | Debian Bookworm + Node 20 base; installs git, openssh-server, tmux, gh, iptables/ipset, uv, Claude Code npm package; creates `claude` user with passwordless sudo |
| `docker/entrypoint.sh` | Startup sequence: firewall init → sshd → copy read-only mounts → configure git credentials → gh auth → clone repo → checkout/create branch → launch Claude in tmux → `tail -f /dev/null` keepalive |
| `docker/init-firewall.sh` | Configures iptables/ipset rules to restrict outbound network access |
| `docker/claude-wrapper.sh` | Runs `claude --dangerously-skip-permissions -p "$PROMPT"`; on exit: commits uncommitted changes, pushes branch, optionally creates PR via `gh pr create`, writes `/workspace/.claude-done`, drops into a shell to keep tmux session open |

---

## Container Lifecycle

### 1. Build
`build` command tar-streams the `docker/` directory to the Docker daemon build API. The resulting image tag defaults to `claude-sandbox:latest` (configurable).

### 2. Create
`start` command calls `SandboxDocker.createAndStartContainer()` which creates the container with:
- **Env vars:** `REPO`, `PROMPT`, `GITHUB_TOKEN`, `CREATE_PR`, `BRANCH` (optional)
- **Read-only mounts:**
  - `~/.claude` → `/home/claude/.claude.host:ro`
  - `~/.claude.json` → `/home/claude/.claude.json.host:ro`
  - `~/.claude-sandbox/ssh/id_ed25519.pub` → `/home/claude/.ssh/authorized_keys:ro`
- **Capabilities:** `NET_ADMIN`, `NET_RAW` (required for iptables)
- **Port binding:** random host port in configured range → container port 22
- **Labels:** `app=claude-sandbox`, `claude-sandbox.repo`, `claude-sandbox.ssh-port`

### 3. Boot (entrypoint.sh)
1. Run `init-firewall.sh` via sudo
2. Start `sshd`
3. Copy read-only mounted Claude config to writable paths (`/home/claude/.claude/`, `/home/claude/.claude.json`), fix ownership
4. Configure git credentials using `GITHUB_TOKEN`; set git user name/email
5. Authenticate `gh` CLI
6. Clone `https://github.com/$REPO.git` to `/workspace`
7. Checkout or create `$BRANCH` if set
8. Launch `claude-wrapper.sh` in a detached tmux session named `claude`
9. `exec tail -f /dev/null` — keeps container alive after Claude exits

### 4. Run (claude-wrapper.sh)
1. Run `claude --dangerously-skip-permissions -p "$PROMPT"` in `/workspace`
2. If uncommitted changes remain: `git add -A && git commit`
3. If `$BRANCH` set: `git push -u origin $BRANCH`
4. If `CREATE_PR=true` and branch set: `gh pr create --title "Claude Sandbox: $BRANCH"`
5. Write exit code to `/workspace/.claude-done`
6. `exec bash` — keeps tmux session open for inspection

### 5. Monitor
- `logs` command: runs `tmux capture-pane` via Docker exec; `--follow` polls every 2 seconds
- `attach` command: SSH into the container and attach to the tmux session

### 6. Cleanup
`stop` then `rm` — or `rm` alone (uses `force: true`).

---

## Data Flow for `start`

```
Flags parsed
  → buildPrompt()           # fetches issue/PR body via gh CLI, assembles prompt string
  → resolveGitHubToken()    # config.githubPat or `gh auth token`
  → ensureSSHKeyPair()      # creates ~/.claude-sandbox/ssh/ keypair if absent
  → generateContainerName() # claude-sandbox-{repo}-{hex}
  → auto-generate branch    # if --create-pr and no --branch: claude-sandbox-{prefix}{name}
  → findFreePort()          # shuffles port range, probes with net.createServer()
  → createAndStartContainer() # creates + starts Docker container with env, mounts, caps, labels
  → print attach/logs hints
```

---

## Key Design Decisions

**Single shared SSH keypair** — one keypair at `~/.claude-sandbox/ssh/` is reused across all containers. Simplicity over per-container isolation; containers are ephemeral and already isolated by Docker.

**tmux for session persistence** — Claude runs inside a named tmux session (`claude`). Survives SSH disconnects. Enables `logs` to capture pane output without an active SSH connection.

**Docker labels for discovery** — `app=claude-sandbox` label filters containers in `ls`. `claude-sandbox.repo` and `claude-sandbox.ssh-port` are stored as labels so the CLI can reconstruct `ContainerInfo` without external state.

**Randomized port allocation** — `findFreePort` shuffles the candidate range before probing. Reduces collision probability when multiple containers are launched in parallel.

**Read-only mounts + copy** — host Claude config and SSH authorized_keys are mounted read-only. The entrypoint copies them to writable paths. This prevents the container from modifying host files while still sharing credentials.

**`tail -f /dev/null` keepalive** — after the entrypoint completes setup and launches Claude in tmux, the container process becomes `tail -f /dev/null`. The container stays alive for SSH access and inspection after Claude finishes.

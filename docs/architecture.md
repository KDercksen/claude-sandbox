# Architecture

## Overview

Two-layer architecture:

- **CLI layer** (`claude-sandbox`) — single bash script: flag parsing, prompt building, container spawning
- **Docker layer** (`docker/`) — container image, entrypoint, firewall rules, Claude wrapper

Post-launch container management uses `docker` directly (no CLI wrapper needed).

---

## Component Map

### CLI Script

| Function | Responsibility |
|----------|---------------|
| `build_prompt()` | Assembles prompt from `--prompt`, `--issue`, `--pr` flags; fetches issue/PR content via `gh` CLI; appends git workflow and progress update instructions |
| `spawn_container()` | Resolves token, generates name, builds docker run args, launches container |
| `cmd_run()` | Orchestrates multi-target spawning: parses flags, iterates targets, spawns containers, prints monitor subagent instructions as JSON |
| `cmd_build()` | Builds the Docker image from `docker/` directory |
| `build_monitor_prompt()` | Generates the polling instructions for a monitor subagent (uses `docker exec` only) |
| `generate_container_name()` | Generates `claude-sandbox-{repo}-{hex}` names, or `claude-sandbox-{sanitized}` when `--name` is provided |

### Docker

| File | Responsibility |
|------|---------------|
| `docker/Dockerfile` | Node 20 (Bookworm) base; installs git, gh, iptables/ipset, uv, Claude Code; creates `claude` user with restricted sudo |
| `docker/entrypoint.sh` | Startup sequence: firewall init → copy read-only mounts → configure git credentials → gh auth → clone repo → checkout/create branch → launch Claude wrapper → `tail -f /dev/null` keepalive |
| `docker/init-firewall.sh` | Configures iptables/ipset rules to restrict outbound network access to GitHub + Anthropic + package registries only |
| `docker/claude-wrapper.sh` | Runs `claude --dangerously-skip-permissions -p "$PROMPT"`; on exit: commits uncommitted changes, pushes branch, optionally creates PR via `gh pr create`, writes exit code to `/workspace/.claude-done` |

---

## Container Lifecycle

### 1. Build
`build` command runs `docker build` on the `docker/` directory. Image tag defaults to `claude-sandbox:latest` (configurable).

### 2. Create
`run` command calls `spawn_container()` which creates the container with:
- **Env vars:** `REPO`, `PROMPT`, `GITHUB_TOKEN`, `CREATE_PR`, `BRANCH` (optional), `EXTRA_ALLOWED_DOMAINS` (optional)
- **Read-only mounts:**
  - `~/.claude` → `/home/claude/.claude.host:ro`
  - `~/.claude.json` → `/home/claude/.claude.json.host:ro`
- **Capabilities:** `NET_ADMIN`, `NET_RAW` (required for iptables)
- **Labels:** `app=claude-sandbox`, `claude-sandbox.repo`

### 3. Boot (entrypoint.sh)
1. Run `init-firewall.sh` via sudo
2. Copy read-only mounted Claude config to writable paths, fix ownership
3. Configure git credentials using `GITHUB_TOKEN`; set git user name/email
4. Authenticate `gh` CLI
5. Clone `https://github.com/$REPO.git` to `/workspace`
6. Checkout or create `$BRANCH` if set
7. Launch `claude-wrapper.sh` in background, logging to `/workspace/.claude-log`
8. `exec tail -f /dev/null` — keeps container alive after Claude exits

### 4. Run (claude-wrapper.sh)
1. Run `claude --dangerously-skip-permissions -p "$PROMPT"` in `/workspace`
2. If uncommitted changes remain: `git add -A && git commit`
3. If `$BRANCH` set: `git push -u origin $BRANCH`
4. If `CREATE_PR=true` and branch set: `gh pr create`
5. Write exit code to `/workspace/.claude-done`

### 5. Monitor
Monitor subagents poll via `docker exec`:
- `docker exec <name> cat /workspace/.claude-progress` — progress updates
- `docker exec <name> cat /workspace/.claude-done` — completion marker
- `docker exec -it <name> bash` — shell access for inspection

### 6. Cleanup
`docker stop <name> && docker rm <name>`

---

## Data Flow for `run`

```
Flags parsed
  → build_prompt()           # fetches issue/PR body via gh CLI, assembles prompt string
  → resolve_github_token()   # config.githubPat or `gh auth token`
  → generate_container_name() # claude-sandbox-{repo}-{hex}
  → auto-generate branch     # if --create-pr and no --branch
  → spawn_container()        # creates + starts Docker container
  → build_monitor_prompt()   # generates docker-exec-based polling instructions
  → output JSON per container for subagent launch
```

---

## Key Design Decisions

**Docker labels for discovery** — `app=claude-sandbox` label filters containers. `claude-sandbox.repo` is stored as a label for identification.

**`docker exec` for all access** — no SSH server in the container. Shell access, log reading, and completion checking all use `docker exec`. This simplifies the image, removes port allocation, and avoids permission issues with SSH keypair management.

**Read-only mounts + copy** — host Claude config is mounted read-only. The entrypoint copies to writable paths. This prevents the container from modifying host files while still sharing credentials.

**`tail -f /dev/null` keepalive** — after setup and Claude launch, the container process becomes `tail -f /dev/null`. The container stays alive for `docker exec` access and inspection after Claude finishes.

**File-based progress** — Claude writes `@@UPDATE(...)` lines to `/workspace/.claude-progress`. Monitor subagents poll this file via `docker exec`. Completion is signaled by `/workspace/.claude-done` containing the exit code.

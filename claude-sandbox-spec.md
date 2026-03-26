# Claude Sandbox — Design Spec

**Date:** 2026-03-26
**Status:** Draft

## Overview

A CLI tool (`claude-sandbox`) and Docker image for running Claude Code in isolated, disposable containers. The goal is to safely let Claude work autonomously on issues/PRs with `--dangerously-skip-permissions` enabled, without risking the host system. Containers can be launched manually or from within another Claude session.

## Goals

- **Isolation:** Claude runs in a sandboxed Docker container with network-hardened egress rules — no access to host env vars, filesystems, or arbitrary internet endpoints
- **Autonomy:** Claude operates with full permissions inside the container (file edits, bash commands, git operations) without human approval prompts
- **Skill parity:** The container replicates the user's local Claude skills/plugins setup by mounting `~/.claude` read-only
- **Observability:** SSH into running containers and attach to the tmux session to watch or intervene; get notified when Claude finishes
- **Composability:** Launchable from the terminal or from within another Claude session as a bash command

## Non-Goals (v1)

- Web UI or dashboard
- Multi-user / team support
- Automatic GitHub webhook triggers
- Persistent workspaces across container restarts
- GitHub App integration (using fine-grained PAT instead)

## Architecture

```
Host Machine
├── claude-sandbox CLI (Node.js)
│   ├── start — spin up container with task
│   ├── ls — list running workers
│   ├── attach — SSH + tmux attach
│   ├── logs — stream tmux output
│   ├── stop / rm — lifecycle management
│   └── build — rebuild Docker image
│
├── ~/.claude (mounted read-only into containers)
│   ├── plugins/
│   ├── settings.json
│   └── .credentials.json
│
└── Docker
    └── claude-sandbox image
        ├── Node.js 20 LTS + Python 3.11+
        ├── Claude Code CLI
        ├── iptables firewall (allowlist)
        ├── SSH server + tmux
        └── Non-root "claude" user
```

## Docker Image

### Base & Tooling

- **Base image:** `node:20`
- **Added runtimes:** Python 3.11+ (via deadsnakes or system packages)
- **System packages:** git, curl, build-essential, jq, openssh-server, tmux, gh (GitHub CLI), iptables, ipset, iproute2, dnsutils, aggregate, sudo
- **Claude Code:** Installed via `curl -fsSL https://claude.ai/install.sh | bash`
- **User:** Non-root `claude` user with sudo access only for firewall init

### Network Hardening

Based on [Anthropic's reference devcontainer](https://github.com/anthropics/claude-code/tree/main/.devcontainer).

The container runs with `--cap-add=NET_ADMIN --cap-add=NET_RAW` (network config only — no other privilege escalation).

At startup, `init-firewall.sh` runs:

1. Flush all iptables rules, preserve Docker internal DNS
2. Allow DNS (udp/53), SSH (tcp/22), and localhost
3. Create an ipset allowlist (`hash:net`)
4. Fetch GitHub IP ranges dynamically from `api.github.com/meta`
5. Resolve and add allowed domains:
   - `api.anthropic.com` — Claude API
   - `registry.npmjs.org` — npm
   - `pypi.org`, `files.pythonhosted.org` — pip
   - `github.com`, `api.github.com` — git + PR operations
   - `sentry.io`, `statsig.anthropic.com`, `statsig.com` — Claude telemetry
6. Allow host network (for Docker bridge communication)
7. Set default policy to **DROP**
8. Verify: confirm `example.com` is blocked, `api.github.com` is reachable

### Mounts & Credentials

| Mount / Env | Source | Target | Mode |
|---|---|---|---|
| `~/.claude` | Host | `/home/claude/.claude` | Read-only |
| GitHub PAT | Env var at launch | `GITHUB_TOKEN` | Runtime only |
| Claude credentials | From `~/.claude/.credentials.json` | Mounted via `~/.claude` | Read-only |

No host environment variables are passed through. Only `GITHUB_TOKEN` is injected explicitly.

## CLI Tool (`claude-sandbox`)

Node.js CLI installed globally or linked from a project directory.

### Commands

#### `claude-sandbox start`

```bash
claude-sandbox start \
  --name fix-auth-bug \
  --repo org/repo \
  --prompt "Fix the authentication bug described in issue #42" \
  [--branch feature/fix-auth] \
  [--issue 42]
```

- Validates inputs, pulls/builds image if needed
- Starts container with unique name, auto-assigns SSH port
- Injects `GITHUB_TOKEN` env var (reads from `gh auth token` or configured PAT)
- Mounts `~/.claude` read-only
- Runs the entrypoint flow (see below)
- Prints: container name, SSH port, attach command

#### `claude-sandbox ls`

Lists running/stopped sandbox containers with: name, repo, status, uptime, SSH port.

#### `claude-sandbox attach <name>`

Shortcut for `ssh -p <port> claude@localhost -t 'tmux attach -t claude'`.

#### `claude-sandbox logs <name>`

Streams tmux pane content via `docker exec <name> tmux capture-pane -t claude -p`.

#### `claude-sandbox stop <name>`

Stops the container. Keeps it for inspection.

#### `claude-sandbox rm <name>`

Removes the container.

#### `claude-sandbox build`

Builds/rebuilds the `claude-sandbox` Docker image from the Dockerfile.

### Configuration

Config stored in `~/.claude-sandbox/config.json`:

```json
{
  "github_pat": "github_pat_...",
  "image": "claude-sandbox:latest",
  "ssh_port_range": [2200, 2299],
  "default_branch_prefix": "claude/"
}
```

Alternatively, `github_pat` can be omitted and the CLI falls back to `gh auth token`.

## Container Entrypoint Flow

```
1. sudo /usr/local/bin/init-firewall.sh
2. Start SSH daemon
3. Configure git credentials (PAT via credential helper)
4. git clone <repo> /workspace
5. cd /workspace
6. Checkout or create branch
7. Start tmux session named "claude"
8. Inside tmux: claude --dangerously-skip-permissions -p "<prompt>"
9. On Claude exit:
   a. Push branch to remote
   b. Create PR via gh (if configured)
   c. Write /workspace/.claude-done with exit status
   d. Send notification (Telegram curl or host-detectable signal)
10. Container stays alive for SSH inspection
```

The entrypoint is a bash script (`entrypoint.sh`) that orchestrates these steps. Claude runs inside tmux so the session persists regardless of SSH attachment.

## Notification (v1)

When the Claude process exits inside tmux:

- A wrapper script detects the exit code
- Writes status to `/workspace/.claude-done`
- The host CLI can poll via `docker exec` or `docker inspect`
- Future: direct Telegram notification via bot API curl

## Security Model

| Threat | Mitigation |
|---|---|
| Container accesses host filesystem | No bind mounts except `~/.claude` (read-only) |
| Claude exfiltrates data to arbitrary URLs | iptables allowlist blocks all non-whitelisted egress |
| Container escapes to host | Standard Docker isolation, non-root user, no privileged mode |
| GitHub token persists | PAT injected as env var, not written to disk; use short-lived fine-grained PAT (30-90 day expiry, scoped to specific repos) |
| Malicious dependency install | npm/pip registries are allowed but arbitrary URLs are blocked; acceptable risk for v1 |
| Host env vars leaked | No `--env-file` or host env passthrough; only explicit `GITHUB_TOKEN` |

## Future Enhancements

- GitHub App integration for automatic 1-hour scoped tokens
- Webhook-triggered container launches (on issue assignment, PR review request)
- `claude-sandbox watch <name>` for live-streaming output
- Multiple concurrent workers with resource limits
- Per-project Dockerfiles / custom images
- Integration as an MCP tool for seamless Claude-to-Claude dispatch

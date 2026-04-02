# claude-sandbox

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Works with Claude Code](https://img.shields.io/badge/Works_with-Claude_Code-6B5CE7)](https://docs.anthropic.com/en/docs/claude-code)

> Run Claude Code in isolated, network-hardened Docker containers.
> Delegate GitHub issues, PRs, or freeform tasks — safely.

<!-- TODO: Replace with actual screenshot or terminal recording -->
<!-- ![claude-sandbox demo](docs/assets/demo.png) -->

## Why claude-sandbox?

- **Network-hardened containers** — iptables firewall allowlists only GitHub, Anthropic, and package registries. Everything else is blocked.
- **Autonomous PR creation** — point it at an issue, get a PR back. Branch creation, commits, and `gh pr create` happen inside the sandbox.
- **One-command plugin install** — `/plugin marketplace add KDercksen/claude-sandbox` and you're done. Also works standalone.
- **Full isolation** — non-root user, no Docker socket mount, read-only config mounts. Claude gets full permissions inside the box, nothing outside it.

## Quick start

### As a Claude Code plugin (recommended)

```
/plugin marketplace add KDercksen/claude-sandbox
```

### Standalone

```bash
git clone https://github.com/KDercksen/claude-sandbox.git
cd claude-sandbox
./claude-sandbox build
```

Requires Docker, Claude Code, and gh CLI — see [Prerequisites](#prerequisites) below.

### Run

```bash
./claude-sandbox run --repo owner/repo --issue 42 --create-pr
```

Replace `owner/repo` with your target repository.

## How it works

The CLI fetches issue/PR context, builds a prompt, and spawns an isolated Docker container. Inside, the firewall locks down network access, the repo is cloned, and Claude works autonomously. When done, it commits, pushes, and optionally opens a PR.

```
run --issue 42 -> build prompt -> spawn container -> firewall init -> clone repo -> Claude works -> commit & push -> create PR
```

See [Architecture](docs/architecture.md) for the full picture.

## Commands

| Command | Description |
|---------|-------------|
| `run`   | Launch sandbox containers (supports `--issue` and `--pr` flags) |
| `build` | Build or rebuild the Docker image |

Post-launch container management uses `docker` directly. See `skills/delegate/SKILL.md` for the full reference.

### Post-launch

```bash
# Monitor progress
docker exec <container> cat /workspace/.claude-progress

# Shell into the container
docker exec -it <container> bash

# Clean up
docker stop <container> && docker rm <container>
```

## Configuration

Config lives at `~/.claude-sandbox/config.json`. Key options:

| Option | Description |
|--------|-------------|
| `image` | Docker image to use |
| `defaultBranchPrefix` | Prefix for auto-generated branch names |
| `githubPat` | GitHub personal access token (falls back to `gh auth token`) |
| `allowedDomains` | Additional domains to allowlist in the firewall |

See [Configuration](docs/configuration.md) for full reference.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`curl -fsSL https://claude.ai/install.sh | bash`)
- [`gh` CLI](https://cli.github.com/) (for issue/PR context fetching)

## Documentation

- [Architecture](docs/architecture.md) — how the CLI and Docker layers work together
- [Security](docs/security.md) — threat model, firewall rules, container isolation
- [Configuration](docs/configuration.md) — all config options

## License

MIT

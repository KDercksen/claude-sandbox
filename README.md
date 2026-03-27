# claude-sandbox

Run Claude Code in isolated, network-hardened Docker containers.

Delegate GitHub issues, PRs, or freeform tasks to sandboxed Claude agents that work autonomously with full permissions — safely.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`curl -fsSL https://claude.ai/install.sh | bash`)
- [`gh` CLI](https://cli.github.com/) (for issue/PR context fetching)

## Install

As a Claude Code plugin:

```
/plugin marketplace add KDercksen/claude-sandbox
```

Or for standalone CLI usage:

```bash
git clone https://github.com/KDercksen/claude-sandbox.git
cd claude-sandbox
```

## Quick start

```bash
# Build the Docker image
./claude-sandbox build

# Start a sandbox with a GitHub issue
./claude-sandbox run --repo owner/repo --issue 42 --create-pr

# Monitor progress
docker exec <container-name> cat /workspace/.claude-progress

# Shell into the container
docker exec -it <container-name> bash

# Clean up
docker stop <container-name> && docker rm <container-name>
```

## Commands

| Command | Description |
|---------|-------------|
| `run` | Launch sandbox containers with monitor subagent instructions |
| `build` | Build or rebuild the Docker image |

Post-launch container management uses `docker` directly. See `skills/delegate/SKILL.md` for the full reference.

## Configuration

Config lives at `~/.claude-sandbox/config.json`. Key options: `image`, `defaultBranchPrefix`, `githubPat`, `allowedDomains`. See `docs/configuration.md` for full reference.

## License

MIT

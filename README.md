# claude-sandbox

Run Claude Code in isolated, network-hardened Docker containers.

Delegate GitHub issues, PRs, or freeform tasks to sandboxed Claude agents that work autonomously with full permissions — safely.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`curl -fsSL https://claude.ai/install.sh | bash`)
- [`gh` CLI](https://cli.github.com/) (for issue/PR context fetching)

## Install

As a Claude Code plugin — add the marketplace, then install the plugin:

```
/plugin marketplace add KDercksen/claude-sandbox
/plugin install claude-sandbox@claude-sandbox
```

Or for standalone CLI usage:

```bash
git clone https://github.com/KDercksen/claude-sandbox.git
cd claude-sandbox
npm install
npm run build
```

## Quick start

```bash
# Build the Docker image
./bin/run.js build

# Start a sandbox with a GitHub issue
./bin/run.js start --repo owner/repo --issue 42 --create-pr

# Monitor output
./bin/run.js logs -f claude-sandbox-repo-abc123

# Attach to the container
./bin/run.js attach claude-sandbox-repo-abc123
```

## Commands

| Command | Description |
|---------|-------------|
| `build` | Build or rebuild the Docker image |
| `start` | Launch a new sandbox container |
| `ls` | List sandbox containers |
| `attach` | SSH into a container and attach to tmux |
| `logs` | Show tmux pane output (`-f` to follow) |
| `stop` | Stop a container (keeps it for inspection) |
| `rm` | Remove a container |

## Configuration

Config lives at `~/.claude-sandbox/config.json`. Key options: `image`, `sshPortRange`, `defaultBranchPrefix`, `githubPat`. See `docs/configuration.md` for full reference.

## License

MIT

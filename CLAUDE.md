# CLAUDE.md

## Project Overview

Claude Code plugin that runs Claude in isolated, network-hardened Docker containers. Single bash script CLI — no build step required.

## Tech Stack

- Bash 4+ for the CLI
- Docker for container management
- jq for JSON parsing
- gh (GitHub CLI) for issue/PR fetching and auth

## Commands

```bash
./claude-sandbox build          # Build the Docker image
./claude-sandbox run [flags]    # Start containers with monitor output
```

Container management uses docker directly (see `skills/delegate/SKILL.md` for full reference).

## Structure

- `claude-sandbox` — the entire CLI (single bash script)
- `docker/` — Dockerfile and container scripts
- `.claude-plugin/` — plugin manifest
- `skills/delegate/SKILL.md` — delegation skill for Claude
- `hooks/` — plugin hooks (currently empty)

## Coding Patterns

### Adding Commands
- Add a `cmd_<name>()` function in the script
- Add a case in the `main()` dispatcher
- Parse flags with `while [[ $# -gt 0 ]]; do case "$1" in ...`
- Use `die` for fatal errors, `warn` for non-fatal warnings

### Docker
- All Docker operations use the `docker` CLI directly
- Containers are labeled `app=claude-sandbox` for discovery
- Container info stored in Docker labels (`claude-sandbox.repo`)

### Config
- Config file: `~/.claude-sandbox/config.json`
- Loaded via `load_config()` which uses `jq` with defaults
- Call `load_config` at the start of commands that need config values

## What Not To Do

- Don't run container processes as root — only `init-firewall.sh` runs via sudo
- Don't bypass or weaken firewall allowlist rules in the Docker image
- Don't hardcode GitHub tokens — use config or `gh auth token`
- Don't mount the Docker socket into containers

## Further Reading

See `docs/` for architecture, security model, and configuration reference.

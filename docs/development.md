# Development Guide

## Setup

```bash
git clone <repo-url>
cd claude-sandbox
```

No build step — the CLI is a single bash script (`claude-sandbox`).

## Building the Docker image

```bash
./claude-sandbox build
```

Builds from `docker/Dockerfile`. Installs Claude Code and firewall tools into the container. The image tag defaults to `claude-sandbox:latest`; it is configurable via the config file. Rebuild the image whenever `docker/Dockerfile` or its supporting files change.

## Adding a new command

1. Add a `cmd_<name>()` function in the `claude-sandbox` script
2. Add a case in the `main()` dispatcher
3. Parse flags with `while [[ $# -gt 0 ]]; do case "$1" in ...`
4. Use `die` for fatal errors, `warn` for non-fatal warnings

## Project structure

```
claude-sandbox      single bash script — the entire CLI
docker/             Dockerfile and supporting files for the container image
docs/               architecture, security, configuration, development docs
skills/             Claude Code plugin skill definitions
hooks/              Claude Code plugin hooks
.claude-plugin/     plugin manifest
```

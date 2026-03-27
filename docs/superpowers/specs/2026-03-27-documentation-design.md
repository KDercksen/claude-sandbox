# Documentation Design Spec

## Goal

Create comprehensive documentation for claude-sandbox: a punchy README for humans, a conventions-focused CLAUDE.md for Claude-assisted development, and a `docs/` folder with separate files optimized for in-context consumption by Claude.

## Audience

- **README.md** — human consumers (developers who want to use or evaluate the tool)
- **CLAUDE.md** — developers using Claude and Claude itself (conventions, patterns)
- **docs/** — Claude and developers (deep technical reference, selectively loadable)

## File Structure

```
CLAUDE.md
README.md
docs/
  architecture.md
  development.md
  security.md
  configuration.md
```

## CLAUDE.md

Concise conventions file containing:

- **Project overview** — one-liner: oclif CLI + Claude Code plugin for isolated Docker containers
- **Tech stack** — TypeScript, ES modules, oclif, dockerode, mocha/chai
- **Commands** — `npm run build`, `npm test`, `npm run lint`
- **Coding patterns** — oclif command structure, `SandboxDocker` as Docker abstraction, config merge pattern, label-based container filtering
- **Testing** — mocha + chai, unit tests in `test/lib/`, command tests in `test/commands/`, integration tests need Docker
- **What not to do** — don't run containers as root, don't bypass firewall rules, don't hardcode GitHub tokens
- **Pointer** — "See `docs/` for architecture, security model, and development guide"

## README.md

Minimal and punchy:

- **Title + one-line description** — "Run Claude Code in isolated, network-hardened Docker containers"
- **Prerequisites** — Docker, Node 18+, Claude Code, `gh` CLI (for issue/PR features)
- **Install** — `npm install`, plus Claude Code plugin install instructions
- **Quick start** — build image, start sandbox, attach, check logs
- **Commands** — brief table of all 7 commands with one-line descriptions
- **Configuration** — mention `~/.claude-sandbox/config.json`, list key options
- **License** — TBD

No architecture deep-dives or security details — those live in docs/.

## docs/architecture.md

Optimized for Claude to quickly understand how things connect:

- **Overview** — CLI commands -> SandboxDocker -> Docker API -> containers with SSH + tmux
- **Component map** — commands layer, lib layer (docker.ts, config.ts, prompt-builder.ts, ssh.ts, container-name.ts), Docker layer (Dockerfile, entrypoint, firewall, wrapper)
- **Container lifecycle** — build image -> create container (mounts, env, labels, port) -> entrypoint starts SSH + firewall + tmux -> Claude runs in tmux session -> stop -> rm
- **Data flow** — how `start` goes from flags -> prompt building -> GitHub token resolution -> container creation -> SSH key mounting
- **Key design decisions** — single shared SSH keypair, tmux for session persistence, Docker labels for discovery, randomized port allocation

## docs/development.md

- **Setup** — clone, `npm install`, `npm run build`
- **Building the Docker image** — `node bin/run.js build` (or via plugin)
- **Running tests** — `npm test`, integration tests require Docker running
- **Linting** — `npm run lint`, eslint with oclif + prettier config
- **Adding a new command** — create file in `src/commands/`, extend `Command`, define static `flags`/`args`, implement `run()`, add tests
- **Project structure** — src/commands vs src/lib split
- **oclif conventions** — commands auto-discovered by filename, flags are typed, help auto-generated

## docs/security.md

- **Threat model** — Claude runs with `--dangerously-skip-permissions`, so the container is the trust boundary
- **Network hardening** — iptables + ipset allowlist strategy, only specific destinations permitted
- **What's allowed** — list of permitted egress destinations and why each is needed
- **What's blocked** — everything else, including arbitrary HTTP(S)
- **Container isolation** — non-root `claude` user, read-only mounts for credentials, no Docker socket access
- **Firewall verification** — how the integration test validates blocking (example.com) and allowing (GitHub)
- **SSH access** — Ed25519 keypair, shared across containers, StrictHostKeyChecking=no for convenience

## docs/configuration.md

- **Config file** — `~/.claude-sandbox/config.json`, auto-created with defaults
- **Config options** — `image`, `sshPortRange`, `defaultBranchPrefix`, `githubPat` with types, defaults, descriptions
- **Environment variables passed to containers** — `REPO`, `PROMPT`, `GITHUB_TOKEN`, `BRANCH`, `CREATE_PR`
- **Docker labels** — `app=claude-sandbox`, `claude-sandbox.repo`, `claude-sandbox.ssh-port` for container discovery
- **CLI flags reference** — table of `start` command flags
- **GitHub token resolution** — priority order: config PAT -> `gh auth token` -> error

## Implementation Notes

- All docs/ files should be written for in-context consumption: factual, scannable, no filler
- README should assume some baseline knowledge but be approachable for newcomers
- CLAUDE.md should be terse and directive — it's instructions, not prose
- Content should be derived from actual source code, not assumptions

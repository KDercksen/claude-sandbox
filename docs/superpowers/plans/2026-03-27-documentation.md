# Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create comprehensive documentation: CLAUDE.md (conventions), README.md (human-facing), and four docs/ files (architecture, development, security, configuration) optimized for in-context consumption.

**Architecture:** Six markdown files plus a LICENSE. Each docs/ file is self-contained so Claude can load only the relevant context. CLAUDE.md is terse and directive. README.md is punchy and minimal.

**Tech Stack:** Markdown

**Spec:** `docs/superpowers/specs/2026-03-27-documentation-design.md`

---

### Task 1: Write CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Read source files for accurate details**

Read these files to extract exact patterns, commands, and conventions:
- `package.json` — scripts, engine requirements
- `tsconfig.json` — module system, target
- `eslint.config.mjs` — lint config
- `.mocharc.json` — test config
- `src/lib/docker.ts` — SandboxDocker pattern
- `src/lib/config.ts` — config merge pattern
- `src/commands/start.ts` — command structure example

- [ ] **Step 2: Write CLAUDE.md**

Write `CLAUDE.md` with these sections. Keep it terse and directive — instructions, not prose:

1. **Project overview** — one-liner: oclif CLI + Claude Code plugin that runs Claude in isolated, network-hardened Docker containers
2. **Tech stack** — TypeScript (ES2022, Node16 modules), oclif v4, dockerode v4, mocha/chai, ESM throughout
3. **Build/test/lint commands** — `npm run build`, `npm test`, `npm run lint`
4. **Coding patterns:**
   - Commands: files in `src/commands/`, extend `Command` from `@oclif/core`, static `flags`/`args` properties
   - Docker: all Docker operations go through `SandboxDocker` class in `src/lib/docker.ts`
   - Config: merge pattern in `src/lib/config.ts` — user partial config merged over defaults
   - Container discovery: Docker labels (`app=claude-sandbox`) for filtering
   - Container naming: `claude-sandbox-{name}-{hex}` via `src/lib/container-name.ts`
5. **Testing:**
   - Unit tests: `test/lib/` — pure function tests, no Docker needed
   - Command tests: `test/commands/` — stub Docker interactions
   - Integration tests: `test/integration/` — require Docker running, real containers
   - Framework: mocha + chai, ESM loader via ts-node
6. **What not to do:**
   - Don't run container processes as root (only `init-firewall.sh` runs via sudo)
   - Don't bypass or weaken firewall allowlist rules
   - Don't hardcode GitHub tokens — use config or `gh auth token`
   - Don't add Docker socket mount to containers
7. **Pointer** — "See `docs/` for architecture, security model, development guide, and configuration reference."

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with project conventions"
```

---

### Task 2: Write README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Read package.json and plugin.json for metadata**

Read `package.json` and `.claude-plugin/plugin.json` for name, description, version, and dependencies.

- [ ] **Step 2: Write README.md**

Write `README.md` — punchy and minimal. Sections:

1. **Title and description:**
   ```
   # claude-sandbox

   Run Claude Code in isolated, network-hardened Docker containers.
   ```
   One paragraph: delegate GitHub issues, PRs, or freeform tasks to sandboxed Claude agents that work autonomously with full permissions — safely.

2. **Prerequisites:**
   - Docker
   - Node.js >= 18
   - Claude Code (`@anthropic-ai/claude-code`)
   - `gh` CLI (for issue/PR context fetching)

3. **Install:**
   As a Claude Code plugin:
   ```bash
   claude /install-plugin /path/to/claude-sandbox
   ```
   Or for CLI usage:
   ```bash
   git clone <repo-url>
   cd claude-sandbox
   npm install
   npm run build
   ```

4. **Quick start:**
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

5. **Commands table:**

   | Command | Description |
   |---------|-------------|
   | `build` | Build or rebuild the Docker image |
   | `start` | Launch a new sandbox container |
   | `ls` | List sandbox containers |
   | `attach` | SSH into a container and attach to tmux |
   | `logs` | Show tmux pane output (`-f` to follow) |
   | `stop` | Stop a container (keeps it for inspection) |
   | `rm` | Remove a container |

6. **Configuration:**
   Config lives at `~/.claude-sandbox/config.json`. Key options: `image`, `sshPortRange`, `defaultBranchPrefix`, `githubPat`. See `docs/configuration.md` for full reference.

7. **License:** MIT

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with install, usage, and commands"
```

---

### Task 3: Write docs/architecture.md

**Files:**
- Create: `docs/architecture.md`

- [ ] **Step 1: Read source files for architecture details**

Read these files for accurate component relationships:
- `src/commands/start.ts` — full launch flow
- `src/lib/docker.ts` — container creation details, labels, mounts
- `docker/entrypoint.sh` — startup sequence
- `docker/claude-wrapper.sh` — Claude execution and post-run workflow
- `docker/Dockerfile` — image composition

- [ ] **Step 2: Write docs/architecture.md**

Sections:

1. **Overview:** Three-layer architecture:
   - CLI layer (`src/commands/`) — user-facing commands, flag parsing, output formatting
   - Lib layer (`src/lib/`) — business logic: Docker operations, config, prompt building, SSH, naming
   - Docker layer (`docker/`) — container image, entrypoint, firewall, Claude wrapper

2. **Component map:** List each source file with its responsibility:
   - `src/commands/start.ts` — orchestrates container launch: validates flags, builds prompt, resolves token, generates name, finds port, calls SandboxDocker
   - `src/commands/attach.ts` — SSH + tmux attach via `process.execFileSync` (replaces current process)
   - `src/commands/ls.ts` — queries Docker for labeled containers, formats table
   - `src/commands/logs.ts` — exec `tmux capture-pane` in container, optional polling
   - `src/commands/build.ts` — tar-streams docker/ dir, calls Docker build API
   - `src/commands/stop.ts` — graceful container stop
   - `src/commands/rm.ts` — container removal with force option
   - `src/lib/docker.ts` — `SandboxDocker` class wrapping dockerode: build, create, exec, list, stop, remove, port finding
   - `src/lib/config.ts` — loads/saves `~/.claude-sandbox/config.json`, merges user overrides with defaults
   - `src/lib/prompt-builder.ts` — assembles prompt from `--prompt`, `--issue`, `--pr` flags using `gh` CLI
   - `src/lib/ssh.ts` — ensures Ed25519 keypair at `~/.claude-sandbox/ssh/`
   - `src/lib/container-name.ts` — generates `claude-sandbox-{name}-{hex}` names

3. **Container lifecycle:**
   - Build: `build` command tar-streams `docker/` dir to Docker daemon
   - Create: `start` command creates container with env vars, read-only mounts (claude config, SSH key), NET_ADMIN/NET_RAW caps, port binding, labels
   - Boot: entrypoint runs firewall init, starts sshd, copies config from read-only mounts, configures git credentials, clones repo, optionally creates branch, launches Claude in tmux
   - Run: `claude-wrapper.sh` runs Claude with `--dangerously-skip-permissions`, then commits uncommitted changes, pushes branch, optionally creates PR
   - Monitor: `logs` command captures tmux pane output; `attach` command SSH-es into tmux session
   - Cleanup: `stop` then `rm`

4. **Data flow for `start`:**
   Flags parsed → `buildPrompt()` fetches issue/PR via gh CLI → `resolveGitHubToken()` from config or gh → `ensureSSHKeyPair()` → `generateContainerName()` → `findFreePort()` → `createAndStartContainer()` with mounts and env vars

5. **Key design decisions:**
   - Single shared SSH keypair across all containers — simplicity over per-container isolation (containers are ephemeral)
   - tmux for session persistence — survives SSH disconnects, enables log capture
   - Docker labels for discovery — `app=claude-sandbox`, `claude-sandbox.repo`, `claude-sandbox.ssh-port`
   - Randomized port allocation — reduces collisions when launching multiple containers
   - Read-only mounts + copy — host config mounted read-only, copied to writable paths in entrypoint
   - `tail -f /dev/null` keepalive — container stays alive after Claude exits for inspection

- [ ] **Step 3: Commit**

```bash
git add docs/architecture.md
git commit -m "docs: add architecture overview"
```

---

### Task 4: Write docs/development.md

**Files:**
- Create: `docs/development.md`

- [ ] **Step 1: Read build and test config files**

Read `package.json` (scripts section), `tsconfig.json`, `.mocharc.json`, `eslint.config.mjs` for exact commands and configuration.

- [ ] **Step 2: Write docs/development.md**

Sections:

1. **Setup:**
   ```bash
   git clone <repo-url>
   cd claude-sandbox
   npm install
   npm run build
   ```

2. **Building the Docker image:**
   ```bash
   ./bin/run.js build
   ```
   Builds from `docker/Dockerfile`. Installs Claude Code, SSH server, tmux, firewall tools. Tag defaults to `claude-sandbox:latest` (configurable in config).

3. **Running tests:**
   ```bash
   npm test                    # all tests
   npx mocha test/lib/         # unit tests only (no Docker needed)
   npx mocha test/integration/ # integration tests (Docker required)
   ```
   - Unit tests in `test/lib/` test pure functions (container naming, prompt building, SSH)
   - Command tests in `test/commands/` test CLI output
   - Integration tests in `test/integration/` spin up real containers and verify firewall rules — timeout is 180s
   - Framework: mocha with `--forbid-only`, chai for assertions, ts-node ESM loader

4. **Linting:**
   ```bash
   npm run lint
   ```
   ESLint with `eslint-config-oclif` and `eslint-config-prettier`.

5. **Adding a new command:**
   - Create `src/commands/<name>.ts`
   - Export a class extending `Command` from `@oclif/core`
   - Define `static description`, `static flags`, `static args` as needed
   - Implement `async run()` method
   - oclif auto-discovers commands by filename — no registration needed
   - Add tests in `test/commands/<name>.test.ts`
   - Example: look at `src/commands/stop.ts` for a minimal command

6. **Project structure:**
   - `src/commands/` — one file per CLI command, auto-discovered
   - `src/lib/` — shared logic, no command-specific code
   - `docker/` — everything that goes into the container image
   - `test/` — mirrors src structure
   - `skills/` — Claude Code plugin skill definitions
   - `hooks/` — Claude Code plugin hooks

7. **oclif conventions:**
   - Commands auto-discovered by filename in `src/commands/`
   - Flags defined with `Flags.string()`, `Flags.integer()`, `Flags.boolean()` from `@oclif/core`
   - Args defined with `Args.string()` etc.
   - `this.log()` for stdout, `this.error()` to exit with error
   - `oclif manifest` generates command manifest at prepack time

- [ ] **Step 3: Commit**

```bash
git add docs/development.md
git commit -m "docs: add development guide"
```

---

### Task 5: Write docs/security.md

**Files:**
- Create: `docs/security.md`

- [ ] **Step 1: Read firewall and Docker files**

Read `docker/init-firewall.sh` for exact allowlist rules and `docker/Dockerfile` for container security setup. Also read `test/integration/hardening.test.ts` for verification details.

- [ ] **Step 2: Write docs/security.md**

Sections:

1. **Threat model:**
   Claude runs with `--dangerously-skip-permissions` inside containers — it can execute arbitrary commands, edit any file, and make network requests. The container is the trust boundary. The firewall ensures Claude can only reach services it needs (GitHub, Anthropic API, package registries) and nothing else.

2. **Network hardening:**
   `docker/init-firewall.sh` runs at container startup via sudo. Uses iptables + ipset for stateful allowlist filtering.

   Default policies: INPUT DROP, FORWARD DROP, OUTPUT DROP. Only explicitly allowed traffic passes.

   Blocked traffic gets `REJECT --reject-with icmp-admin-prohibited` for fast failure instead of timeouts.

3. **Allowed destinations:**

   | Destination | Why |
   |-------------|-----|
   | GitHub (dynamic IPs from `api.github.com/meta`) | Clone repos, push branches, create PRs |
   | `api.anthropic.com` | Claude API calls |
   | `statsig.anthropic.com`, `statsig.com` | Claude telemetry |
   | `registry.npmjs.org` | npm package installs |
   | `pypi.org`, `files.pythonhosted.org` | pip package installs |
   | `sentry.io` | Error reporting |
   | Docker bridge gateway network | Host network communication |
   | DNS (UDP 53) | Name resolution |
   | Loopback (lo) | Local services |

   GitHub IPs are fetched dynamically from the GitHub meta API and aggregated into CIDR ranges. All other domains are resolved via DNS at firewall init time.

4. **What's blocked:**
   Everything not in the allowlist. This includes arbitrary websites, external APIs, email (SMTP), and direct IP connections. The integration test verifies that `example.com`, `httpbin.org`, Google DNS (8.8.8.8:443), and outbound SMTP (port 25) are all blocked.

5. **Container isolation:**
   - Runs as non-root `claude` user
   - Host config mounted read-only (`.claude/`, `.claude.json`), copied to writable paths at startup
   - No Docker socket access — container cannot manage other containers
   - SSH access via Ed25519 keypair generated on host
   - `NET_ADMIN` and `NET_RAW` capabilities granted solely for firewall setup
   - Sudo restricted: only `/usr/local/bin/init-firewall.sh` and iptables/ipset commands

6. **Firewall verification:**
   Integration tests in `test/integration/hardening.test.ts` spin up a real container and verify:
   - Blocked: `example.com`, `httpbin.org`, `8.8.8.8:443`, SMTP port 25
   - Allowed: `api.github.com`, `github.com`, `api.anthropic.com`, `registry.npmjs.org`
   - Policy: default OUTPUT policy is DROP, default INPUT policy is DROP
   - ipset `allowed-domains` is populated with `hash:net` entries
   - REJECT rule with `icmp-admin-prohibited` is present

7. **SSH access model:**
   - Single Ed25519 keypair stored at `~/.claude-sandbox/ssh/id_ed25519`
   - Generated once, reused across all containers
   - Public key mounted read-only as `/home/claude/.ssh/authorized_keys`
   - `StrictHostKeyChecking=no` used by attach command (containers are ephemeral, host keys change)
   - Password authentication disabled in sshd config

- [ ] **Step 3: Commit**

```bash
git add docs/security.md
git commit -m "docs: add security model documentation"
```

---

### Task 6: Write docs/configuration.md

**Files:**
- Create: `docs/configuration.md`

- [ ] **Step 1: Read config and start command for exact details**

Read `src/lib/config.ts` for config interface and defaults, `src/commands/start.ts` for all flags and env vars, `src/lib/docker.ts` for label constants.

- [ ] **Step 2: Write docs/configuration.md**

Sections:

1. **Config file:**
   Location: `~/.claude-sandbox/config.json`. Auto-created with defaults on first use. Partial overrides are merged over defaults.

2. **Config options:**

   | Key | Type | Default | Description |
   |-----|------|---------|-------------|
   | `image` | string | `claude-sandbox:latest` | Docker image tag to use |
   | `sshPortRange` | [number, number] | `[2200, 2299]` | Port range for SSH |
   | `defaultBranchPrefix` | string | `claude/` | Prefix for auto-generated branch names |
   | `githubPat` | string | (none) | GitHub Personal Access Token override |

3. **CLI flags for `start` command:**

   | Flag | Short | Type | Required | Description |
   |------|-------|------|----------|-------------|
   | `--repo` | `-r` | string | yes | GitHub repo (`owner/name`) |
   | `--prompt` | `-p` | string | no | Prompt text for Claude |
   | `--issue` | `-i` | integer | no | GitHub issue number |
   | `--pr` | | integer | no | GitHub PR number |
   | `--branch` | `-b` | string | no | Branch to create or checkout |
   | `--create-pr` | | boolean | no | Create PR when Claude finishes |
   | `--name` | | string | no | Container name (auto-generated if omitted) |

   At least one of `--prompt`, `--issue`, or `--pr` is required.

4. **Environment variables passed to containers:**

   | Variable | Source | Description |
   |----------|--------|-------------|
   | `REPO` | `--repo` flag | Repository to clone |
   | `PROMPT` | Built from flags | Assembled prompt text |
   | `GITHUB_TOKEN` | Config or `gh auth token` | Authentication token |
   | `BRANCH` | `--branch` or auto-generated | Branch name (if set) |
   | `CREATE_PR` | `--create-pr` flag | Whether to create PR after |

5. **Docker labels:**

   | Label | Value | Purpose |
   |-------|-------|---------|
   | `app` | `claude-sandbox` | Container discovery and filtering |
   | `claude-sandbox.repo` | `owner/name` | Repository association |
   | `claude-sandbox.ssh-port` | port number | SSH port for attach/logs |

   All `ls`, `logs`, `attach`, `stop`, and `rm` commands use these labels to find containers.

6. **GitHub token resolution:**
   Priority order:
   1. `githubPat` in config file
   2. Output of `gh auth token` command
   3. Error if neither available

   The token is passed as `GITHUB_TOKEN` env var to the container, used by git credential helper and `gh` CLI.

7. **SSH keys:**
   Stored at `~/.claude-sandbox/ssh/`. Generated automatically on first `start` if missing. Ed25519 format, no passphrase.

- [ ] **Step 3: Commit**

```bash
git add docs/configuration.md
git commit -m "docs: add configuration reference"
```

---

### Task 7: Add LICENSE file

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Write MIT LICENSE file**

Write standard MIT license text with:
- Year: 2026
- Copyright holder: KDercksen

- [ ] **Step 2: Commit**

```bash
git add LICENSE
git commit -m "docs: add MIT license"
```

---

### Task 8: Final review and cleanup

- [ ] **Step 1: Read all written files**

Read each file to verify accuracy and completeness:
- `CLAUDE.md`
- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/security.md`
- `docs/configuration.md`
- `LICENSE`

- [ ] **Step 2: Cross-reference with source code**

Verify that all referenced file paths, flag names, config keys, method names, and commands match the actual source code. Fix any discrepancies.

- [ ] **Step 3: Verify no broken cross-references between docs**

Check that any pointers between files (e.g., CLAUDE.md pointing to docs/, README pointing to docs/configuration.md) reference files that actually exist.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "docs: fix review issues"
```

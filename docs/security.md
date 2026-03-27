# Security model

## Threat model

Claude runs with `--dangerously-skip-permissions` inside containers — it can execute arbitrary commands, edit any file, and make network requests. The container is the trust boundary.

The primary risk is Claude making unintended network connections: exfiltrating data, reaching internal services, or being used as a pivot point. The firewall ensures Claude can only reach services it legitimately needs (GitHub, Anthropic API, package registries) and nothing else.

Secondary risks are container escape and privilege escalation. These are mitigated by running as a non-root user with restricted sudo access, no Docker socket mount, and capabilities limited to what the firewall setup requires.

## Network hardening

`docker/init-firewall.sh` runs at container startup via `sudo /usr/local/bin/init-firewall.sh`. It uses iptables with ipset for stateful allowlist filtering.

**Default policies:** INPUT DROP, FORWARD DROP, OUTPUT DROP. Only explicitly allowed traffic passes.

**Sequence:**
1. Preserve Docker's internal DNS NAT rules (`127.0.0.11`)
2. Flush all existing iptables rules and destroy any existing `allowed-domains` ipset
3. Allow DNS (UDP 53), SSH (TCP 22), and loopback before setting drop policies
4. Create `allowed-domains` ipset (`hash:net`)
5. Fetch GitHub IP ranges from `api.github.com/meta` and aggregate into CIDRs
6. Resolve all other allowed domains via DNS and add their IPs to the ipset
7. Allow the Docker bridge gateway network (host communication)
8. Set default policies to DROP
9. Allow established/related connections
10. Allow outbound to `allowed-domains` ipset
11. REJECT everything else with `icmp-admin-prohibited` for fast failure instead of timeouts

The script self-verifies by confirming `example.com` is blocked and `api.github.com` is reachable before declaring the firewall ready.

## Allowed destinations

| Destination | Why |
|---|---|
| GitHub (dynamic IPs from `api.github.com/meta`, `.web + .api + .git` ranges) | Clone repos, push branches, create PRs |
| `api.anthropic.com` | Claude API calls |
| `statsig.anthropic.com`, `statsig.com` | Claude telemetry |
| `registry.npmjs.org` | npm package installs |
| `pypi.org`, `files.pythonhosted.org` | pip package installs |
| `sentry.io` | Error reporting |
| Docker bridge gateway `/24` (detected from default route) | Host network communication |
| DNS UDP port 53 | Name resolution |
| Loopback (`lo`) | Local services |

GitHub IPs are fetched dynamically from the GitHub meta API at firewall init time and aggregated into CIDR ranges using the `aggregate` tool. All other domains are resolved via DNS at init time; IP changes after startup are not picked up.

## What's blocked

Everything not in the allowlist. This includes:

- Arbitrary websites and external APIs
- Email (SMTP port 25)
- Direct IP connections to non-allowlisted addresses (e.g., Google DNS at `8.8.8.8`)
- Any service reachable only by IP without a matching allowlist entry

## Container isolation

- **Non-root user:** Container runs as the `claude` user (`USER claude` in Dockerfile)
- **Read-only config mounts:** Host `.claude/` directory and `.claude.json` are mounted read-only and copied to writable paths at startup by the entrypoint
- **No Docker socket:** The container cannot access the Docker daemon and cannot manage other containers
- **SSH access:** Ed25519 keypair generated on the host; public key mounted read-only as `/home/claude/.ssh/authorized_keys`; password authentication disabled in `sshd_config`
- **Capabilities:** `NET_ADMIN` and `NET_RAW` are granted solely to enable iptables/ipset firewall setup; no other extra capabilities are added
- **Sudo:** Restricted to specific commands only: `init-firewall.sh`, `sshd`, `cp`, `chown`, `iptables`, `ipset`. The entrypoint needs these for firewall setup, SSH daemon, and copying read-only mounts to writable paths.

## Firewall verification

Integration tests in `test/integration/hardening.test.ts` spin up a real container (image `claude-sandbox:latest`) with the full firewall initialized, then exec commands inside to verify network state.

**Blocked:**
- `example.com` — generic website
- `httpbin.org` — arbitrary HTTP API
- `8.8.8.8:443` — Google DNS (direct IP, not in allowlist)
- Port 25 to `1.1.1.1` — outbound SMTP

**Allowed:**
- `api.github.com` — GitHub API
- `github.com` — GitHub main site
- `api.anthropic.com` — Anthropic API
- `registry.npmjs.org` — npm registry

**Policy checks:**
- Default OUTPUT policy is DROP
- Default INPUT policy is DROP
- `allowed-domains` ipset is populated with `hash:net` entries
- REJECT rule with `icmp-admin-prohibited` is present in OUTPUT chain

Run with: `npm test -- --grep "hardening"`. Requires Docker running and `claude-sandbox:latest` image built. Tests have a 180-second timeout to account for firewall initialization time.

## SSH access model

- Single Ed25519 keypair stored at `~/.claude-sandbox/ssh/id_ed25519` on the host
- Generated once by `ensureSSHKeyPair()`, reused across all containers
- Public key mounted read-only at `/home/claude/.ssh/authorized_keys` inside each container
- The `attach` command uses `StrictHostKeyChecking=no` — containers are ephemeral and host keys change between runs
- Password authentication is disabled in `sshd_config` (`PasswordAuthentication no`)

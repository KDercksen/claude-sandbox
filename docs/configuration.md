# Configuration Reference

## Config file

Location: `~/.claude-sandbox/config.json`

The file is not required. If absent, defaults are used. When the file exists, keys are merged over defaults — partial configs are valid; you only need to specify values you want to override.

## Config options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `image` | string | `claude-sandbox:latest` | Docker image tag to use for new containers |
| `defaultBranchPrefix` | string | `claude/` | Prefix prepended to auto-generated branch names (used when `--create-pr` is set and `--branch` is omitted) |
| `allowedDomains` | string[] | `[]` | Extra domains to allow through the container firewall (fully qualified domain names only — no IPs, CIDRs, or URLs). Additive with `--allow-domain` flag and the hardcoded defaults |
| `githubPat` | string | (none) | GitHub Personal Access Token; overrides `gh auth token` when set |

Example `~/.claude-sandbox/config.json`:

```json
{
  "image": "my-org/claude-sandbox:v2",
  "defaultBranchPrefix": "ai/",
  "githubPat": "ghp_...",
  "allowedDomains": ["registry.internal.company.com", "artifactory.myorg.net"]
}
```

## CLI flags — `run` command

| Flag | Short | Type | Required | Description |
|------|-------|------|----------|-------------|
| `--repo` | `-r` | string | yes | GitHub repository in `owner/name` format |
| `--prompt` | `-p` | string | no | Prompt text passed directly to Claude |
| `--issue` | `-i` | integer | no | GitHub issue number; content is fetched and appended to the prompt (repeatable) |
| `--pr` | | integer | no | GitHub PR number; content is fetched and appended to the prompt (repeatable) |
| `--branch` | `-b` | string | no | Branch to create or checkout inside the container |
| `--create-pr` | | boolean | no | Create a PR when Claude finishes (default: false) |
| `--allow-domain` | | string | no | Extra domain to allow through the container firewall (repeatable; additive with `allowedDomains` config) |
| `--name` | | string | no | Container name slug; auto-generated from repo + random hex if omitted |

At least one of `--prompt`, `--issue`, or `--pr` is required.

When `--create-pr` is set and `--branch` is omitted, a branch name is generated as `<defaultBranchPrefix><container-name>`.

Multiple `--issue` or `--pr` flags spawn parallel containers automatically. `--branch` and `--name` can only be used with a single target.

## Environment variables passed to containers

| Variable | Source | Description |
|----------|--------|-------------|
| `REPO` | `--repo` flag | Repository to clone (`owner/name`) |
| `PROMPT` | Built from flags | Assembled prompt text (direct prompt + issue/PR content) |
| `GITHUB_TOKEN` | Config or `gh auth token` | Authentication token for git and `gh` CLI |
| `BRANCH` | `--branch` or auto-generated | Branch name; only set when a branch is configured |
| `CREATE_PR` | `--create-pr` flag | `true` or `false`; instructs the wrapper whether to open a PR |
| `EXTRA_ALLOWED_DOMAINS` | `allowedDomains` config + `--allow-domain` flag | Comma-separated list of extra domains to allow through the firewall; resolved via `dig` at container startup |

## Docker labels

| Label | Value | Purpose |
|-------|-------|---------|
| `app` | `claude-sandbox` | Container discovery — filter with `docker ps --filter label=app=claude-sandbox` |
| `claude-sandbox.repo` | `owner/name` | Repository the container is working on |

## GitHub token resolution

Priority order:

1. `githubPat` in `~/.claude-sandbox/config.json`
2. Output of `gh auth token` (requires the `gh` CLI to be installed and authenticated)
3. Fatal error if neither is available

The resolved token is injected as `GITHUB_TOKEN` into the container environment, where it is used by the git credential helper and the `gh` CLI.

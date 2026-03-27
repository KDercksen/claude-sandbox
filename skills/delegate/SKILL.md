---
name: delegate
description: Delegate work to an isolated sandbox container — launch Claude in Docker to autonomously work on GitHub issues, PRs, or freeform tasks, then monitor progress and report back
---

# Delegate Work to a Sandbox

Use this skill when the user asks you to run work in a sandbox, or when you recognize a task that would benefit from isolated autonomous execution (long-running issue work, untrusted code, tasks that can run independently).

**If suggesting proactively:** Explain why a sandbox would be appropriate and ask for confirmation before launching.

## Prerequisites

Before launching, verify:
1. **Plugin installed:** Run `claude-sandbox --help` (see CLI Reference below). If it fails, tell user: "Plugin not found. Try restarting Claude Code or check that the plugin is installed."
2. **Git repo:** Run `git remote get-url origin` in the current working directory. If it fails, tell the user: "Not in a git repository with a remote. Navigate to a repo first."
3. **Docker running:** If the start command fails with a Docker connection error, suggest checking that Docker is running.

## CLI Reference

To keep displayed commands clean, define a shell function in each Bash tool call:

```bash
claude-sandbox() { "${CLAUDE_PLUGIN_ROOT}/claude-sandbox" "$@"; }
```

Then invoke commands as `claude-sandbox <command> [flags]`. Always set the Bash tool `description` to a short, human-readable form (e.g., `claude-sandbox run --repo org/repo`) so the user sees a clean invocation instead of the full plugin path.

Example Bash tool call:
```
description: "claude-sandbox run --repo org/repo --issue 42"
command: claude-sandbox() { "${CLAUDE_PLUGIN_ROOT}/claude-sandbox" "$@"; }; claude-sandbox run --repo org/repo --issue 42
```

## Step 1: Parse Intent

Extract the task targets from the user's request:

| Pattern | Action |
|---------|--------|
| "issue 42", "issue #42", "#42" (in issue context) | Use `--issue 42` |
| "PR 15", "pull request #15" | Use `--pr 15` |
| Freeform task description | Use `--prompt "..."` |
| Multiple targets ("issues 12, 15, 23") | Use `--issue 12 --issue 15 --issue 23` |

## Step 2: Resolve Repo

Parse the repo from git remote:
```bash
git remote get-url origin
```

Extract `org/repo` from the URL. Handle both formats:
- `git@github.com:org/repo.git` → `org/repo`
- `https://github.com/org/repo.git` → `org/repo`

Strip any trailing `.git`.

## Step 3: Launch

Use the `run` command which handles concurrent spawning and outputs monitor subagent instructions:

```bash
claude-sandbox() { "${CLAUDE_PLUGIN_ROOT}/claude-sandbox" "$@"; }; claude-sandbox run --repo <org/repo> [--issue N ...] [--pr N ...] [--prompt "..."] [--create-pr] [--name <name>]
```

Rules:
- Add `--create-pr` by default for issue-based tasks. Do NOT add it for PR reviews.
- For single targets, pass `--name` with a short, descriptive slug (e.g., `--name fix-auth-bug`).
- Multiple `--issue` or `--pr` flags spawn parallel containers automatically.
- `--branch` and `--name` can only be used with a single target.

## Step 4: Launch Monitor Subagents

After a successful `run` command, parse the JSON monitor instructions from the output (lines after `--- MONITOR SUBAGENT INSTRUCTIONS ---`). Each line is a JSON object with `containerName` and `prompt` fields.

For each monitor instruction, launch a background subagent using the `sandbox-monitor` agent type:
```
Agent tool:
  description: "Monitor container <containerName>"
  subagent_type: "claude-sandbox:sandbox-monitor"
  run_in_background: true
  prompt: <the prompt field from the JSON>
```

The monitor subagent will:
- Poll container logs every ~10 seconds
- Identify and report milestone events (repo cloned, tests passing/failing, commits, PRs created)
- Detect completion via `.claude-done` marker file
- Report final status and ask whether to keep or clean up the container

## Step 5: Handle Completion

When a monitor subagent reports completion and asks "keep or clean up?":

- **Clean up:** Run `docker stop <name> && docker rm <name>`
- **Keep:** Do nothing — container stays running for inspection

## Docker Reference

All post-launch container management uses docker directly:

| Task | Command |
|------|---------|
| List containers | `docker ps -a --filter label=app=claude-sandbox` |
| View progress | `docker exec <name> cat /workspace/.claude-progress` |
| Check completion | `docker exec <name> cat /workspace/.claude-done` |
| Shell into container | `docker exec -it <name> bash` |
| Stop container | `docker stop <name>` |
| Remove container | `docker rm <name>` |

## Error Handling

- **No git remote:** Stop and tell the user. Do not guess repos.
- **Plugin broken:** Tell user to check plugin installation.
- **Container fails to start:** Show the full CLI error output. Suggest `docker ps` to check Docker.
- **Container stops unexpectedly:** Report and suggest `docker exec -it <name> bash` to inspect.
- **Monitor subagent crashes:** Container keeps running. User can manually check with `docker exec`.

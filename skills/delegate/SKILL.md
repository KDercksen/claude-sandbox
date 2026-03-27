---
name: delegate
description: Delegate work to an isolated sandbox container — launch Claude in Docker to autonomously work on GitHub issues, PRs, or freeform tasks, then monitor progress and report back
---

# Delegate Work to a Sandbox

Use this skill when the user asks you to run work in a sandbox, or when you recognize a task that would benefit from isolated autonomous execution (long-running issue work, untrusted code, tasks that can run independently).

**If suggesting proactively:** Explain why a sandbox would be appropriate and ask for confirmation before launching.

## Prerequisites

Before launching, verify:
1. **Plugin installed:** Run `${CLAUDE_PLUGIN_ROOT}/bin/run.js --help`. If it fails, tell user: "Plugin dependencies may not be installed. Try restarting Claude Code or running `npm install --production` in the plugin directory."
2. **Git repo:** Run `git remote get-url origin` in the current working directory. If it fails, tell the user: "Not in a git repository with a remote. Navigate to a repo first."
3. **Docker running:** If the start command fails with a Docker connection error, suggest checking that Docker is running.

## CLI Reference

All CLI commands are run via:
```bash
${CLAUDE_PLUGIN_ROOT}/bin/run.js <command> [flags]
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
${CLAUDE_PLUGIN_ROOT}/bin/run.js run --repo <org/repo> [--issue N ...] [--pr N ...] [--prompt "..."] [--create-pr] [--name <name>]
```

Rules:
- Add `--create-pr` by default for issue-based tasks. Do NOT add it for PR reviews.
- For single targets, pass `--name` with a short, descriptive slug (e.g., `--name fix-auth-bug`).
- Multiple `--issue` or `--pr` flags spawn parallel containers automatically.
- `--branch` and `--name` can only be used with a single target.

## Step 4: Launch Monitor Subagents

After a successful `run` command, parse the JSON monitor instructions from the output (lines after `--- MONITOR SUBAGENT INSTRUCTIONS ---`). Each line is a JSON object with `containerName` and `prompt` fields.

For each monitor instruction, launch a background subagent:
```
Agent tool:
  description: "Monitor container <containerName>"
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

- **Clean up:** Run `${CLAUDE_PLUGIN_ROOT}/bin/run.js stop <name> && ${CLAUDE_PLUGIN_ROOT}/bin/run.js rm <name>`
- **Keep:** Do nothing — container stays running for inspection via `attach`

## Fallback: Manual Monitoring

If subagent monitoring fails or isn't available, fall back to manual polling:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run.js logs <name>
```

Poll every ~30 seconds. Look for:

| Log pattern | Meaning | Action |
|-------------|---------|--------|
| `=== Claude exited with code 0 ===` | Success | Report success, include branch/PR info |
| `=== Claude exited with code` (non-zero) | Failure | Report failure, suggest `attach` to inspect |
| `Creating pull request...` | PR was created | Capture and report the PR URL |
| Claude appears to be asking a question | Needs input | Alert user to `attach` |

## Error Handling

- **No git remote:** Stop and tell the user. Do not guess repos.
- **Plugin broken:** Tell user to check plugin installation.
- **Container fails to start:** Show the full CLI error output. Suggest `docker ps` to check Docker.
- **Container stops unexpectedly:** Report and suggest using `logs` and `attach` commands.
- **Monitor subagent crashes:** Container keeps running. User can manually check with `logs` or `attach`.

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
| Multiple targets ("issues 12, 15, 23") | Launch one sandbox per target |

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

Construct and run the command:
```bash
${CLAUDE_PLUGIN_ROOT}/bin/run.js start --repo <org/repo> [--issue N | --pr N | --prompt "..."] [--create-pr] [--name <name>]
```

Rules:
- Add `--create-pr` by default for issue-based tasks. Do NOT add it for PR reviews.
- Always pass `--name` with a short, descriptive slug for the task (e.g., `--name fix-auth-bug`, `--name add-allowlist`). If the user specified a name, use that instead.
- For **multiple targets**, launch each sandbox in parallel using separate Bash calls or the dispatching-parallel-agents skill.

After each successful launch, **always** print:
```
To SSH into the container: ${CLAUDE_PLUGIN_ROOT}/bin/run.js attach <name>
```

## Step 4: Monitor

After launching, poll for completion. Use a background Bash command or periodic checks:

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run.js logs <name>
```

**What to look for:**

| Log pattern | Meaning | Action |
|-------------|---------|--------|
| `=== Session complete.` | Claude finished | Report completion to user |
| `=== Claude exited with code 0 ===` | Success | Report success, include branch/PR info from logs |
| `=== Claude exited with code` (non-zero) | Failure | Report failure, suggest user inspect with attach |
| `Creating pull request...` | PR was created | Capture and report the PR URL |
| `WARNING: push failed` | Push failed | Alert user |
| `WARNING: PR creation failed` | PR creation failed | Alert user |
| Claude appears to be asking a question or waiting | Needs input | Alert user: "The sandbox appears to need input. Attach to interact." |

**Polling cadence:**
- Check every ~30 seconds
- If the container is no longer running (check `ls` command), stop polling and report final status

**For multiple sandboxes:** Track and poll each independently. Report status as each finishes.

## Step 5: Report

When a sandbox completes, summarize:
- Exit status (success/failure)
- Branch name (from logs)
- PR link if one was created
- Any warnings from the logs
- Remind user they can inspect with the `attach` command if needed

## Error Handling

- **No git remote:** Stop and tell the user. Do not guess repos.
- **Plugin broken:** Tell user to check plugin installation.
- **Container fails to start:** Show the full CLI error output. Suggest `docker ps` to check Docker.
- **Container stops unexpectedly:** Report and suggest using `logs` and `attach` commands.
- **Polling fails:** If logs fail (e.g., container removed), stop polling and report.

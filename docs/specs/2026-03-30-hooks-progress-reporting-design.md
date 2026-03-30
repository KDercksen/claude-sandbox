# Replace Prompt-Based Progress Reporting with Hooks

**Issue:** #14
**Date:** 2026-03-30

## Problem

Progress reporting uses ~30 lines of prompt instructions telling Claude to emit `@@PHASE`, `@@UPDATE`, and `@@ARTIFACT` markers to `/workspace/.claude-progress`. This costs tokens on every task and is unreliable since Claude may skip or inconsistently emit markers.

## Solution

Replace prompt-based progress markers with a Claude Code `PreToolUse` hook that automatically logs every tool invocation. The monitor agent interprets raw tool events into phases instead of consuming pre-parsed phase markers.

## Design

### 1. Hook Script — `docker/progress-hook.sh`

A shell script registered as a `PreToolUse` hook. On every tool call it:

1. Reads JSON from stdin (Claude Code passes `{ "tool_name": "...", "tool_input": {...} }`)
2. Extracts tool name and key arguments via `jq`:
   - `Read`/`Grep`/`Glob`: file path or pattern
   - `Edit`/`Write`: file path
   - `Bash`: command string (truncated to ~200 chars)
3. Appends a single line to `/workspace/.claude-progress`:
   ```
   @@TOOL("Write", "/workspace/src/auth.ts")
   @@TOOL("Bash", "npm test")
   @@TOOL("Grep", "pattern=handleAuth, glob=**/*.ts")
   ```
4. Exits 0 — never blocks tool execution

Stateless, fast, no side effects beyond the append.

### 2. Hook Configuration — injected in `entrypoint.sh`

After copying the host Claude config, `entrypoint.sh` merges the hook into `~/.claude/settings.json`:

```bash
jq '.hooks.PreToolUse = (.hooks.PreToolUse // []) + [{"matcher": "", "command": "/usr/local/bin/progress-hook.sh"}]' settings.json
```

Empty matcher matches all tools. Preserves any existing settings/hooks from the host config.

### 3. Prompt Template Changes — `prompt-template.md`

- **Remove** the ~30 lines of progress marker instructions (lines 32-58: @@PHASE, @@UPDATE, @@ARTIFACT format, examples, verification phase requirement)
- **Add** test suite guard: "Do not install test frameworks or write tests unless the repo already has a configured test suite. Check for existing test config (package.json test scripts, pytest.ini, Makefile test targets, etc.) before running any tests."

### 4. Monitor Updates — `build_monitor_prompt()` in `claude-sandbox`

Update the monitor prompt to:

- Parse `@@TOOL("name", "detail")` lines instead of `@@PHASE`/`@@UPDATE`/`@@ARTIFACT`
- Infer phases from tool patterns:
  - Run of `Read`/`Grep`/`Glob` → exploring
  - `Edit`/`Write` → implementing
  - `Bash` with test-like commands → verifying
- Report phase transitions and notable activity to the user
- Completion detection unchanged (`.claude-done` file)

### 5. Wrapper Markers — `claude-wrapper.sh`

- Replace `@@PHASE("starting")` with `@@START`
- Replace `@@PHASE("finishing")` with `@@FINISH`
- Keep all completion gates (verification check, test result check, auto-commit, auto-push) unchanged
- Update grep patterns for completion gates to work with the new `@@TOOL` format (e.g., check for `@@TOOL("Bash"` with test commands instead of `@@ARTIFACT("test:`)

### 6. Gitignore — container-level

Add `.claude-progress` and `.claude-done` to `.gitignore` inside the container (via entrypoint or wrapper) so progress files don't get committed to repos.

## What does NOT change

- Completion gates in `claude-wrapper.sh` — stays as deterministic post-execution checks
- Monitor polling mechanism — still polls via `docker exec ... cat .claude-progress`
- Container lifecycle — spawn, run, monitor, cleanup flow unchanged
- `.claude-done` completion signal

## Files Changed

| File | Change |
|------|--------|
| `docker/progress-hook.sh` | **New** — hook script |
| `docker/Dockerfile` | Copy `progress-hook.sh` into image |
| `docker/entrypoint.sh` | Inject hook config into `settings.json` |
| `docker/claude-wrapper.sh` | Update markers to `@@START`/`@@FINISH`, update gate grep patterns |
| `prompt-template.md` | Remove progress instructions, add test suite guard |
| `claude-sandbox` | Update `build_monitor_prompt()` for new format |

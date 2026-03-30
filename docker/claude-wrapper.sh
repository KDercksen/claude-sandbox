#!/bin/bash
set -euo pipefail

cd /workspace

# Write start marker
echo '@@START' >> /workspace/.claude-progress

# Run Claude in headless mode
set +e
claude -p --dangerously-skip-permissions "${PROMPT}"
EXIT_CODE=$?
set -e

# Write completion marker and exit code
echo '@@FINISH' >> /workspace/.claude-progress
echo "@@EXIT(${EXIT_CODE})" >> /workspace/.claude-progress

# Completion gate: check if any test-like Bash commands were run
if ! grep -qE '@@TOOL\("Bash", ".*(test|pytest|jest|vitest|mocha|cargo test|go test|make test)' /workspace/.claude-progress 2>/dev/null; then
    echo '@@WARN("No test commands detected in tool log")' >> /workspace/.claude-progress
fi

# Safety net: commit any leftover uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo '@@WARN("Committing leftover uncommitted changes")' >> /workspace/.claude-progress
    git add -A
    COMMIT_MSG="claude-sandbox: uncommitted changes from session"
    git commit -m "$COMMIT_MSG" || true
fi

# Safety net: push if branch exists but wasn't pushed
if [ -n "${BRANCH:-}" ]; then
    LOCAL_SHA=$(git rev-parse HEAD)
    REMOTE_SHA=$(git rev-parse "origin/${BRANCH}" 2>/dev/null || echo "none")
    if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
        git push -u origin "${BRANCH}" 2>&1 || echo '@@WARN("Push failed")' >> /workspace/.claude-progress
    fi
fi

# Write final done marker
echo "${EXIT_CODE}" > /workspace/.claude-done

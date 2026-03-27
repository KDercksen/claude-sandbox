#!/bin/bash
set -euo pipefail

cd /workspace

echo "=== Starting Claude Code ==="
echo "Prompt: ${PROMPT}"
echo ""

# Run Claude
set +e
claude --dangerously-skip-permissions -p "${PROMPT}"
EXIT_CODE=$?
set -e

echo ""
echo "=== Claude exited with code ${EXIT_CODE} ==="

# Safety net: commit any leftover uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "WARNING: Found uncommitted changes, committing..."
    git add -A
    git commit -m "claude-sandbox: uncommitted changes from session" || true
fi

# Safety net: push if branch exists but wasn't pushed
if [ -n "${BRANCH:-}" ]; then
    LOCAL_SHA=$(git rev-parse HEAD)
    REMOTE_SHA=$(git rev-parse "origin/${BRANCH}" 2>/dev/null || echo "none")
    if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
        echo "Pushing unpushed changes on ${BRANCH}..."
        git push -u origin "${BRANCH}" 2>&1 || echo "WARNING: push failed"
    fi
fi

# Write completion marker
echo "${EXIT_CODE}" > /workspace/.claude-done
echo ""
echo "=== Session complete. Container stays alive for inspection. ==="
echo "To resume work, run: claude --dangerously-skip-permissions"

# Drop into a shell so tmux session stays open
exec bash

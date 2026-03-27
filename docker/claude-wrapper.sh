#!/bin/bash
set -euo pipefail

cd /workspace

# Write start marker
echo '@@PHASE("starting")' >> /workspace/.claude-progress

# Run Claude in headless mode
set +e
claude -p --dangerously-skip-permissions "${PROMPT}"
EXIT_CODE=$?
set -e

# Write completion phase
echo '@@PHASE("finishing")' >> /workspace/.claude-progress
echo "@@ARTIFACT(\"exit: ${EXIT_CODE}\")" >> /workspace/.claude-progress

# Safety net: commit any leftover uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo '@@UPDATE("Committing leftover uncommitted changes")' >> /workspace/.claude-progress
    git add -A
    COMMIT_MSG="claude-sandbox: uncommitted changes from session"
    git commit -m "$COMMIT_MSG" || true
    echo "@@ARTIFACT(\"commit: ${COMMIT_MSG}\")" >> /workspace/.claude-progress
fi

# Safety net: push if branch exists but wasn't pushed
if [ -n "${BRANCH:-}" ]; then
    LOCAL_SHA=$(git rev-parse HEAD)
    REMOTE_SHA=$(git rev-parse "origin/${BRANCH}" 2>/dev/null || echo "none")
    if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
        echo '@@UPDATE("Pushing unpushed changes")' >> /workspace/.claude-progress
        git push -u origin "${BRANCH}" 2>&1 || echo '@@UPDATE("WARNING: push failed")' >> /workspace/.claude-progress
    fi
fi

# Write final completion marker
echo "${EXIT_CODE}" > /workspace/.claude-done

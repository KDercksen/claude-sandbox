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

# Stage and commit any uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Committing remaining changes..."
    git add -A
    git commit -m "claude-sandbox: uncommitted changes from session" || true
fi

# Push if we have a branch
if [ -n "${BRANCH:-}" ]; then
    echo "Pushing branch ${BRANCH}..."
    git push -u origin "${BRANCH}" 2>&1 || echo "WARNING: push failed"
fi

# Create PR if requested
if [ "${CREATE_PR:-false}" = "true" ] && [ -n "${BRANCH:-}" ]; then
    echo "Creating pull request..."
    gh pr create \
      --title "Claude Sandbox: ${BRANCH}" \
      --body "Automated PR created by claude-sandbox." \
      --head "${BRANCH}" \
      2>&1 || echo "WARNING: PR creation failed"
fi

# Write completion marker
echo "${EXIT_CODE}" > /workspace/.claude-done
echo ""
echo "=== Session complete. Container stays alive for inspection. ==="
echo "To resume work, run: claude --dangerously-skip-permissions"

# Drop into a shell so tmux session stays open
exec bash

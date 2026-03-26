#!/bin/bash
set -euo pipefail

echo "=== Claude Sandbox starting ==="

# 1. Init firewall
sudo /usr/local/bin/init-firewall.sh

# 2. Start SSH daemon
sudo /usr/sbin/sshd

# 3. Configure git credentials using PAT
git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=${GITHUB_TOKEN}"; }; f'
git config --global user.name "Claude Sandbox"
git config --global user.email "claude@sandbox.local"

# 4. Authenticate gh CLI
echo "${GITHUB_TOKEN}" | gh auth login --with-token

# 5. Clone repo
echo "Cloning ${REPO}..."
git clone "https://github.com/${REPO}.git" /workspace
cd /workspace

# 6. Checkout or create branch
if [ -n "${BRANCH:-}" ]; then
    echo "Checking out branch: ${BRANCH}"
    git checkout -b "${BRANCH}" 2>/dev/null || git checkout "${BRANCH}"
fi

# 7. Launch claude inside tmux via wrapper
echo "Starting Claude in tmux session..."
tmux new-session -d -s claude /usr/local/bin/claude-wrapper.sh

echo "=== Claude Sandbox ready ==="
echo "Container will stay alive for SSH access."

# 8. Keep container alive
exec tail -f /dev/null

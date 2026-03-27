#!/bin/bash
set -euo pipefail

echo "=== Claude Sandbox starting ==="

# 1. Init firewall
sudo /usr/local/bin/init-firewall.sh

# 2. Start SSH daemon
sudo /usr/sbin/sshd

# 3. Copy read-only mounted Claude config to writable locations.
#    Bind-mounted files may be owned by root with restrictive perms,
#    so we use sudo to read them and fix ownership.
if [ -f /home/claude/.claude.json.host ]; then
    sudo cp /home/claude/.claude.json.host /home/claude/.claude.json
    sudo chown claude:claude /home/claude/.claude.json
fi
if [ -d /home/claude/.claude.host ]; then
    sudo cp -a /home/claude/.claude.host/. /home/claude/.claude/
    sudo chown -R claude:claude /home/claude/.claude
fi

# 4. Configure git credentials using PAT
git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=${GITHUB_TOKEN}"; }; f'
git config --global user.name "Claude Sandbox"
git config --global user.email "claude@sandbox.local"

# 5. Authenticate gh CLI
# gh respects the GITHUB_TOKEN env var directly, so explicit login is only
# needed when the env var approach isn't available. Tolerate failure here
# since newer gh versions exit 1 when GITHUB_TOKEN is already set.
echo "${GITHUB_TOKEN}" | gh auth login --with-token 2>/dev/null || true

# 6. Clone repo
echo "Cloning ${REPO}..."
git clone "https://github.com/${REPO}.git" /workspace
cd /workspace

# 7. Checkout or create branch
if [ -n "${BRANCH:-}" ]; then
    echo "Checking out branch: ${BRANCH}"
    git checkout -b "${BRANCH}" 2>/dev/null || git checkout "${BRANCH}"
fi

# 8. Launch claude inside tmux via wrapper
echo "Starting Claude in tmux session..."
tmux new-session -d -s claude /usr/local/bin/claude-wrapper.sh

echo "=== Claude Sandbox ready ==="
echo "Container will stay alive for SSH access."

# 9. Keep container alive
exec tail -f /dev/null

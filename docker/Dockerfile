FROM node:20-bookworm

ARG CLAUDE_CODE_VERSION=latest

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  curl \
  build-essential \
  jq \
  openssh-server \
  tmux \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  sudo \
  procps \
  less \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv (astral)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Create claude user
RUN useradd -m -s /bin/bash -G sudo claude \
  && echo "claude ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/claude \
  && chmod 0440 /etc/sudoers.d/claude

# SSH server setup
RUN mkdir /var/run/sshd \
  && sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config \
  && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config \
  && sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Prepare directories
RUN mkdir -p /workspace /home/claude/.ssh /home/claude/.claude \
  && chown -R claude:claude /workspace /home/claude/.ssh /home/claude/.claude \
  && chmod 700 /home/claude/.ssh

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Copy scripts
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY claude-wrapper.sh /usr/local/bin/claude-wrapper.sh

RUN chmod +x /usr/local/bin/init-firewall.sh \
  /usr/local/bin/entrypoint.sh \
  /usr/local/bin/claude-wrapper.sh

# Restrict firewall script to sudo only
RUN echo "claude ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/claude-firewall \
  && chmod 0440 /etc/sudoers.d/claude-firewall

WORKDIR /workspace
USER claude

EXPOSE 22

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

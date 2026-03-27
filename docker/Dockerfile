FROM node:20-bookworm

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
  git \
  curl \
  build-essential \
  jq \
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
  && echo "claude ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh, /usr/bin/cp, /usr/bin/chown, /usr/sbin/iptables, /usr/sbin/ipset" > /etc/sudoers.d/claude \
  && chmod 0440 /etc/sudoers.d/claude

# Prepare directories
RUN mkdir -p /workspace /home/claude/.claude \
  && chown -R claude:claude /workspace /home/claude/.claude

# Install Claude Code (as claude user so it goes in ~claude/.claude/)
USER claude
RUN curl -fsSL https://claude.ai/install.sh | bash
USER root
ENV PATH="/home/claude/.claude/local/bin:${PATH}"

# Copy scripts
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY claude-wrapper.sh /usr/local/bin/claude-wrapper.sh

RUN chmod +x /usr/local/bin/init-firewall.sh \
  /usr/local/bin/entrypoint.sh \
  /usr/local/bin/claude-wrapper.sh


WORKDIR /workspace
USER claude

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

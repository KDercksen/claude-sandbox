# Why I built claude-sandbox

Claude Code is remarkably capable when you let it off the leash. Give it `--dangerously-skip-permissions` and it can clone repos, write code, run tests, commit, push, and open PRs — all without human intervention. The problem is the name says it all: it's dangerous. You're handing an AI unrestricted shell access on your machine.

I wanted the autonomy without the anxiety.

## The core tension

The most productive way to use Claude Code is to give it a task and walk away. Point it at a GitHub issue, let it read the codebase, write a fix, run the tests, and open a PR. But doing that on your host machine means trusting it not to `rm -rf` something important, not to exfiltrate your SSH keys, not to curl something it shouldn't, and not to accidentally reach your company's internal services.

You can babysit it — approve every shell command, every file write — but then you've lost the whole point. You're back to being a human in the loop for mechanical work.

The answer is obvious: run it in a container. But a naive Docker container isn't enough. By default, containers have full outbound network access. Claude could still phone home to anywhere, download anything, or exfiltrate code to an arbitrary endpoint. You need the container to be a real sandbox, not just process isolation.

## What this project does about it

claude-sandbox wraps Claude Code in Docker containers with a strict network allowlist. The firewall drops all outbound traffic by default and only allows connections to services Claude legitimately needs: GitHub (for git operations and PRs), the Anthropic API (for inference), and package registries (npm, PyPI). Everything else — arbitrary websites, internal services, SMTP, direct IP connections — is blocked.

This means you can confidently run `claude-sandbox start --repo owner/repo --issue 42 --create-pr` and walk away. Claude will clone the repo, read the issue, write the code, push a branch, and open a PR. If it tries to do anything unexpected on the network, the firewall stops it. If it breaks something in the container, you just `rm` it and start fresh.

## Why the firewall matters

Container isolation alone protects your host filesystem and processes. The network hardening protects everything else. Without it, a containerized Claude could still:

- Reach internal services on your network
- Send code or data to arbitrary external endpoints
- Be used as a pivot point if a prompt injection tricks it into making requests
- Download and execute untrusted code from anywhere on the internet

The allowlist approach is deliberately conservative. DNS resolution happens at container boot, IPs are locked into an ipset, and the default policy is DROP with an explicit REJECT rule so blocked connections fail fast instead of timing out. The firewall even self-tests on startup — it verifies that `example.com` is blocked and `api.github.com` is reachable before declaring itself ready.

## The developer experience I wanted

The workflow I had in mind is simple: you wake up, look at your issue tracker, and dispatch the straightforward ones to sandboxed Claude agents. Each one gets its own container, its own branch, its own isolated environment. You go do the work that actually requires human judgment. When you come back, there are PRs waiting for review.

The CLI is designed around this. `start` launches a container and kicks off Claude with a prompt assembled from the issue or PR you point it at. `logs` and `attach` let you peek in or take over if needed. `ls` shows what's running. `stop` and `rm` clean up. It's meant to feel like managing background jobs, because that's what they are.

## The bigger picture

I think the near-term future of software development involves a lot more AI agents working in parallel on real codebases. But that only works if you can trust the execution environment. "Just run it in Docker" is the right instinct, but the details matter — network policy, credential handling, non-root execution, no Docker socket access, read-only config mounts. Getting those details right is the difference between a demo and something you'd actually leave running overnight.

claude-sandbox is my answer to: "How do I get Claude to do the boring work autonomously, without worrying about what it might do?" Build a proper sandbox, lock down the network, and let it work.

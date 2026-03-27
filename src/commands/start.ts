// src/commands/start.ts
import {Command, Flags} from '@oclif/core'
import {execFile} from 'node:child_process'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'

import {getConfigDir, loadConfig} from '../lib/config.js'
import {generateContainerName} from '../lib/container-name.js'
import {SandboxDocker} from '../lib/docker.js'
import {buildPrompt} from '../lib/prompt-builder.js'
import {ensureSSHKeyPair} from '../lib/ssh.js'

const execFileAsync = promisify(execFile)

export default class Start extends Command {
  static description = 'Start a new Claude sandbox container'
  static flags = {
    branch: Flags.string({
      char: 'b',
      description: 'Git branch to create or checkout',
    }),
    'create-pr': Flags.boolean({
      default: false,
      description: 'Create a PR when Claude finishes',
    }),
    issue: Flags.integer({
      char: 'i',
      description: 'GitHub issue number to fetch as context',
    }),
    'allow-domain': Flags.string({
      description: 'Extra domain to allow through the container firewall (repeatable)',
      multiple: true,
    }),
    name: Flags.string({
      description: 'Container name (auto-generated if omitted)',
    }),
    pr: Flags.integer({
      description: 'GitHub PR number to fetch as context',
    }),
    prompt: Flags.string({
      char: 'p',
      description: 'Prompt for Claude',
    }),
    repo: Flags.string({
      char: 'r',
      description: 'GitHub repo (org/name)',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Start)
    const config = await loadConfig()
    const configDir = getConfigDir()

    // Validate that at least one prompt source is given
    if (!flags.prompt && !flags.issue && !flags.pr) {
      this.error('Provide at least one of --prompt, --issue, or --pr')
    }

    // Build the prompt
    this.log('Building prompt...')
    const prompt = await buildPrompt({
      issue: flags.issue,
      pr: flags.pr,
      prompt: flags.prompt,
      repo: flags.repo,
    })

    // Resolve GitHub token
    const githubToken = await this.resolveGitHubToken(config.githubPat)

    // Ensure SSH keypair exists
    const keys = await ensureSSHKeyPair(configDir)

    // Generate container name
    const containerName = generateContainerName(flags.repo, flags.name)

    // Generate branch name if not provided but --create-pr is set
    let {branch} = flags
    if (!branch && flags['create-pr']) {
      branch = `${config.defaultBranchPrefix}${containerName}`
    }

    // Find a free SSH port
    const docker = new SandboxDocker()
    const sshPort = await docker.findFreePort(config.sshPortRange[0], config.sshPortRange[1])

    this.log(`Starting container ${containerName}...`)

    // Combine config and flag allowed domains (additive)
    const extraAllowedDomains = [
      ...config.allowedDomains,
      ...(flags['allow-domain'] ?? []),
    ]

    const info = await docker.createAndStartContainer({
      branch,
      claudeConfigDir: join(homedir(), '.claude'),
      claudeConfigFile: join(homedir(), '.claude.json'),
      createPr: flags['create-pr'],
      extraAllowedDomains,
      githubToken,
      image: config.image,
      name: containerName,
      prompt,
      repo: flags.repo,
      sshPort,
      sshPublicKeyPath: keys.publicKeyPath,
    })

    this.log('')
    this.log(`Container started: ${info.name}`)
    this.log(`  Repo:     ${info.repo}`)
    this.log(`  SSH port: ${info.sshPort}`)
    this.log(`  Attach:   claude-sandbox attach ${info.name}`)
    this.log(`  Logs:     claude-sandbox logs ${info.name}`)
  }

  private async resolveGitHubToken(configPat?: string): Promise<string> {
    if (configPat) return configPat

    try {
      const {stdout} = await execFileAsync('gh', ['auth', 'token'])
      const token = stdout.trim()
      if (token) return token
    } catch {
      // gh not available or not logged in
    }

    this.error('No GitHub token found. Set github_pat in config or run "gh auth login".')
  }
}

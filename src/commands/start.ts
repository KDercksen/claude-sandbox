// src/commands/start.ts
import {Command, Flags} from '@oclif/core'

import {loadConfig} from '../lib/config.js'
import {resolveGitHubToken} from '../lib/github-token.js'
import {spawnContainer} from '../lib/spawn.js'

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

    if (!flags.prompt && !flags.issue && !flags.pr) {
      this.error('Provide at least one of --prompt, --issue, or --pr')
    }

    let githubToken: string
    try {
      githubToken = await resolveGitHubToken(config.githubPat)
    } catch (error) {
      this.error(error instanceof Error ? error.message : 'No GitHub token found.')
    }

    this.log('Starting container...')

    const result = await spawnContainer({
      branch: flags.branch,
      createPr: flags['create-pr'],
      githubToken,
      issue: flags.issue,
      name: flags.name,
      pr: flags.pr,
      prompt: flags.prompt,
      repo: flags.repo,
    })

    this.log('')
    this.log(`Container started: ${result.containerName}`)
    this.log(`  Repo:     ${result.repo}`)
    this.log(`  SSH port: ${result.sshPort}`)
    this.log(`  Attach:   claude-sandbox attach ${result.containerName}`)
    this.log(`  Logs:     claude-sandbox logs ${result.containerName}`)
  }
}

// src/commands/run.ts
import {Command, Flags} from '@oclif/core'

import {loadConfig} from '../lib/config.js'
import {resolveGitHubToken} from '../lib/github-token.js'
import {spawnContainer, type SpawnResult} from '../lib/spawn.js'

export default class Run extends Command {
  static description = 'Start sandbox containers with background monitoring via Claude Code subagents'
  static flags = {
    branch: Flags.string({
      char: 'b',
      description: 'Git branch (single container only)',
    }),
    'create-pr': Flags.boolean({
      default: false,
      description: 'Create a PR when Claude finishes',
    }),
    issue: Flags.integer({
      char: 'i',
      description: 'GitHub issue number(s)',
      multiple: true,
    }),
    name: Flags.string({
      description: 'Container name (single container only)',
    }),
    pr: Flags.integer({
      description: 'GitHub PR number(s)',
      multiple: true,
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
    const {flags} = await this.parse(Run)
    const config = await loadConfig()

    // Collect targets: each issue/PR is a separate container, prompt is one container
    const targets = this.buildTargets(flags)
    if (targets.length === 0) {
      this.error('Provide at least one of --prompt, --issue, or --pr')
    }

    // Validate single-container flags
    if (targets.length > 1 && (flags.branch || flags.name)) {
      this.error('--branch and --name can only be used with a single target')
    }

    // Resolve shared resources once
    let githubToken: string
    try {
      githubToken = await resolveGitHubToken(config.githubPat)
    } catch (error) {
      this.error(error instanceof Error ? error.message : 'No GitHub token found.')
    }

    // Spawn all containers concurrently
    this.log(`Spawning ${targets.length} container${targets.length > 1 ? 's' : ''}...`)

    const results = await Promise.allSettled(
      targets.map((target) =>
        spawnContainer({
          branch: flags.branch,
          createPr: flags['create-pr'],
          githubToken,
          issue: target.issue,
          name: flags.name,
          pr: target.pr,
          prompt: target.prompt,
          repo: flags.repo,
        }),
      ),
    )

    // Report results and collect successful spawns
    const spawned: SpawnResult[] = []
    for (const [i, result] of results.entries()) {
      const target = targets[i]
      const label = target.issue ? `issue #${target.issue}` : target.pr ? `PR #${target.pr}` : 'prompt'

      if (result.status === 'fulfilled') {
        spawned.push(result.value)
        this.log(`  [ok] ${result.value.containerName} (${label})`)
      } else {
        this.log(`  [fail] ${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
      }
    }

    if (spawned.length === 0) {
      this.error('All containers failed to start')
    }

    // Print monitoring instructions
    this.log('')
    this.log('Containers are running. Monitor subagents will report milestones.')
    this.log('You can also use these commands manually:')
    for (const s of spawned) {
      this.log(`  logs:   claude-sandbox logs ${s.containerName}`)
      this.log(`  attach: claude-sandbox attach ${s.containerName}`)
    }

    // Print subagent launch instructions for Claude Code
    this.log('')
    this.log('--- MONITOR SUBAGENT INSTRUCTIONS ---')
    for (const s of spawned) {
      this.log(JSON.stringify(this.buildMonitorPrompt(s)))
    }
  }

  private buildMonitorPrompt(result: SpawnResult): {containerName: string; prompt: string} {
    return {
      containerName: result.containerName,
      prompt: [
        `Monitor the Docker container "${result.containerName}" (repo: ${result.repo}).`,
        '',
        'Your job:',
        '1. Every 10 seconds, capture the tmux output by running:',
        `   claude-sandbox logs ${result.containerName}`,
        '2. Read the output and identify milestone events:',
        '   - Repository cloned',
        '   - Tests running / passing / failing',
        '   - Commits made',
        '   - PR created (extract the URL)',
        '   - Claude finished or errored',
        '3. Report each milestone to the user ONCE (no duplicates).',
        '4. Also check for completion by running:',
        `   docker exec ${result.containerName} cat /workspace/.claude-done 2>/dev/null`,
        '   If the command succeeds, Claude is done. The output is the exit code.',
        '5. On completion, report:',
        '   - Exit code (0 = success)',
        '   - PR URL if one was created',
        '   - Brief summary of what happened',
        '   Then ask the user: "Keep or clean up this container?"',
        '',
        'Error handling:',
        '- If a command fails, retry up to 3 consecutive times before reporting a problem.',
        '- A single successful poll resets the failure counter.',
        '',
        'For cleanup, run: claude-sandbox stop <name> && claude-sandbox rm <name>',
      ].join('\n'),
    }
  }

  private buildTargets(flags: {issue?: number[]; pr?: number[]; prompt?: string}): Array<{issue?: number; pr?: number; prompt?: string}> {
    const targets: Array<{issue?: number; pr?: number; prompt?: string}> = []

    if (flags.prompt) {
      targets.push({prompt: flags.prompt})
    }

    if (flags.issue) {
      for (const issue of flags.issue) {
        targets.push({issue})
      }
    }

    if (flags.pr) {
      for (const pr of flags.pr) {
        targets.push({pr})
      }
    }

    return targets
  }
}

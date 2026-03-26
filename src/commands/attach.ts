// src/commands/attach.ts
import {Args, Command} from '@oclif/core'
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'

import {getConfigDir} from '../lib/config.js'
import {SandboxDocker} from '../lib/docker.js'

export default class Attach extends Command {
  static args = {
    name: Args.string({description: 'Container name', required: true}),
  }
  static description = 'SSH into a sandbox container and attach to the Claude tmux session'

  async run(): Promise<void> {
    const {args} = await this.parse(Attach)
    const docker = new SandboxDocker()

    const containers = await docker.listContainers()
    const container = containers.find((c) => c.name === args.name)

    if (!container) {
      this.error(`Container "${args.name}" not found. Run "claude-sandbox ls" to see available containers.`)
    }

    if (container.status !== 'running') {
      this.error(`Container "${args.name}" is not running (status: ${container.status}).`)
    }

    const configDir = getConfigDir()
    const keyPath = join(configDir, 'ssh', 'id_ed25519')

    this.log(`Attaching to ${args.name} on port ${container.sshPort}...`)

    // Replace current process with SSH
    execFileSync('ssh', [
      '-i', keyPath,
      '-p', String(container.sshPort),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
      'claude@localhost',
      '-t', 'tmux attach -t claude',
    ], {stdio: 'inherit'})
  }
}

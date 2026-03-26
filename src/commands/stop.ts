// src/commands/stop.ts
import {Args, Command} from '@oclif/core'

import {SandboxDocker} from '../lib/docker.js'

export default class Stop extends Command {
  static args = {
    name: Args.string({description: 'Container name', required: true}),
  }
  static description = 'Stop a sandbox container (keeps it for inspection)'

  async run(): Promise<void> {
    const {args} = await this.parse(Stop)
    const docker = new SandboxDocker()

    this.log(`Stopping ${args.name}...`)
    await docker.stopContainer(args.name)
    this.log(`Container ${args.name} stopped.`)
  }
}

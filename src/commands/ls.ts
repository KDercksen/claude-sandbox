import {Command} from '@oclif/core'

import {SandboxDocker} from '../lib/docker.js'

export default class Ls extends Command {
  static description = 'List running and stopped sandbox containers'

  async run(): Promise<void> {
    await this.parse(Ls)
    const docker = new SandboxDocker()
    const containers = await docker.listContainers()

    if (containers.length === 0) {
      this.log('No sandbox containers found.')
      return
    }

    // Header
    this.log(
      formatRow('NAME', 'REPO', 'STATUS', 'SSH PORT', 'CREATED'),
    )

    for (const c of containers) {
      this.log(
        formatRow(c.name, c.repo, c.status, String(c.sshPort), c.created),
      )
    }
  }
}

function formatRow(...cols: string[]): string {
  const widths = [30, 25, 12, 10, 25]
  return cols.map((col, i) => col.padEnd(widths[i] ?? 20)).join('')
}

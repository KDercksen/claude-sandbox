// src/commands/build.ts
import {Command, Flags} from '@oclif/core'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {loadConfig} from '../lib/config.js'
import {SandboxDocker} from '../lib/docker.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default class Build extends Command {
  static description = 'Build or rebuild the claude-sandbox Docker image'
  static flags = {
    tag: Flags.string({
      description: 'Image tag',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Build)
    const config = await loadConfig()
    const tag = flags.tag ?? config.image

    this.log(`Building image ${tag}...`)

    const dockerDir = path.resolve(__dirname, '../../docker')
    const docker = new SandboxDocker()

    try {
      await docker.buildImage(dockerDir, tag)
      this.log(`Image ${tag} built successfully.`)
    } catch (error: unknown) {
      this.error(`Build failed: ${(error as Error).message}`)
    }
  }
}

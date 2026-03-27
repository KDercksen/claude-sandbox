import {homedir} from 'node:os'
import {join} from 'node:path'

import {getConfigDir, loadConfig} from './config.js'
import {generateContainerName} from './container-name.js'
import {SandboxDocker} from './docker.js'
import {buildPrompt, type PromptSource} from './prompt-builder.js'
import {ensureSSHKeyPair} from './ssh.js'

export interface SpawnOptions {
  branch?: string
  createPr: boolean
  defaultBranchPrefix?: string
  githubToken: string
  image?: string
  issue?: number
  name?: string
  pr?: number
  prompt?: string
  repo: string
  sshPortRange?: [number, number]
}

export interface SpawnResult {
  branch?: string
  containerName: string
  repo: string
  sshPort: number
}

export interface SpawnDeps {
  docker: SandboxDocker
  exec?: (cmd: string, args: string[]) => Promise<string>
}

export async function spawnContainer(opts: SpawnOptions, deps?: Partial<SpawnDeps>): Promise<SpawnResult> {
  const config = await loadConfig()
  const configDir = getConfigDir()
  const image = opts.image ?? config.image
  const portRange = opts.sshPortRange ?? config.sshPortRange
  const branchPrefix = opts.defaultBranchPrefix ?? config.defaultBranchPrefix

  // Build prompt
  const source: PromptSource = {
    issue: opts.issue,
    pr: opts.pr,
    prompt: opts.prompt,
    repo: opts.repo,
  }
  const prompt = await buildPrompt(source, deps?.exec, {createPr: opts.createPr})

  // Ensure SSH keypair
  const keys = await ensureSSHKeyPair(configDir)

  // Generate container name
  const containerName = generateContainerName(opts.repo, opts.name)

  // Resolve branch
  let {branch} = opts
  if (!branch && opts.createPr) {
    branch = `${branchPrefix}${containerName}`
  }

  // Find free port and create container
  const docker = deps?.docker ?? new SandboxDocker()
  const sshPort = await docker.findFreePort(portRange[0], portRange[1])

  await docker.createAndStartContainer({
    branch,
    claudeConfigDir: join(homedir(), '.claude'),
    claudeConfigFile: join(homedir(), '.claude.json'),
    createPr: opts.createPr,
    githubToken: opts.githubToken,
    image,
    name: containerName,
    prompt,
    repo: opts.repo,
    sshPort,
    sshPublicKeyPath: keys.publicKeyPath,
  })

  return {
    branch,
    containerName,
    repo: opts.repo,
    sshPort,
  }
}

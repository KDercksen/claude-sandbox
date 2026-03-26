// src/lib/config.ts
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

export interface SandboxConfig {
  githubPat?: string
  image: string
  sshPortRange: [number, number]
  defaultBranchPrefix: string
}

const DEFAULTS: SandboxConfig = {
  image: 'claude-sandbox:latest',
  sshPortRange: [2200, 2299],
  defaultBranchPrefix: 'claude/',
}

export function getConfigDir(): string {
  return join(homedir(), '.claude-sandbox')
}

export async function loadConfig(configDir?: string): Promise<SandboxConfig> {
  const dir = configDir ?? getConfigDir()
  const configPath = join(dir, 'config.json')

  try {
    const raw = await readFile(configPath, 'utf-8')
    const partial = JSON.parse(raw) as Partial<SandboxConfig>
    return {...DEFAULTS, ...partial}
  } catch {
    return {...DEFAULTS}
  }
}

export async function saveConfig(configDir: string | undefined, config: SandboxConfig): Promise<void> {
  const dir = configDir ?? getConfigDir()
  await mkdir(dir, {recursive: true})
  const configPath = join(dir, 'config.json')
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n')
}

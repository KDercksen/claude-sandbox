// test/lib/config.test.ts
import {expect} from 'chai'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {loadConfig, type SandboxConfig, saveConfig} from '../../src/lib/config.js'

describe('config', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-sandbox-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, {force: true, recursive: true})
  })

  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig(tempDir)
    expect(config.image).to.equal('claude-sandbox:latest')
    expect(config.sshPortRange).to.deep.equal([2200, 2299])
    expect(config.defaultBranchPrefix).to.equal('claude/')
    expect(config.githubPat).to.be.undefined
  })

  it('loads config from file', async () => {
    const configPath = join(tempDir, 'config.json')
    const data: SandboxConfig = {
      defaultBranchPrefix: 'bot/',
      githubPat: 'github_pat_test123',
      image: 'my-image:v2',
      sshPortRange: [3000, 3099] as [number, number],
    }
    const {writeFile} = await import('node:fs/promises')
    await writeFile(configPath, JSON.stringify(data))

    const config = await loadConfig(tempDir)
    expect(config.image).to.equal('my-image:v2')
    expect(config.sshPortRange).to.deep.equal([3000, 3099])
    expect(config.githubPat).to.equal('github_pat_test123')
  })

  it('saves config to file', async () => {
    const config: SandboxConfig = {
      defaultBranchPrefix: 'dev/',
      image: 'claude-sandbox:dev',
      sshPortRange: [4000, 4099] as [number, number],
    }
    await saveConfig(tempDir, config)

    const raw = await readFile(join(tempDir, 'config.json'), 'utf8')
    const saved = JSON.parse(raw)
    expect(saved.image).to.equal('claude-sandbox:dev')
  })

  it('merges partial config with defaults', async () => {
    const {writeFile} = await import('node:fs/promises')
    await writeFile(join(tempDir, 'config.json'), JSON.stringify({image: 'custom:v1'}))

    const config = await loadConfig(tempDir)
    expect(config.image).to.equal('custom:v1')
    expect(config.sshPortRange).to.deep.equal([2200, 2299])
  })
})

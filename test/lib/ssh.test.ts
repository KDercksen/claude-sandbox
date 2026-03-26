import {expect} from 'chai'
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {ensureSSHKeyPair} from '../../src/lib/ssh.js'

describe('ssh', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'claude-sandbox-ssh-'))
  })

  afterEach(async () => {
    await rm(tempDir, {force: true, recursive: true})
  })

  it('generates a new keypair when none exists', async () => {
    const keys = await ensureSSHKeyPair(tempDir)

    expect(keys.privateKeyPath).to.equal(join(tempDir, 'ssh', 'id_ed25519'))
    expect(keys.publicKeyPath).to.equal(join(tempDir, 'ssh', 'id_ed25519.pub'))

    const privStat = await stat(keys.privateKeyPath)
    expect(privStat.isFile()).to.be.true

    const pubContent = await readFile(keys.publicKeyPath, 'utf8')
    expect(pubContent).to.include('ssh-ed25519')
  })

  it('reuses existing keypair on subsequent calls', async () => {
    const first = await ensureSSHKeyPair(tempDir)
    const firstPub = await readFile(first.publicKeyPath, 'utf8')

    const second = await ensureSSHKeyPair(tempDir)
    const secondPub = await readFile(second.publicKeyPath, 'utf8')

    expect(firstPub).to.equal(secondPub)
  })
})

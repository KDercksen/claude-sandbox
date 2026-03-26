import {execFile} from 'node:child_process'
import {access, mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

export interface SSHKeyPair {
  privateKeyPath: string
  publicKeyPath: string
}

export async function ensureSSHKeyPair(configDir: string): Promise<SSHKeyPair> {
  const sshDir = join(configDir, 'ssh')
  const privateKeyPath = join(sshDir, 'id_ed25519')
  const publicKeyPath = join(sshDir, 'id_ed25519.pub')

  try {
    await access(privateKeyPath)
    await access(publicKeyPath)
    return {privateKeyPath, publicKeyPath}
  } catch {
    // Keys don't exist, generate them
  }

  await mkdir(sshDir, {recursive: true})

  await execFileAsync('ssh-keygen', [
    '-t', 'ed25519',
    '-f', privateKeyPath,
    '-N', '',  // no passphrase
    '-C', 'claude-sandbox',
  ])

  return {privateKeyPath, publicKeyPath}
}

import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

const execFileAsync = promisify(execFile)

type ExecFn = () => Promise<string>

async function defaultExec(): Promise<string> {
  const {stdout} = await execFileAsync('gh', ['auth', 'token'])
  return stdout
}

export async function resolveGitHubToken(configPat?: string, exec: ExecFn = defaultExec): Promise<string> {
  if (configPat) return configPat

  try {
    const output = await exec()
    const token = output.trim()
    if (token) return token
  } catch {
    // gh not available or not logged in
  }

  throw new Error('No GitHub token found. Set github_pat in config or run "gh auth login".')
}

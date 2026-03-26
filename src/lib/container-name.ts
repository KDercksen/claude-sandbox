import {randomBytes} from 'node:crypto'

const PREFIX = 'claude-sandbox'

function sanitize(input: string): string {
  return input
    .toLowerCase()
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function generateContainerName(repo: string, name?: string): string {
  if (name) {
    return `${PREFIX}-${sanitize(name)}`
  }

  const repoName = repo.split('/').pop() ?? 'sandbox'
  const suffix = randomBytes(3).toString('hex')
  return `${PREFIX}-${sanitize(repoName)}-${suffix}`
}

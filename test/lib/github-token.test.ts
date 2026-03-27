import {expect} from 'chai'

import {resolveGitHubToken} from '../../src/lib/github-token.js'

const execReturnsToken = async (): Promise<string> => 'ghp_clitoken\n'
const execThrows = async (): Promise<string> => { throw new Error('gh not found') }

describe('resolveGitHubToken', () => {
  it('returns config PAT when provided', async () => {
    const token = await resolveGitHubToken('ghp_configtoken')
    expect(token).to.equal('ghp_configtoken')
  })

  it('falls back to gh CLI when no config PAT', async () => {
    const token = await resolveGitHubToken(undefined, execReturnsToken)
    expect(token).to.equal('ghp_clitoken')
  })

  it('throws when no token available', async () => {
    try {
      await resolveGitHubToken(undefined, execThrows)
      expect.fail('should have thrown')
    } catch (error: unknown) {
      expect((error as Error).message).to.include('No GitHub token found')
    }
  })
})

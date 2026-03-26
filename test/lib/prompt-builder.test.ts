import {expect} from 'chai'

import {buildPrompt} from '../../src/lib/prompt-builder.js'

const fakeExec = async (cmd: string, args: string[]): Promise<string> => {
  if (args.includes('issue') && args.includes('view')) {
    return JSON.stringify({
      body: 'Login fails with 500 error when using SSO.',
      title: 'Auth is broken',
    })
  }

  if (args.includes('pr') && args.includes('view')) {
    return JSON.stringify({
      body: 'This PR fixes the SSO login flow.',
      title: 'Fix auth middleware',
    })
  }

  throw new Error(`Unexpected command: ${cmd} ${args.join(' ')}`)
}

describe('prompt-builder', () => {
  it('uses prompt directly when only --prompt given', async () => {
    const result = await buildPrompt({prompt: 'Fix the bug', repo: 'org/repo'}, fakeExec)
    expect(result).to.equal('Fix the bug')
  })

  it('builds prompt from issue when --issue given', async () => {
    const result = await buildPrompt({issue: 42, repo: 'org/repo'}, fakeExec)
    expect(result).to.include('Auth is broken')
    expect(result).to.include('Login fails with 500 error')
    expect(result).to.include('#42')
  })

  it('builds prompt from PR when --pr given', async () => {
    const result = await buildPrompt({pr: 10, repo: 'org/repo'}, fakeExec)
    expect(result).to.include('Fix auth middleware')
    expect(result).to.include('SSO login flow')
    expect(result).to.include('#10')
  })

  it('combines prompt with issue context', async () => {
    const result = await buildPrompt({issue: 42, prompt: 'Focus on tests', repo: 'org/repo'}, fakeExec)
    expect(result).to.include('Focus on tests')
    expect(result).to.include('Auth is broken')
  })

  it('throws when no prompt source given', async () => {
    try {
      await buildPrompt({repo: 'org/repo'}, fakeExec)
      expect.fail('should have thrown')
    } catch (error: unknown) {
      expect((error as Error).message).to.include('at least one of')
    }
  })
})

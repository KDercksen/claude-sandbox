import {expect} from 'chai'

import {generateContainerName} from '../../src/lib/container-name.js'

describe('container-name', () => {
  it('uses explicit name with prefix', () => {
    const name = generateContainerName('org/repo', 'fix-auth-bug')
    expect(name).to.equal('claude-sandbox-fix-auth-bug')
  })

  it('auto-generates name from repo when no name given', () => {
    const name = generateContainerName('org/my-repo')
    expect(name).to.match(/^claude-sandbox-my-repo-[a-f0-9]{6}$/)
  })

  it('generates unique names on each call', () => {
    const a = generateContainerName('org/repo')
    const b = generateContainerName('org/repo')
    expect(a).to.not.equal(b)
  })

  it('sanitizes repo names with special characters', () => {
    const name = generateContainerName('org/My_Repo.v2', 'test run')
    expect(name).to.equal('claude-sandbox-test-run')
  })

  it('sanitizes auto-generated names', () => {
    const name = generateContainerName('org/My_Repo.v2')
    expect(name).to.match(/^claude-sandbox-my-repo-v2-[a-f0-9]{6}$/)
  })
})

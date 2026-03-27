import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('run', () => {
  it('shows help text with expected flags', async () => {
    const {stdout} = await runCommand('run --help')
    expect(stdout).to.include('--repo')
    expect(stdout).to.include('--issue')
    expect(stdout).to.include('--prompt')
  })

  it('errors when no repo provided', async () => {
    const {error} = await runCommand('run --prompt "test"')
    expect(error?.message).to.include('Missing required flag repo')
  })

  it('errors when no prompt source provided', async () => {
    const {error} = await runCommand('run --repo org/repo')
    expect(error?.message).to.include('at least one of')
  })
})

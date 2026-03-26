import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('ls', () => {
  it('runs ls without error', async () => {
    const {error} = await runCommand('ls')
    expect(error).to.be.undefined
  })
})

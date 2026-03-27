import {expect} from 'chai'

import {spawnContainer, SpawnDeps, SpawnOptions} from '../../src/lib/spawn.js'

// Stub SandboxDocker
const fakeDocker = {
  createAndStartContainer: async (opts: Record<string, unknown>) => ({
    created: new Date().toISOString(),
    name: opts.name as string,
    repo: opts.repo as string,
    sshPort: opts.sshPort as number,
    status: 'running',
  }),
  findFreePort: async () => 2200,
}

// Stub prompt builder
const fakeExec = async (cmd: string, args: string[]): Promise<string> => {
  if (args.includes('issue') && args.includes('view')) {
    return JSON.stringify({body: 'Issue body', title: 'Issue title'})
  }

  throw new Error(`Unexpected: ${cmd} ${args.join(' ')}`)
}

describe('spawnContainer', () => {
  it('creates a container with prompt and returns info', async () => {
    const opts: SpawnOptions = {
      createPr: false,
      githubToken: 'ghp_test',
      prompt: 'Fix the bug',
      repo: 'org/repo',
    }
    const result = await spawnContainer(opts, {docker: fakeDocker as unknown as SpawnDeps['docker'], exec: fakeExec})
    expect(result.repo).to.equal('org/repo')
    expect(result.sshPort).to.equal(2200)
    expect(result.containerName).to.be.a('string')
    expect(result.containerName).to.include('claude-sandbox')
  })

  it('generates branch name when create-pr is set', async () => {
    const opts: SpawnOptions = {
      createPr: true,
      defaultBranchPrefix: 'claude/',
      githubToken: 'ghp_test',
      prompt: 'Fix it',
      repo: 'org/repo',
    }
    const result = await spawnContainer(opts, {docker: fakeDocker as unknown as SpawnDeps['docker'], exec: fakeExec})
    expect(result.branch).to.be.a('string')
    expect(result.branch).to.include('claude/')
  })

  it('uses explicit branch when provided', async () => {
    const opts: SpawnOptions = {
      branch: 'my-branch',
      createPr: true,
      githubToken: 'ghp_test',
      prompt: 'Fix it',
      repo: 'org/repo',
    }
    const result = await spawnContainer(opts, {docker: fakeDocker as unknown as SpawnDeps['docker'], exec: fakeExec})
    expect(result.branch).to.equal('my-branch')
  })

  it('builds prompt from issue number', async () => {
    const opts: SpawnOptions = {
      createPr: false,
      githubToken: 'ghp_test',
      issue: 42,
      repo: 'org/repo',
    }
    const result = await spawnContainer(opts, {docker: fakeDocker as unknown as SpawnDeps['docker'], exec: fakeExec})
    expect(result.containerName).to.include('claude-sandbox')
  })
})

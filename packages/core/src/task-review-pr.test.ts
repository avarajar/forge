import { describe, it, expect } from 'vitest'
import { readPullRequestForBranch, readPullRequestByNumber, createLimiter, type Runner, type RunResult } from './task-review.js'

interface Call { bin: string; args: string[]; cwd: string }

const fakeRunner = (result: RunResult, calls: Call[] = []): Runner => async (bin, args, cwd) => {
  calls.push({ bin, args, cwd })
  return result
}

const rawPr = {
  number: 41, state: 'OPEN', url: 'https://github.com/o/r/pull/41', isDraft: true, baseRefName: 'develop',
  headRefOid: 'b'.repeat(40), reviewDecision: 'CHANGES_REQUESTED',
  statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }],
}

const FIELDS = 'number,state,url,isDraft,baseRefName,headRefOid,reviewDecision,statusCheckRollup'

describe('readPullRequestForBranch', () => {
  it('lists pull requests for the branch in every state and maps the newest', async () => {
    const calls: Call[] = []
    const run = fakeRunner({ code: 0, stdout: JSON.stringify([rawPr]), stderr: '' }, calls)
    expect(await readPullRequestForBranch(run, '/repo', 'task/fix-auth')).toEqual({
      status: 'found', number: 41, url: 'https://github.com/o/r/pull/41', state: 'OPEN', isDraft: true,
      baseRefName: 'develop', headRefOid: 'b'.repeat(40), checks: 'failing', review: 'CHANGES_REQUESTED',
    })
    expect(calls).toEqual([{
      bin: 'gh', cwd: '/repo',
      args: ['pr', 'list', '--head', 'task/fix-auth', '--state', 'all', '--limit', '1', '--json', FIELDS],
    }])
  })

  it('is none for an empty list', async () => {
    const run = fakeRunner({ code: 0, stdout: '[]', stderr: '' })
    expect(await readPullRequestForBranch(run, '/repo', 'x')).toEqual({ status: 'none' })
  })

  it('maps an empty review decision to null', async () => {
    const run = fakeRunner({ code: 0, stdout: JSON.stringify([{ ...rawPr, reviewDecision: '' }]), stderr: '' })
    const pr = await readPullRequestForBranch(run, '/repo', 'x')
    expect(pr.status === 'found' && pr.review).toBeNull()
  })

  it('reports gh missing', async () => {
    const run = fakeRunner({ code: 127, stdout: '', stderr: 'ENOENT' })
    expect(await readPullRequestForBranch(run, '/repo', 'x')).toEqual({ status: 'unavailable', reason: 'gh is not installed' })
  })

  it('reports the first line of stderr when gh fails', async () => {
    const run = fakeRunner({ code: 4, stdout: '', stderr: '\nTo get started with GitHub CLI, please run:  gh auth login\nmore\n' })
    expect(await readPullRequestForBranch(run, '/repo', 'x')).toEqual({
      status: 'unavailable', reason: 'To get started with GitHub CLI, please run:  gh auth login',
    })
  })

  it('reports output it cannot parse', async () => {
    const run = fakeRunner({ code: 0, stdout: 'not json', stderr: '' })
    expect(await readPullRequestForBranch(run, '/repo', 'x')).toEqual({ status: 'unavailable', reason: 'gh returned unexpected output' })
  })
})

describe('readPullRequestByNumber', () => {
  it('views the pull request by number', async () => {
    const calls: Call[] = []
    const run = fakeRunner({ code: 0, stdout: JSON.stringify({ ...rawPr, state: 'MERGED', isDraft: false }), stderr: '' }, calls)
    expect(await readPullRequestByNumber(run, '/repo', '41')).toMatchObject({ status: 'found', number: 41, state: 'MERGED', isDraft: false })
    expect(calls[0].args).toEqual(['pr', 'view', '41', '--json', FIELDS])
  })

  it('is unavailable when gh fails', async () => {
    const run = fakeRunner({ code: 1, stdout: '', stderr: 'no pull requests found' })
    expect(await readPullRequestByNumber(run, '/repo', '9')).toEqual({ status: 'unavailable', reason: 'no pull requests found' })
  })
})

describe('createLimiter', () => {
  it('never runs more than max tasks at once and runs them all', async () => {
    const limit = createLimiter(2)
    let active = 0
    let peak = 0
    const task = (value: number) => limit(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--
      return value
    })
    expect(await Promise.all([1, 2, 3, 4, 5, 6].map(task))).toEqual([1, 2, 3, 4, 5, 6])
    expect(peak).toBe(2)
  })

  it('releases its slot when a task throws', async () => {
    const limit = createLimiter(1)
    await expect(limit(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(await limit(async () => 'next')).toBe('next')
  })
})

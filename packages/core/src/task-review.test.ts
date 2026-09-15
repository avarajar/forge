import { describe, it, expect } from 'vitest'
import { parseGitHubRemote, summarizeChecks, parseShortstat, githubLink, closeWarningsFor, type LinkInput, type WarningInput } from './task-review.js'
import type { PullRequestInfo } from './cw-types.js'

const openPr: PullRequestInfo = {
  status: 'found', number: 41, url: 'https://github.com/o/r/pull/41', state: 'OPEN', isDraft: false,
  baseRefName: 'main', checks: 'passing', review: null,
}

describe('parseGitHubRemote', () => {
  it.each([
    ['git@github.com:o/r.git'], ['git@github.com:o/r'],
    ['ssh://git@github.com/o/r.git'], ['ssh://git@github.com/o/r'],
    ['https://github.com/o/r.git'], ['https://github.com/o/r'], ['https://github.com/o/r/'],
  ])('reads owner and repo from %s', (url) => {
    expect(parseGitHubRemote(url)).toEqual({ owner: 'o', repo: 'r' })
  })

  it.each([['https://gitlab.com/o/r.git'], [''], ['/tmp/origin.git']])('returns null for %s', (url) => {
    expect(parseGitHubRemote(url)).toBeNull()
  })
})

describe('summarizeChecks', () => {
  it('is none for an empty or missing rollup', () => {
    expect(summarizeChecks([])).toBe('none')
    expect(summarizeChecks(undefined)).toBe('none')
  })

  it('is failing when any check run failed, even if others are pending', () => {
    expect(summarizeChecks([
      { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' },
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'TIMED_OUT' },
    ])).toBe('failing')
  })

  it('is failing for a status context in ERROR', () => {
    expect(summarizeChecks([{ __typename: 'StatusContext', state: 'ERROR' }])).toBe('failing')
  })

  it('is pending for an unfinished check run or a PENDING status context', () => {
    expect(summarizeChecks([{ __typename: 'CheckRun', status: 'QUEUED', conclusion: '' }])).toBe('pending')
    expect(summarizeChecks([{ __typename: 'StatusContext', state: 'EXPECTED' }])).toBe('pending')
  })

  it('is passing when every entry completed without failure', () => {
    expect(summarizeChecks([
      { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'StatusContext', state: 'SUCCESS' },
    ])).toBe('passing')
  })
})

describe('parseShortstat', () => {
  it('reads files, insertions and deletions', () => {
    expect(parseShortstat(' 5 files changed, 120 insertions(+), 34 deletions(-)\n')).toEqual({ files: 5, insertions: 120, deletions: 34 })
  })

  it('handles a single file with only insertions', () => {
    expect(parseShortstat(' 1 file changed, 1 insertion(+)')).toEqual({ files: 1, insertions: 1, deletions: 0 })
  })

  it('is all zeros for empty output', () => {
    expect(parseShortstat('')).toEqual({ files: 0, insertions: 0, deletions: 0 })
  })
})

describe('githubLink', () => {
  const base: LinkInput = {
    repo: { owner: 'o', repo: 'r' }, kind: 'task', pr: { status: 'none' },
    branch: 'task/fix-auth', base: 'origin/main', upstream: 'origin/task/fix-auth', commits: 2, uncommitted: 0,
  }

  it('is null when the remote is not GitHub', () => {
    expect(githubLink({ ...base, repo: null })).toBeNull()
  })

  it('opens the files tab of a found pull request', () => {
    expect(githubLink({ ...base, pr: openPr })).toEqual({ url: 'https://github.com/o/r/pull/41/files', label: 'View PR on GitHub' })
  })

  it('opens the pull request itself for a review session', () => {
    expect(githubLink({ ...base, kind: 'review', pr: openPr })).toEqual({ url: 'https://github.com/o/r/pull/41', label: 'View PR on GitHub' })
  })

  it('builds the pull request URL from its number when gh is unavailable in a review', () => {
    expect(githubLink({ ...base, kind: 'review', prNumber: '7', pr: { status: 'unavailable', reason: 'gh is not installed' } }))
      .toEqual({ url: 'https://github.com/o/r/pull/7', label: 'View PR on GitHub' })
  })

  it('opens the compare page for a pushed branch with a known base, encoding each ref', () => {
    expect(githubLink(base)).toEqual({ url: 'https://github.com/o/r/compare/main...task%2Ffix-auth', label: 'View on GitHub' })
  })

  it('opens the branch tree when the base is unknown', () => {
    expect(githubLink({ ...base, base: null, commits: null })).toEqual({ url: 'https://github.com/o/r/tree/task%2Ffix-auth', label: 'View on GitHub' })
  })

  it('asks for a push when there is work but no upstream', () => {
    expect(githubLink({ ...base, upstream: null })).toEqual({ url: null, reason: 'Push the branch first' })
    expect(githubLink({ ...base, upstream: null, commits: 0, uncommitted: 3 })).toEqual({ url: null, reason: 'Push the branch first' })
  })

  it('is null for an untouched task without upstream', () => {
    expect(githubLink({ ...base, upstream: null, commits: 0, uncommitted: 0 })).toBeNull()
  })
})

describe('closeWarningsFor', () => {
  const clean: WarningInput = {
    workspace: 'ready', uncommitted: 0, commits: 0, base: 'origin/main', upstream: null, unpushed: null,
    pr: { status: 'none' }, gitFailed: false,
  }

  it('is empty for a clean task', () => {
    expect(closeWarningsFor(clean)).toEqual([])
  })

  it('lists every warning in order', () => {
    expect(closeWarningsFor({ ...clean, uncommitted: 2, commits: 3, pr: openPr })).toEqual(['uncommitted', 'unpushed', 'pr-open'])
  })

  it('warns about unpushed commits on a branch with an upstream', () => {
    expect(closeWarningsFor({ ...clean, commits: 3, upstream: 'origin/x', unpushed: 1 })).toEqual(['unpushed'])
    expect(closeWarningsFor({ ...clean, commits: 3, upstream: 'origin/x', unpushed: 0 })).toEqual([])
  })

  it('does not warn about a merged or closed pull request', () => {
    expect(closeWarningsFor({ ...clean, pr: { ...openPr, state: 'MERGED' } })).toEqual([])
  })

  it('is state-unknown when git failed or neither base nor upstream resolves', () => {
    expect(closeWarningsFor({ ...clean, gitFailed: true })).toEqual(['state-unknown'])
    expect(closeWarningsFor({ ...clean, base: null, commits: null })).toEqual(['state-unknown'])
  })

  it('never warns for a missing or worktree-less workspace', () => {
    expect(closeWarningsFor({ ...clean, workspace: 'missing', base: null, commits: null })).toEqual([])
    expect(closeWarningsFor({ ...clean, workspace: 'none', base: null, commits: null })).toEqual([])
  })
})

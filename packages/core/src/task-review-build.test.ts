import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildTaskReviewState, runCommand, type ReviewDeps, type Runner, type RunResult } from './task-review.js'
import { makeFixtureRepo, type FixtureRepo } from './test-git.js'
import type { CWSession } from './cw-types.js'

let repo: FixtureRepo | null = null
const dirs: string[] = []
afterEach(() => {
  if (repo) rmSync(repo.root, { recursive: true, force: true })
  repo = null
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// real git, canned gh
const withGh = (gh: RunResult): Runner => (bin, args, cwd) => bin === 'gh' ? Promise.resolve(gh) : runCommand(bin, args, cwd)
const deps = (run: Runner): ReviewDeps => ({ run, limitGh: fn => fn(), exists: existsSync })

const session = (over: Partial<CWSession>): CWSession => ({
  project: 'app', task: 'fix-auth', type: 'task', account: 'default', worktree: '', notes: '',
  status: 'active', created: '2026-09-14T00:00:00Z', last_opened: '2026-09-14T00:00:00Z', opens: 1, ...over,
})

const ghFound = (baseRefName: string): RunResult => ({
  code: 0, stderr: '',
  stdout: JSON.stringify([{ number: 41, state: 'OPEN', url: 'https://github.com/o/r/pull/41', isDraft: false, baseRefName, reviewDecision: '', statusCheckRollup: [] }]),
})

describe('buildTaskReviewState', () => {
  it('is none for a loop session', async () => {
    const state = await buildTaskReviewState(session({ type: 'loop' }), null, deps(runCommand))
    expect(state).toMatchObject({ workspace: 'none', pr: { status: 'none' }, github: null, closeWarnings: [] })
  })

  it('is missing when the worktree directory does not exist yet', async () => {
    const state = await buildTaskReviewState(session({ worktree: '/nonexistent/.tasks/fix-auth' }), null, deps(runCommand))
    expect(state).toMatchObject({ workspace: 'missing', uncommitted: 0, github: null, closeWarnings: [] })
  })

  it('reads a local task with unpushed commits and a non-GitHub origin', async () => {
    repo = makeFixtureRepo()
    repo.git('switch', '-q', '-c', 'fix-auth')
    repo.git('commit', '-q', '--allow-empty', '-m', 'work')
    const state = await buildTaskReviewState(session({ worktree: repo.work }), null, deps(runCommand))
    expect(state).toMatchObject({
      workspace: 'ready', branch: 'fix-auth', base: 'origin/main', commits: 1, upstream: null, unpushed: null,
      pr: { status: 'unavailable', reason: 'origin is not a GitHub repository' },
      github: null, closeWarnings: ['unpushed'],
    })
  })

  it('prefers the pull request base over base_branch', async () => {
    repo = makeFixtureRepo()
    repo.git('switch', '-q', '-c', 'develop')
    repo.git('push', '-q', 'origin', 'develop')
    repo.git('switch', '-q', '-c', 'fix-auth')
    repo.git('remote', 'set-url', 'origin', 'git@github.com:o/r.git')
    const state = await buildTaskReviewState(
      session({ worktree: repo.work, base_branch: 'origin/main' }), null, deps(withGh(ghFound('develop'))),
    )
    expect(state.base).toBe('origin/develop')
    expect(state.github).toEqual({ url: 'https://github.com/o/r/pull/41/files', label: 'View PR on GitHub' })
    expect(state.closeWarnings).toEqual(['pr-open'])
  })

  it('is state-unknown when the worktree is not a git repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-notgit-'))
    dirs.push(dir)
    const state = await buildTaskReviewState(session({ worktree: dir }), null, deps(runCommand))
    expect(state).toMatchObject({ workspace: 'ready', closeWarnings: ['state-unknown'] })
  })

  it('links a review session to its pull request when gh is missing', async () => {
    repo = makeFixtureRepo()
    repo.git('remote', 'set-url', 'origin', 'https://github.com/o/r.git')
    const state = await buildTaskReviewState(
      session({ type: 'review', task: undefined, pr: '7' }), repo.work, deps(withGh({ code: 127, stdout: '', stderr: 'ENOENT' })),
    )
    expect(state).toMatchObject({
      workspace: 'none', pr: { status: 'unavailable', reason: 'gh is not installed' },
      github: { url: 'https://github.com/o/r/pull/7', label: 'View PR on GitHub' }, closeWarnings: [],
    })
  })
})

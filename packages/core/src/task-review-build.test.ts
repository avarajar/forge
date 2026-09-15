import { describe, it, expect, afterEach } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildTaskReviewState, runCommand, type ReviewDeps, type Runner, type RunResult } from './task-review.js'
import { addCwWorktree, makeFixtureRepo, type FixtureRepo } from './test-git.js'
import type { CWSession } from './cw-types.js'

let repo: FixtureRepo | null = null
const dirs: string[] = []
afterEach(() => {
  if (repo) rmSync(repo.root, { recursive: true, force: true })
  repo = null
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// real git, canned gh
const withGh = (gh: RunResult, git: Runner = runCommand): Runner => (bin, args, cwd) => bin === 'gh' ? Promise.resolve(gh) : git(bin, args, cwd)
const deps = (run: Runner): ReviewDeps => ({ run, limitGh: fn => fn(), exists: existsSync })

const session = (over: Partial<CWSession>): CWSession => ({
  project: 'app', task: 'fix-auth', type: 'task', account: 'default', worktree: '', notes: '',
  status: 'active', created: '2026-09-14T00:00:00Z', last_opened: '2026-09-14T00:00:00Z', opens: 1, ...over,
})

const ghFound = (baseRefName: string, headRefOid: string, state = 'OPEN'): RunResult => ({
  code: 0, stderr: '',
  stdout: JSON.stringify([{ number: 41, state, url: 'https://github.com/o/r/pull/41', isDraft: false, baseRefName, headRefOid, reviewDecision: '', statusCheckRollup: [] }]),
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
    const state = await buildTaskReviewState(session({ worktree: repo.work }), null, deps(repo.run))
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
      session({ worktree: repo.work, base_branch: 'origin/main' }), null, deps(withGh(ghFound('develop', repo.git('rev-parse', 'HEAD').trim()), repo.run)),
    )
    expect(state.base).toBe('origin/develop')
    expect(state.github).toEqual({ url: 'https://github.com/o/r/pull/41/files', label: 'View PR on GitHub' })
    expect(state.closeWarnings).toEqual(['pr-open'])
  })

  it('shows nothing to push for a fresh CW worktree and asks for a push once it has commits', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    repo.git('remote', 'set-url', 'origin', 'git@github.com:o/r.git')
    const run = withGh({ code: 0, stdout: '[]', stderr: '' }, repo.run)
    const fresh = await buildTaskReviewState(session({ worktree: wt.path }), null, deps(run))
    expect(fresh).toMatchObject({ uncommitted: 0, commits: 0, upstream: null, github: null, closeWarnings: [] })

    wt.git('commit', '-q', '--allow-empty', '-m', 'work')
    const worked = await buildTaskReviewState(session({ worktree: wt.path }), null, deps(run))
    expect(worked).toMatchObject({
      upstream: null, unpushed: null, commits: 1,
      github: { url: null, reason: 'Push the branch first' }, closeWarnings: ['unpushed'],
    })
  })

  it('treats a branch pushed without -u as pushed', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    wt.git('commit', '-q', '--allow-empty', '-m', 'work')
    wt.git('push', '-q', 'origin', 'fix-auth')
    repo.git('remote', 'set-url', 'origin', 'git@github.com:o/r.git')
    const state = await buildTaskReviewState(session({ worktree: wt.path }), null, deps(withGh({ code: 0, stdout: '[]', stderr: '' }, repo.run)))
    expect(state).toMatchObject({
      upstream: 'origin/fix-auth', unpushed: 0, closeWarnings: [],
      github: { url: 'https://github.com/o/r/compare/main...fix-auth', label: 'View on GitHub' },
    })
  })

  it('treats work contained in a merged pull request as pushed after its branch was deleted', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    wt.git('commit', '-q', '--allow-empty', '-m', 'work')
    repo.git('remote', 'set-url', 'origin', 'git@github.com:o/r.git')
    const head = wt.git('rev-parse', 'HEAD').trim()
    const state = await buildTaskReviewState(session({ worktree: wt.path }), null, deps(withGh(ghFound('main', head, 'MERGED'), repo.run)))
    expect(state).toMatchObject({
      upstream: null, unpushed: 0, pr: { status: 'found', number: 41, state: 'MERGED', headRefOid: head },
      github: { url: 'https://github.com/o/r/pull/41/files', label: 'View PR on GitHub' }, closeWarnings: [],
    })
  })

  it('ignores a pull request with the same branch name from another history', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    wt.git('commit', '-q', '--allow-empty', '-m', 'work')
    repo.git('switch', '-q', '-c', 'old-fix-auth')
    repo.git('commit', '-q', '--allow-empty', '-m', 'old work')
    const other = repo.git('rev-parse', 'HEAD').trim()
    repo.git('remote', 'set-url', 'origin', 'git@github.com:o/r.git')
    for (const oid of [other, 'a'.repeat(40)]) {
      const state = await buildTaskReviewState(session({ worktree: wt.path }), null, deps(withGh(ghFound('develop', oid, 'MERGED'), repo.run)))
      expect(state).toMatchObject({ pr: { status: 'none' }, base: 'origin/main', github: { url: null, reason: 'Push the branch first' }, closeWarnings: ['unpushed'] })
    }
  })

  it('keeps a pull request whose head is behind local commits and still counts them', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    wt.git('commit', '-q', '--allow-empty', '-m', 'work')
    const prHead = wt.git('rev-parse', 'HEAD').trim()
    wt.git('commit', '-q', '--allow-empty', '-m', 'more')
    repo.git('remote', 'set-url', 'origin', 'git@github.com:o/r.git')
    const state = await buildTaskReviewState(session({ worktree: wt.path }), null, deps(withGh(ghFound('main', prHead), repo.run)))
    expect(state).toMatchObject({ pr: { status: 'found' }, unpushed: null, commits: 2, closeWarnings: ['unpushed', 'pr-open'] })
  })

  it('is state-unknown when the worktree is not a git repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-notgit-'))
    dirs.push(dir)
    const state = await buildTaskReviewState(session({ worktree: dir }), null, deps(runCommand))
    expect(state).toMatchObject({ workspace: 'ready', closeWarnings: ['state-unknown'] })
  })

  it('does not look up a review whose pr is not a number', async () => {
    repo = makeFixtureRepo()
    repo.git('remote', 'set-url', 'origin', 'https://github.com/o/r.git')
    let ghCalls = 0
    const run: Runner = (bin, args, cwd) => bin === 'gh' ? (ghCalls++, Promise.resolve(ghFound('main', 'a'.repeat(40)))) : repo!.run(bin, args, cwd)
    const state = await buildTaskReviewState(session({ type: 'review', task: undefined, pr: 'ENG-123' }), repo.work, deps(run))
    expect(state).toMatchObject({ workspace: 'none', pr: { status: 'none' }, github: null, closeWarnings: [] })
    expect(ghCalls).toBe(0)
  })

  it('links a review session to its pull request when gh is missing', async () => {
    repo = makeFixtureRepo()
    repo.git('remote', 'set-url', 'origin', 'https://github.com/o/r.git')
    const state = await buildTaskReviewState(
      session({ type: 'review', task: undefined, pr: '7' }), repo.work, deps(withGh({ code: 127, stdout: '', stderr: 'ENOENT' }, repo.run)),
    )
    expect(state).toMatchObject({
      workspace: 'none', pr: { status: 'unavailable', reason: 'gh is not installed' },
      github: { url: 'https://github.com/o/r/pull/7', label: 'View PR on GitHub' }, closeWarnings: [],
    })
  })
})

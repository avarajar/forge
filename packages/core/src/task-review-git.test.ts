import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand, readGitSnapshot, resolveBase, readBaseCounts, GitReadError } from './task-review.js'
import { addCwWorktree, makeFixtureRepo, type FixtureRepo } from './test-git.js'

let repo: FixtureRepo | null = null
afterEach(() => { if (repo) rmSync(repo.root, { recursive: true, force: true }); repo = null })

describe('readGitSnapshot', () => {
  it('reads a fresh task branch with no changes and no upstream', async () => {
    repo = makeFixtureRepo()
    repo.git('switch', '-q', '-c', 'task/fix-auth')
    expect(await readGitSnapshot(repo.run, repo.work)).toEqual({
      branch: 'task/fix-auth', uncommitted: 0, upstream: null, unpushed: null, repo: null,
    })
  })

  it('counts modified and untracked files as uncommitted', async () => {
    repo = makeFixtureRepo()
    writeFileSync(join(repo.work, 'a.txt'), 'a')
    repo.git('add', 'a.txt')
    repo.git('commit', '-q', '-m', 'a')
    writeFileSync(join(repo.work, 'a.txt'), 'changed')
    writeFileSync(join(repo.work, 'new.txt'), 'new')
    expect((await readGitSnapshot(repo.run, repo.work)).uncommitted).toBe(2)
  })

  it('reads the upstream and the commits not pushed to it', async () => {
    repo = makeFixtureRepo()
    repo.git('switch', '-q', '-c', 'task/fix-auth')
    repo.git('push', '-q', '-u', 'origin', 'task/fix-auth')
    expect(await readGitSnapshot(repo.run, repo.work)).toMatchObject({ upstream: 'origin/task/fix-auth', unpushed: 0 })
    repo.git('commit', '-q', '--allow-empty', '-m', 'more')
    expect((await readGitSnapshot(repo.run, repo.work)).unpushed).toBe(1)
  })

  it('counts every untracked file even when the config hides untracked files', async () => {
    repo = makeFixtureRepo()
    repo.git('config', 'status.showUntrackedFiles', 'no')
    mkdirSync(join(repo.work, 'src'))
    writeFileSync(join(repo.work, 'src', 'a.ts'), 'a')
    writeFileSync(join(repo.work, 'src', 'b.ts'), 'b')
    expect((await readGitSnapshot(repo.run, repo.work)).uncommitted).toBe(2)
  })

  it('ignores the files CW links into a worktree', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    expect(await readGitSnapshot(repo.run, wt.path)).toMatchObject({ branch: 'fix-auth', uncommitted: 0 })
  })

  it('still counts a real .env file in a worktree', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    rmSync(join(wt.path, '.env'))
    writeFileSync(join(wt.path, '.env'), 'LOCAL=1\n')
    rmSync(join(wt.path, 'TASK_NOTES.md'))
    writeFileSync(join(wt.path, 'notes.txt'), 'x')
    expect((await readGitSnapshot(repo.run, wt.path)).uncommitted).toBe(2)
  })

  it('has no upstream for a CW worktree whose branch only tracks origin/main', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    wt.git('commit', '-q', '--allow-empty', '-m', 'work')
    expect(await readGitSnapshot(repo.run, wt.path)).toMatchObject({ upstream: null, unpushed: null })
  })

  it('reads origin/<branch> as upstream after a push without -u', async () => {
    repo = makeFixtureRepo()
    const wt = addCwWorktree(repo, 'fix-auth')
    wt.git('commit', '-q', '--allow-empty', '-m', 'work')
    wt.git('push', '-q', 'origin', 'fix-auth')
    expect(await readGitSnapshot(repo.run, wt.path)).toMatchObject({ upstream: 'origin/fix-auth', unpushed: 0 })
    wt.git('commit', '-q', '--allow-empty', '-m', 'more')
    expect((await readGitSnapshot(repo.run, wt.path)).unpushed).toBe(1)
  })

  it('reads a GitHub origin', async () => {
    repo = makeFixtureRepo()
    repo.git('remote', 'set-url', 'origin', 'git@github.com:o/r.git')
    expect((await readGitSnapshot(repo.run, repo.work)).repo).toEqual({ owner: 'o', repo: 'r' })
  })

  it('throws GitReadError outside a repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-norepo-'))
    try {
      await expect(readGitSnapshot(runCommand, dir)).rejects.toBeInstanceOf(GitReadError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('runCommand', () => {
  it('resolves a missing binary as code 127 with ENOENT', async () => {
    expect(await runCommand('definitely-not-a-binary-xyz', [], tmpdir())).toMatchObject({ code: 127, stderr: 'ENOENT' })
  })
})

describe('resolveBase', () => {
  it('takes the first candidate that exists', async () => {
    repo = makeFixtureRepo()
    expect(await resolveBase(repo.run, repo.work, [null, 'origin/develop', 'origin/main'])).toBe('origin/main')
  })

  it('resolves origin/HEAD to the branch it points at', async () => {
    repo = makeFixtureRepo()
    expect(await resolveBase(repo.run, repo.work, [undefined, 'origin/HEAD', 'origin/other'])).toBe('origin/main')
  })

  it('skips origin/HEAD when the remote has none', async () => {
    repo = makeFixtureRepo()
    repo.git('symbolic-ref', '--delete', 'refs/remotes/origin/HEAD')
    expect(await resolveBase(repo.run, repo.work, ['origin/HEAD', 'origin/main'])).toBe('origin/main')
  })

  it('is null when nothing resolves', async () => {
    repo = makeFixtureRepo()
    expect(await resolveBase(repo.run, repo.work, ['origin/nope', null])).toBeNull()
  })
})

describe('readBaseCounts', () => {
  it('counts commits since the base and the diff to the working tree', async () => {
    repo = makeFixtureRepo()
    repo.git('switch', '-q', '-c', 'task/fix-auth')
    writeFileSync(join(repo.work, 'a.txt'), 'one\ntwo\n')
    repo.git('add', 'a.txt')
    repo.git('commit', '-q', '-m', 'a')
    repo.git('commit', '-q', '--allow-empty', '-m', 'b')
    expect(await readBaseCounts(repo.run, repo.work, 'origin/main')).toEqual({
      commits: 2, diff: { files: 1, insertions: 2, deletions: 0 },
    })
  })

  it('is unknown without a base', async () => {
    repo = makeFixtureRepo()
    expect(await readBaseCounts(repo.run, repo.work, null)).toEqual({ commits: null, diff: null })
  })
})

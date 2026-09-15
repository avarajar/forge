import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunner, type Runner } from './task-review.js'

// isolates fixture repositories from the developer's global git config (signing, hooks)
function fixtureEnv(root: string): NodeJS.ProcessEnv {
  const emptyConfig = join(root, 'empty-gitconfig')
  writeFileSync(emptyConfig, '')
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
  }
}

export interface FixtureRepo {
  root: string
  origin: string
  work: string
  git: (...args: string[]) => string
  gitIn: (cwd: string, ...args: string[]) => string
  // the production runner under the fixture environment, so reads ignore the global git config too
  run: Runner
}

// a repository on main with an initial commit, pushed to a local bare origin whose HEAD is main
export function makeFixtureRepo(): FixtureRepo {
  const root = mkdtempSync(join(tmpdir(), 'forge-review-'))
  const env = fixtureEnv(root)
  const origin = join(root, 'origin.git')
  const work = join(root, 'work')
  const gitIn = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf-8' })
  gitIn(root, 'init', '-q', '--bare', origin)
  gitIn(root, 'init', '-q', '-b', 'main', work)
  gitIn(work, 'commit', '-q', '--allow-empty', '-m', 'init')
  gitIn(work, 'remote', 'add', 'origin', origin)
  gitIn(work, 'push', '-q', '-u', 'origin', 'main')
  gitIn(work, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  return { root, origin, work, git: (...args) => gitIn(work, ...args), gitIn, run: createRunner(env) }
}

export interface CwWorktree {
  path: string
  git: (...args: string[]) => string
}

// shapes a task worktree the way CW does: branched from origin/main (which sets @{u} to origin/main),
// with .claude and .env linked from the main checkout and the notes files linked and excluded
export function addCwWorktree(repo: FixtureRepo, task: string): CwWorktree {
  writeFileSync(join(repo.work, '.gitignore'), '.claude/\n')
  repo.git('add', '.gitignore')
  repo.git('commit', '-q', '-m', 'ignore .claude')
  repo.git('push', '-q', 'origin', 'main')
  mkdirSync(join(repo.work, '.claude'), { recursive: true })
  writeFileSync(join(repo.work, '.claude', 'settings.json'), '{}')
  writeFileSync(join(repo.work, '.env'), 'SECRET=1\n')
  appendFileSync(join(repo.work, '.git', 'info', 'exclude'), '.tasks\nTASK_NOTES.md\nSHARED_CONTEXT.md\n')

  const path = join(repo.work, '.tasks', task)
  repo.git('worktree', 'add', '-q', '-b', task, path, 'origin/main')
  const notes = join(repo.root, 'TASK_NOTES.md')
  const shared = join(repo.root, 'SHARED_CONTEXT.md')
  writeFileSync(notes, '# notes\n')
  writeFileSync(shared, '# shared\n')
  symlinkSync(notes, join(path, 'TASK_NOTES.md'))
  symlinkSync(shared, join(path, 'SHARED_CONTEXT.md'))
  symlinkSync(join(repo.work, '.env'), join(path, '.env'))
  symlinkSync(join(repo.work, '.claude'), join(path, '.claude'))
  return { path, git: (...args) => repo.gitIn(path, ...args) }
}

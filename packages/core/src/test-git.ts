import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
}

// a repository on main with an initial commit, pushed to a local bare origin whose HEAD is main
export function makeFixtureRepo(): FixtureRepo {
  const root = mkdtempSync(join(tmpdir(), 'forge-review-'))
  const env = fixtureEnv(root)
  const origin = join(root, 'origin.git')
  const work = join(root, 'work')
  const run = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf-8' })
  run(root, ['init', '-q', '--bare', origin])
  run(root, ['init', '-q', '-b', 'main', work])
  run(work, ['commit', '-q', '--allow-empty', '-m', 'init'])
  run(work, ['remote', 'add', 'origin', origin])
  run(work, ['push', '-q', '-u', 'origin', 'main'])
  run(work, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'])
  return { root, origin, work, git: (...args) => run(work, args) }
}

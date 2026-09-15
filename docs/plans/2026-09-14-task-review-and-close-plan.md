# Task Review and Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Forge task shows where its changes stand, links to GitHub or a local editor, and closes only after warning about work that would be lost or is still under review.

**Architecture:** CW records `base_branch` in `session.json`. Forge's core computes a `TaskReviewState` per session from git and `gh` (pure helpers plus an injected command runner), serves it with a 30 s cache, adds editor detection and opening, and makes `/done` wait for CW. The console renders the server's derived fields: a summary, GitHub and editor buttons, a close dialog, and a PR chip on cards.

**Tech Stack:** Bash + bats (CW); TypeScript strict, Hono, Vitest, Node `child_process.execFile` (Forge core); Preact, `@preact/signals`, UnoCSS (console).

**Spec:** `docs/specs/2026-09-14-task-review-and-close.md`

## Global Constraints

- Every git and `gh` call uses `execFile` with an argument array and a timeout; never a shell string (CLAUDE.md "Do NOT").
- TypeScript strict, ESM, `.js` suffix on relative imports, no `any`.
- Preact, not React; UnoCSS classes and the `--forge-*` CSS variables; shared UI from `@forge-dev/ui`.
- UI copy in English, exactly as written in the spec (§6).
- Forge never runs `git fetch`.
- `gh` concurrency: at most 4 processes. Review state cache TTL: 30 s. TaskDetail poll: 60 s. `cw --done` timeout: 60 s. Error tail: last 20 lines, ANSI removed.
- Editors: `vscode`/VS Code/`code`/`Visual Studio Code.app`, `cursor`/Cursor/`cursor`/`Cursor.app`, `windsurf`/Windsurf/`windsurf`/`Windsurf.app`, `zed`/Zed/`zed`/`Zed.app`.
- Commits: conventional (`feat(core):`, `feat(console):`, `test:`, `docs:`), GPG-signed (never `--no-gpg-sign`), no Claude attribution lines.
- CW: pure Bash, JSON via inline `python3`, tests in `tests/*.bats` run with `./tests/run.sh -f '<pattern>'`.

## Branches

- CW (`~/workspace/personal/cw`): branch `feat/session-base-branch` from `main`.
- Forge (`~/workspace/personal/forge`): branch `feat/task-review-close` from `main` after the spec PR merges, or stacked on `docs/task-review-close-spec`.

---

### Task 1: CW records `base_branch` in `session.json`

**Repository:** `~/workspace/personal/cw`

**Files:**
- Modify: `cw` — the `# Save session` Python block inside `cmd_work` (search for `CW_S_PROVIDER="$provider" CW_S_META="$session_meta" python3 - <<'PYEOF'`)
- Modify: `tests/work_worktree.bats` (append three tests)
- Modify: `CHANGELOG.md` (new `## Unreleased` section at the top)
- Modify: `docs/architecture.md` (the `session.json` example around line 136)

**Interfaces:**
- Produces: new `work` sessions carry `"base_branch": "origin/<name>"` in `~/.cw/sessions/<project>/task-<task>/session.json`. Forge (Task 2) reads it as `CWSession.base_branch?: string`.

- [ ] **Step 1: Create the branch**

```bash
cd ~/workspace/personal/cw
git switch main && git pull --ff-only
git switch -c feat/session-base-branch
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/work_worktree.bats` (it already defines `make_origin_project` and `commit_on`):

```bash
# prints one field of a session.json exactly
base_of() {
    python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("base_branch", "<missing>"))' "$1"
}

@test "a new task records the base branch its worktree started from" {
    make_origin_project app >/dev/null
    run "$CW_BIN" work app fix-auth --harness codex
    [ "$status" -eq 0 ]
    [ "$(base_of "$CW_HOME/sessions/app/task-fix-auth/session.json")" = "origin/main" ]
}

@test "--base records the requested base branch with its origin prefix" {
    local path; path="$(make_origin_project app)"
    commit_on "$path" develop
    git -C "$path" push -q origin develop
    run "$CW_BIN" work app fix-auth --harness codex --base develop
    [ "$status" -eq 0 ]
    [ "$(base_of "$CW_HOME/sessions/app/task-fix-auth/session.json")" = "origin/develop" ]
}

@test "a claude task with agent-driven setup records the base branch too" {
    make_origin_project app >/dev/null
    run "$CW_BIN" work app fix-auth
    [ "$status" -eq 0 ]
    [ "$(base_of "$CW_HOME/sessions/app/task-fix-auth/session.json")" = "origin/main" ]
}
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `./tests/run.sh -f 'base branch'`
Expected: 3 failures, each printing `<missing>` instead of the branch.

- [ ] **Step 4: Write the field**

In `cw`, in the `# Save session` block of `cmd_work`, add `CW_S_BASE="$base_branch"` to the environment prefix and `'base_branch'` to the dict. The block becomes:

```bash
        # Save session
        CW_S_PROJECT="$name" CW_S_TASK="$task" CW_S_ACCOUNT="$account" CW_S_WORKFLOW="$workflow" \
        CW_S_WORKTREE="$wt_dir" CW_S_NOTES="$notes_file" CW_S_SOURCE="$task_source" \
        CW_S_SOURCE_URL="$task_url" CW_S_MODEL="$model" CW_S_HARNESS="$harness" \
        CW_S_PROVIDER="$provider" CW_S_BASE="$base_branch" CW_S_META="$session_meta" python3 - <<'PYEOF'
import json, os
from datetime import datetime, timezone
e = os.environ
meta = {
    'project': e['CW_S_PROJECT'], 'task': e['CW_S_TASK'], 'type': 'task',
    'account': e['CW_S_ACCOUNT'], 'workflow': e['CW_S_WORKFLOW'],
    'worktree': e['CW_S_WORKTREE'], 'notes': e['CW_S_NOTES'],
    'source': e['CW_S_SOURCE'], 'source_url': e['CW_S_SOURCE_URL'],
    'base_branch': e['CW_S_BASE'],
    'model': e['CW_S_MODEL'],
    'harness': e['CW_S_HARNESS'],
    'harness_session_id': '',
    'provider': e['CW_S_PROVIDER'],
    'status': 'active',
    'created': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'last_opened': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'opens': 1
}
with open(e['CW_S_META'], 'w') as f: json.dump(meta, f, indent=2)
PYEOF
```

`$base_branch` is already resolved above this block (`--base`, else `origin/HEAD`, else `origin/main`, always `origin/`-prefixed).

- [ ] **Step 5: Run the tests to see them pass**

Run: `./tests/run.sh -f 'base branch'`
Expected: 3 passing.

Then the related suites, to catch regressions in the session writer:

Run: `./tests/run.sh -f 'worktree|session'`
Expected: all passing.

- [ ] **Step 6: Update the docs**

At the top of `CHANGELOG.md`, below `# Changelog`:

```markdown
## Unreleased

### Added

- `cw work` records `base_branch` in a new task's `session.json`: the `origin/` ref its worktree
  starts from (`--base`, else the remote's default branch, else `origin/main`). Resumed sessions
  keep what they have; sessions created before this change have no `base_branch`.
```

In `docs/architecture.md`, in the `session.json` example, replace the line `"branch": "joselito/proj-123-fix-auth",` with `"base_branch": "origin/main",`.

- [ ] **Step 7: Run the full suite**

Run: `./tests/run.sh`
Expected: all passing (about 330 tests, a few minutes).

- [ ] **Step 8: Commit**

```bash
git add cw tests/work_worktree.bats CHANGELOG.md docs/architecture.md
git commit -m "feat: record base_branch in a new task's session.json"
```

### Task 2: Review state types and pure helpers

**Repository:** `~/workspace/personal/forge`

**Files:**
- Modify: `packages/core/src/cw-types.ts` (add `base_branch` to `CWSession`; append the review types)
- Modify: `packages/core/src/index.ts` (export the new types)
- Create: `packages/core/src/task-review.ts`
- Test: `packages/core/src/task-review.test.ts`

**Interfaces:**
- Produces (types, `cw-types.ts`): `ChecksSummary`, `PullRequestInfo`, `CloseWarning`, `DiffStat`, `GitHubLink`, `TaskReviewState`; `CWSession.base_branch?: string`.
- Produces (`task-review.ts`):
  - `interface GitHubRepo { owner: string; repo: string }`
  - `parseGitHubRemote(url: string): GitHubRepo | null`
  - `summarizeChecks(rollup: unknown): ChecksSummary`
  - `parseShortstat(text: string): DiffStat`
  - `interface LinkInput { repo: GitHubRepo | null; kind: 'task' | 'review'; prNumber?: string; pr: PullRequestInfo; branch: string | null; base: string | null; upstream: string | null; commits: number | null; uncommitted: number }`
  - `githubLink(input: LinkInput): GitHubLink`
  - `interface WarningInput { workspace: TaskReviewState['workspace']; uncommitted: number; commits: number | null; base: string | null; upstream: string | null; unpushed: number | null; pr: PullRequestInfo; gitFailed: boolean }`
  - `closeWarningsFor(input: WarningInput): CloseWarning[]`

- [ ] **Step 1: Create the branch**

```bash
cd ~/workspace/personal/forge
git switch docs/task-review-close-spec
git switch -c feat/task-review-close
```

- [ ] **Step 2: Add the types**

In `packages/core/src/cw-types.ts`, add `base_branch?: string` to `CWSession` right after `worktree: string`:

```ts
  worktree: string
  base_branch?: string
```

Append at the end of the file:

```ts
export type ChecksSummary = 'passing' | 'failing' | 'pending' | 'none'

export type PullRequestInfo =
  | {
      status: 'found'
      number: number
      url: string
      state: 'OPEN' | 'MERGED' | 'CLOSED'
      isDraft: boolean
      baseRefName: string
      checks: ChecksSummary
      review: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
    }
  | { status: 'none' }
  | { status: 'unavailable'; reason: string }

export type CloseWarning = 'uncommitted' | 'unpushed' | 'pr-open' | 'state-unknown'

export interface DiffStat { files: number; insertions: number; deletions: number }

export type GitHubLink =
  | { url: string; label: 'View PR on GitHub' | 'View on GitHub' }
  | { url: null; reason: string }
  | null

export interface TaskReviewState {
  workspace: 'ready' | 'missing' | 'none'
  branch: string | null
  base: string | null
  uncommitted: number
  commits: number | null
  upstream: string | null
  unpushed: number | null
  diff: DiffStat | null
  pr: PullRequestInfo
  github: GitHubLink
  closeWarnings: CloseWarning[]
}
```

In `packages/core/src/index.ts`, after the line exporting `SkillScope, SkillEntry, SkillDetail, ExploreResult`, add:

```ts
export type { ChecksSummary, PullRequestInfo, CloseWarning, DiffStat, GitHubLink, TaskReviewState } from './cw-types.js'
```

- [ ] **Step 3: Write the failing tests**

Create `packages/core/src/task-review.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `cd packages/core && pnpm vitest run src/task-review.test.ts`
Expected: FAIL, `Failed to resolve import "./task-review.js"`.

- [ ] **Step 5: Implement the helpers**

Create `packages/core/src/task-review.ts`:

```ts
import type { ChecksSummary, CloseWarning, DiffStat, GitHubLink, PullRequestInfo, TaskReviewState } from './cw-types.js'

export interface GitHubRepo { owner: string; repo: string }

const GITHUB_REMOTE_RE = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/

export function parseGitHubRemote(url: string): GitHubRepo | null {
  const match = GITHUB_REMOTE_RE.exec(url.trim())
  return match ? { owner: match[1], repo: match[2] } : null
}

const FAILED_CONCLUSIONS = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const FAILED_STATES = new Set(['FAILURE', 'ERROR'])
const PENDING_STATES = new Set(['PENDING', 'EXPECTED'])

interface RollupEntry { __typename?: string; status?: string; conclusion?: string; state?: string }

export function summarizeChecks(rollup: unknown): ChecksSummary {
  if (!Array.isArray(rollup) || rollup.length === 0) return 'none'
  const entries = rollup as RollupEntry[]
  const isStatusContext = (e: RollupEntry) => e.__typename === 'StatusContext' || (e.state !== undefined && e.status === undefined)
  if (entries.some(e => isStatusContext(e) ? FAILED_STATES.has(e.state ?? '') : FAILED_CONCLUSIONS.has(e.conclusion ?? ''))) return 'failing'
  if (entries.some(e => isStatusContext(e) ? PENDING_STATES.has(e.state ?? '') : e.status !== 'COMPLETED')) return 'pending'
  return 'passing'
}

export function parseShortstat(text: string): DiffStat {
  const num = (re: RegExp) => Number(re.exec(text)?.[1] ?? 0)
  return {
    files: num(/(\d+) files? changed/),
    insertions: num(/(\d+) insertions?\(\+\)/),
    deletions: num(/(\d+) deletions?\(-\)/),
  }
}

export interface LinkInput {
  repo: GitHubRepo | null
  kind: 'task' | 'review'
  prNumber?: string
  pr: PullRequestInfo
  branch: string | null
  base: string | null
  upstream: string | null
  commits: number | null
  uncommitted: number
}

export function githubLink(input: LinkInput): GitHubLink {
  const { repo, kind, pr } = input
  if (!repo) return null
  const repoUrl = `https://github.com/${repo.owner}/${repo.repo}`
  if (pr.status === 'found') {
    return { url: kind === 'review' ? pr.url : `${pr.url}/files`, label: 'View PR on GitHub' }
  }
  if (kind === 'review') {
    return input.prNumber ? { url: `${repoUrl}/pull/${encodeURIComponent(input.prNumber)}`, label: 'View PR on GitHub' } : null
  }
  if (input.upstream && input.branch) {
    const branch = encodeURIComponent(input.branch)
    if (input.base) {
      const baseName = encodeURIComponent(input.base.replace(/^origin\//, ''))
      return { url: `${repoUrl}/compare/${baseName}...${branch}`, label: 'View on GitHub' }
    }
    return { url: `${repoUrl}/tree/${branch}`, label: 'View on GitHub' }
  }
  if ((input.commits ?? 0) > 0 || input.uncommitted > 0) return { url: null, reason: 'Push the branch first' }
  return null
}

export interface WarningInput {
  workspace: TaskReviewState['workspace']
  uncommitted: number
  commits: number | null
  base: string | null
  upstream: string | null
  unpushed: number | null
  pr: PullRequestInfo
  gitFailed: boolean
}

export function closeWarningsFor(input: WarningInput): CloseWarning[] {
  if (input.workspace !== 'ready') return []
  if (input.gitFailed) return ['state-unknown']
  const warnings: CloseWarning[] = []
  if (input.uncommitted > 0) warnings.push('uncommitted')
  const unpushed = input.upstream ? (input.unpushed ?? 0) > 0 : (input.commits ?? 0) > 0
  if (unpushed) warnings.push('unpushed')
  if (input.pr.status === 'found' && input.pr.state === 'OPEN') warnings.push('pr-open')
  if (input.base === null && input.upstream === null) warnings.push('state-unknown')
  return warnings
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd packages/core && pnpm vitest run src/task-review.test.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Typecheck core**

Run: `cd packages/core && pnpm tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/cw-types.ts packages/core/src/index.ts packages/core/src/task-review.ts packages/core/src/task-review.test.ts
git commit -m "feat(core): review state types and pure helpers"
```

### Task 3: Read git state from a worktree

**Files:**
- Modify: `packages/core/src/task-review.ts` (append the runner and git readers)
- Create: `packages/core/src/test-git.ts` (fixture repositories for tests; excluded from the build in Step 1)
- Modify: `packages/core/tsconfig.json` (exclude `src/test-git.ts`)
- Test: `packages/core/src/task-review-git.test.ts`

**Interfaces:**
- Consumes: `parseGitHubRemote`, `parseShortstat`, `GitHubRepo` (Task 2).
- Produces (`task-review.ts`):
  - `interface RunResult { code: number; stdout: string; stderr: string }`
  - `type Runner = (bin: string, args: string[], cwd: string) => Promise<RunResult>`
  - `runCommand: Runner` — `execFile`, 10 s timeout; `ENOENT` gives `{ code: 127, stderr: 'ENOENT' }`
  - `class GitReadError extends Error`
  - `interface GitSnapshot { branch: string | null; uncommitted: number; upstream: string | null; unpushed: number | null; repo: GitHubRepo | null }`
  - `readGitSnapshot(run: Runner, worktree: string): Promise<GitSnapshot>` — throws `GitReadError` when `rev-parse` or `status` fails
  - `resolveBase(run: Runner, cwd: string, candidates: Array<string | null | undefined>): Promise<string | null>` — the literal candidate `'origin/HEAD'` is resolved through `symbolic-ref`
  - `readBaseCounts(run: Runner, cwd: string, base: string | null): Promise<{ commits: number | null; diff: DiffStat | null }>`

- [ ] **Step 1: Write the fixture helper**

Tests build throwaway repositories. They must not read the user's global git config, which may require GPG signing or install hooks. Create `packages/core/src/test-git.ts` (the `.test.ts` exclude in `tsconfig.json` does not match it, so keep it free of Vitest imports; it only uses `node:` modules):

```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
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
```

In `packages/core/tsconfig.json`, extend `exclude` so the helper never ships:

```json
  "exclude": ["src/**/*.test.ts", "src/test-git.ts", "node_modules", "dist"]
```

- [ ] **Step 2: Write the failing tests**

Create `packages/core/src/task-review-git.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand, readGitSnapshot, resolveBase, readBaseCounts, GitReadError } from './task-review.js'
import { makeFixtureRepo, type FixtureRepo } from './test-git.js'

let repo: FixtureRepo | null = null
afterEach(() => { if (repo) rmSync(repo.root, { recursive: true, force: true }); repo = null })

describe('readGitSnapshot', () => {
  it('reads a fresh task branch with no changes and no upstream', async () => {
    repo = makeFixtureRepo()
    repo.git('switch', '-q', '-c', 'task/fix-auth')
    expect(await readGitSnapshot(runCommand, repo.work)).toEqual({
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
    expect((await readGitSnapshot(runCommand, repo.work)).uncommitted).toBe(2)
  })

  it('reads the upstream and the commits not pushed to it', async () => {
    repo = makeFixtureRepo()
    repo.git('switch', '-q', '-c', 'task/fix-auth')
    repo.git('push', '-q', '-u', 'origin', 'task/fix-auth')
    expect(await readGitSnapshot(runCommand, repo.work)).toMatchObject({ upstream: 'origin/task/fix-auth', unpushed: 0 })
    repo.git('commit', '-q', '--allow-empty', '-m', 'more')
    expect((await readGitSnapshot(runCommand, repo.work)).unpushed).toBe(1)
  })

  it('reads a GitHub origin', async () => {
    repo = makeFixtureRepo()
    repo.git('remote', 'set-url', 'origin', 'git@github.com:o/r.git')
    expect((await readGitSnapshot(runCommand, repo.work)).repo).toEqual({ owner: 'o', repo: 'r' })
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

describe('resolveBase', () => {
  it('takes the first candidate that exists', async () => {
    repo = makeFixtureRepo()
    expect(await resolveBase(runCommand, repo.work, [null, 'origin/develop', 'origin/main'])).toBe('origin/main')
  })

  it('resolves origin/HEAD to the branch it points at', async () => {
    repo = makeFixtureRepo()
    expect(await resolveBase(runCommand, repo.work, [undefined, 'origin/HEAD', 'origin/other'])).toBe('origin/main')
  })

  it('skips origin/HEAD when the remote has none', async () => {
    repo = makeFixtureRepo()
    repo.git('symbolic-ref', '--delete', 'refs/remotes/origin/HEAD')
    expect(await resolveBase(runCommand, repo.work, ['origin/HEAD', 'origin/main'])).toBe('origin/main')
  })

  it('is null when nothing resolves', async () => {
    repo = makeFixtureRepo()
    expect(await resolveBase(runCommand, repo.work, ['origin/nope', null])).toBeNull()
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
    expect(await readBaseCounts(runCommand, repo.work, 'origin/main')).toEqual({
      commits: 2, diff: { files: 1, insertions: 2, deletions: 0 },
    })
  })

  it('is unknown without a base', async () => {
    repo = makeFixtureRepo()
    expect(await readBaseCounts(runCommand, repo.work, null)).toEqual({ commits: null, diff: null })
  })
})
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `cd packages/core && pnpm vitest run src/task-review-git.test.ts`
Expected: FAIL, `runCommand` (and the other readers) not exported.

- [ ] **Step 4: Implement the readers**

At the top of `packages/core/src/task-review.ts`, add the import:

```ts
import { execFile } from 'node:child_process'
```

Append to `packages/core/src/task-review.ts`:

```ts
export interface RunResult { code: number; stdout: string; stderr: string }
export type Runner = (bin: string, args: string[], cwd: string) => Promise<RunResult>

const COMMAND_TIMEOUT_MS = 10_000

export const runCommand: Runner = (bin, args, cwd) => new Promise((resolve) => {
  execFile(bin, args, { cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (!err) return resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) })
    const { code } = err as NodeJS.ErrnoException & { code?: number | string }
    if (code === 'ENOENT') return resolve({ code: 127, stdout: '', stderr: 'ENOENT' })
    resolve({ code: typeof code === 'number' ? code : 1, stdout: String(stdout), stderr: String(stderr) || err.message })
  })
})

export class GitReadError extends Error {}

export interface GitSnapshot {
  branch: string | null
  uncommitted: number
  upstream: string | null
  unpushed: number | null
  repo: GitHubRepo | null
}

const lines = (text: string) => text.split('\n').filter(line => line.length > 0)

export async function readGitSnapshot(run: Runner, worktree: string): Promise<GitSnapshot> {
  const head = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktree)
  if (head.code !== 0) throw new GitReadError(head.stderr.trim() || 'git rev-parse failed')
  const status = await run('git', ['status', '--porcelain'], worktree)
  if (status.code !== 0) throw new GitReadError(status.stderr.trim() || 'git status failed')

  const branchName = head.stdout.trim()
  const upstreamRes = await run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], worktree)
  const upstream = upstreamRes.code === 0 ? upstreamRes.stdout.trim() : null
  let unpushed: number | null = null
  if (upstream) {
    const count = await run('git', ['rev-list', '--count', '@{u}..HEAD'], worktree)
    unpushed = count.code === 0 ? Number(count.stdout.trim()) : null
  }
  const remote = await run('git', ['remote', 'get-url', 'origin'], worktree)

  return {
    branch: branchName === 'HEAD' ? null : branchName,
    uncommitted: lines(status.stdout).length,
    upstream,
    unpushed,
    repo: remote.code === 0 ? parseGitHubRemote(remote.stdout) : null,
  }
}

export async function resolveBase(run: Runner, cwd: string, candidates: Array<string | null | undefined>): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue
    let ref = candidate
    if (candidate === 'origin/HEAD') {
      const head = await run('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd)
      if (head.code !== 0) continue
      ref = head.stdout.trim().replace(/^refs\/remotes\//, '')
    }
    const verify = await run('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
    if (verify.code === 0) return ref
  }
  return null
}

export async function readBaseCounts(run: Runner, cwd: string, base: string | null): Promise<{ commits: number | null; diff: DiffStat | null }> {
  if (!base) return { commits: null, diff: null }
  const count = await run('git', ['rev-list', '--count', `${base}..HEAD`], cwd)
  const stat = await run('git', ['diff', '--shortstat', base], cwd)
  return {
    commits: count.code === 0 ? Number(count.stdout.trim()) : null,
    diff: stat.code === 0 ? parseShortstat(stat.stdout) : null,
  }
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd packages/core && pnpm vitest run src/task-review-git.test.ts src/task-review.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `cd packages/core && pnpm tsc --noEmit`
Expected: exit 0.

```bash
git add packages/core/tsconfig.json packages/core/src/task-review.ts packages/core/src/test-git.ts packages/core/src/task-review-git.test.ts
git commit -m "feat(core): read a task worktree's git state"
```

### Task 4: Read pull requests with `gh` and limit concurrency

**Files:**
- Modify: `packages/core/src/task-review.ts` (append)
- Test: `packages/core/src/task-review-pr.test.ts`

**Interfaces:**
- Consumes: `Runner`, `RunResult` (Task 3); `summarizeChecks` (Task 2); `PullRequestInfo` (Task 2).
- Produces (`task-review.ts`):
  - `readPullRequestForBranch(run: Runner, cwd: string, branch: string): Promise<PullRequestInfo>`
  - `readPullRequestByNumber(run: Runner, cwd: string, number: string): Promise<PullRequestInfo>`
  - `createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T>`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/task-review-pr.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readPullRequestForBranch, readPullRequestByNumber, createLimiter, type Runner, type RunResult } from './task-review.js'

interface Call { bin: string; args: string[]; cwd: string }

const fakeRunner = (result: RunResult, calls: Call[] = []): Runner => async (bin, args, cwd) => {
  calls.push({ bin, args, cwd })
  return result
}

const rawPr = {
  number: 41, state: 'OPEN', url: 'https://github.com/o/r/pull/41', isDraft: true, baseRefName: 'develop',
  reviewDecision: 'CHANGES_REQUESTED',
  statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }],
}

const FIELDS = 'number,state,url,isDraft,baseRefName,reviewDecision,statusCheckRollup'

describe('readPullRequestForBranch', () => {
  it('lists pull requests for the branch in every state and maps the newest', async () => {
    const calls: Call[] = []
    const run = fakeRunner({ code: 0, stdout: JSON.stringify([rawPr]), stderr: '' }, calls)
    expect(await readPullRequestForBranch(run, '/repo', 'task/fix-auth')).toEqual({
      status: 'found', number: 41, url: 'https://github.com/o/r/pull/41', state: 'OPEN', isDraft: true,
      baseRefName: 'develop', checks: 'failing', review: 'CHANGES_REQUESTED',
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd packages/core && pnpm vitest run src/task-review-pr.test.ts`
Expected: FAIL, `readPullRequestForBranch` not exported.

- [ ] **Step 3: Implement**

Append to `packages/core/src/task-review.ts`:

```ts
const PR_FIELDS = 'number,state,url,isDraft,baseRefName,reviewDecision,statusCheckRollup'
const PR_STATES = new Set(['OPEN', 'MERGED', 'CLOSED'])
const REVIEW_DECISIONS = new Set(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'])

interface RawPullRequest {
  number: number
  state: string
  url: string
  isDraft: boolean
  baseRefName: string
  reviewDecision: string
  statusCheckRollup: unknown
}

function toPullRequestInfo(raw: RawPullRequest): PullRequestInfo {
  return {
    status: 'found',
    number: raw.number,
    url: raw.url,
    state: (PR_STATES.has(raw.state) ? raw.state : 'CLOSED') as 'OPEN' | 'MERGED' | 'CLOSED',
    isDraft: Boolean(raw.isDraft),
    baseRefName: raw.baseRefName,
    checks: summarizeChecks(raw.statusCheckRollup),
    review: REVIEW_DECISIONS.has(raw.reviewDecision)
      ? raw.reviewDecision as 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'
      : null,
  }
}

function ghUnavailable(result: RunResult): PullRequestInfo {
  if (result.code === 127 && result.stderr === 'ENOENT') return { status: 'unavailable', reason: 'gh is not installed' }
  const firstLine = result.stderr.split('\n').map(line => line.trim()).find(line => line.length > 0)
  return { status: 'unavailable', reason: firstLine ?? 'gh failed' }
}

const UNEXPECTED: PullRequestInfo = { status: 'unavailable', reason: 'gh returned unexpected output' }

export async function readPullRequestForBranch(run: Runner, cwd: string, branch: string): Promise<PullRequestInfo> {
  const result = await run('gh', ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', PR_FIELDS], cwd)
  if (result.code !== 0) return ghUnavailable(result)
  try {
    const list = JSON.parse(result.stdout) as RawPullRequest[]
    if (!Array.isArray(list)) return UNEXPECTED
    return list.length === 0 ? { status: 'none' } : toPullRequestInfo(list[0])
  } catch {
    return UNEXPECTED
  }
}

export async function readPullRequestByNumber(run: Runner, cwd: string, number: string): Promise<PullRequestInfo> {
  const result = await run('gh', ['pr', 'view', number, '--json', PR_FIELDS], cwd)
  if (result.code !== 0) return ghUnavailable(result)
  try {
    const raw = JSON.parse(result.stdout) as RawPullRequest
    return typeof raw?.number === 'number' ? toPullRequestInfo(raw) : UNEXPECTED
  } catch {
    return UNEXPECTED
  }
}

export function createLimiter(max: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: Array<() => void> = []
  // a finishing task hands its slot straight to the next waiter, so a new caller can never slip in between
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>(resolve => waiting.push(resolve))
    else active++
    try {
      return await fn()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd packages/core && pnpm vitest run src/task-review-pr.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `cd packages/core && pnpm tsc --noEmit`
Expected: exit 0.

```bash
git add packages/core/src/task-review.ts packages/core/src/task-review-pr.test.ts
git commit -m "feat(core): read pull request state through gh"
```

### Task 5: Build the review state and serve it

**Files:**
- Modify: `packages/core/src/task-review.ts` (append `buildTaskReviewState`)
- Modify: `packages/core/src/cw-routes.ts` (options, cache, `GET /review-state/:project/:sessionDir`)
- Test: `packages/core/src/task-review-build.test.ts`
- Test: `packages/core/src/cw-routes.test.ts` (new `describe` at the end of the top-level `describe('CW Routes')`)

**Interfaces:**
- Consumes: everything from Tasks 2–4; `makeFixtureRepo` (Task 3); `CWReader.getSession(project, sessionDir)`, `CWReader.getProjects(): Record<string, CWProject>`.
- Produces:
  - `interface ReviewDeps { run: Runner; limitGh: <T>(fn: () => Promise<T>) => Promise<T>; exists: (path: string) => boolean }`
  - `buildTaskReviewState(session: CWSession, projectPath: string | null, deps: ReviewDeps): Promise<TaskReviewState>`
  - `cwRoutes(reader, options: { loginManager?: LoginManager; localOnly?: boolean; runner?: Runner })` — `localOnly` defaults to `true`, `runner` to `runCommand`. Task 6 adds `editors`.
  - Inside `cwRoutes`: `reviewCache: Map<string, { at: number; value: Promise<TaskReviewState> }>` keyed `project::sessionDir`; Task 7 deletes entries from it.
  - `GET /api/cw/review-state/:project/:sessionDir[?fresh=1]` → `TaskReviewState` or `404 { error: 'Session not found' }`.

- [ ] **Step 1: Write the failing unit tests**

Create `packages/core/src/task-review-build.test.ts`:

```ts
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/core && pnpm vitest run src/task-review-build.test.ts`
Expected: FAIL, `buildTaskReviewState` not exported.

- [ ] **Step 3: Implement `buildTaskReviewState`**

In `packages/core/src/task-review.ts`, extend the type import at the top to include `CWSession`:

```ts
import type { ChecksSummary, CloseWarning, CWSession, DiffStat, GitHubLink, PullRequestInfo, TaskReviewState } from './cw-types.js'
```

Append:

```ts
export interface ReviewDeps {
  run: Runner
  limitGh: <T>(fn: () => Promise<T>) => Promise<T>
  exists: (path: string) => boolean
}

const NOT_GITHUB: PullRequestInfo = { status: 'unavailable', reason: 'origin is not a GitHub repository' }

function idleState(workspace: TaskReviewState['workspace']): TaskReviewState {
  return {
    workspace, branch: null, base: null, uncommitted: 0, commits: null, upstream: null, unpushed: null,
    diff: null, pr: { status: 'none' }, github: null, closeWarnings: [],
  }
}

async function buildReviewSessionState(session: CWSession, projectPath: string | null, deps: ReviewDeps): Promise<TaskReviewState> {
  if (!projectPath || !deps.exists(projectPath)) return idleState('none')
  const remote = await deps.run('git', ['remote', 'get-url', 'origin'], projectPath)
  const repo = remote.code === 0 ? parseGitHubRemote(remote.stdout) : null
  const prNumber = session.pr
  const pr: PullRequestInfo = !repo ? NOT_GITHUB
    : prNumber ? await deps.limitGh(() => readPullRequestByNumber(deps.run, projectPath, prNumber))
    : { status: 'none' }
  const github = githubLink({ repo, kind: 'review', prNumber, pr, branch: null, base: null, upstream: null, commits: null, uncommitted: 0 })
  return { ...idleState('none'), pr, github }
}

export async function buildTaskReviewState(session: CWSession, projectPath: string | null, deps: ReviewDeps): Promise<TaskReviewState> {
  if (session.type === 'review') return buildReviewSessionState(session, projectPath, deps)
  if (session.type !== 'task') return idleState('none')
  const worktree = session.worktree
  if (!worktree || !deps.exists(worktree)) return idleState('missing')

  let snapshot: GitSnapshot
  try {
    snapshot = await readGitSnapshot(deps.run, worktree)
  } catch {
    return { ...idleState('ready'), pr: { status: 'unavailable', reason: 'Could not read git state' }, closeWarnings: ['state-unknown'] }
  }

  const { branch, repo, uncommitted, upstream, unpushed } = snapshot
  const pr: PullRequestInfo = !repo ? NOT_GITHUB
    : branch ? await deps.limitGh(() => readPullRequestForBranch(deps.run, worktree, branch))
    : { status: 'none' }
  const base = await resolveBase(deps.run, worktree, [
    pr.status === 'found' ? `origin/${pr.baseRefName}` : null,
    session.base_branch,
    'origin/HEAD',
    'origin/main',
  ])
  const { commits, diff } = await readBaseCounts(deps.run, worktree, base)

  return {
    workspace: 'ready', branch, base, uncommitted, commits, upstream, unpushed, diff, pr,
    github: githubLink({ repo, kind: 'task', pr, branch, base, upstream, commits, uncommitted }),
    closeWarnings: closeWarningsFor({ workspace: 'ready', uncommitted, commits, base, upstream, unpushed, pr, gitFailed: false }),
  }
}
```

- [ ] **Step 4: Run the unit tests to see them pass**

Run: `cd packages/core && pnpm vitest run src/task-review-build.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests**

In `packages/core/src/cw-routes.test.ts`, add to the imports:

```ts
import type { Runner } from './task-review.js'
import type { TaskReviewState } from './cw-types.js'
```

Add this `describe` as the last block inside `describe('CW Routes', ...)`:

```ts
  describe('GET /api/cw/review-state', () => {
    const notRepo = join(tmpdir(), `forge-review-route-${Date.now()}`)
    let calls = 0
    let reviewApp: Hono

    beforeAll(() => {
      mkdirSync(notRepo, { recursive: true })
      mkdirSync(join(TEST_CW, 'sessions/testproj/task-reviewed'), { recursive: true })
      writeFileSync(join(TEST_CW, 'sessions/testproj/task-reviewed/session.json'), JSON.stringify({
        project: 'testproj', task: 'reviewed', type: 'task', account: 'default', worktree: notRepo, notes: '',
        status: 'active', created: '2026-09-14T00:00:00Z', last_opened: '2026-09-14T00:00:00Z', opens: 1,
      }))
      const runner: Runner = async () => { calls++; return { code: 128, stdout: '', stderr: 'not a git repository' } }
      reviewApp = new Hono()
      reviewApp.route('/api/cw', cwRoutes(new CWReader(TEST_CW), { runner }))
    })

    afterAll(() => { rmSync(notRepo, { recursive: true, force: true }) })

    it('returns 404 for an unknown session', async () => {
      const res = await reviewApp.request('/api/cw/review-state/testproj/task-nope')
      expect(res.status).toBe(404)
    })

    it('returns workspace none for a loop session', async () => {
      const res = await reviewApp.request('/api/cw/review-state/testproj/loop-noworktree')
      expect(res.status).toBe(200)
      expect((await res.json() as TaskReviewState).workspace).toBe('none')
    })

    it('caches a session for 30 s and refreshes with fresh=1', async () => {
      const first = await reviewApp.request('/api/cw/review-state/testproj/task-reviewed')
      expect((await first.json() as TaskReviewState).closeWarnings).toEqual(['state-unknown'])
      const afterFirst = calls
      expect(afterFirst).toBeGreaterThan(0)

      await reviewApp.request('/api/cw/review-state/testproj/task-reviewed')
      expect(calls).toBe(afterFirst)

      await reviewApp.request('/api/cw/review-state/testproj/task-reviewed?fresh=1')
      expect(calls).toBeGreaterThan(afterFirst)
    })
  })
```

- [ ] **Step 6: Run them to see them fail**

Run: `cd packages/core && pnpm vitest run src/cw-routes.test.ts -t review-state`
Expected: FAIL, 404 for every request (route missing) and a type error on the `runner` option.

- [ ] **Step 7: Add the route**

In `packages/core/src/cw-routes.ts`:

Add imports after the `importApiKey` import:

```ts
import { buildTaskReviewState, createLimiter, runCommand, type Runner } from './task-review.js'
import type { TaskReviewState } from './cw-types.js'
```

Replace the `cwRoutes` signature and its first lines:

```ts
export function cwRoutes(reader: CWReader, options: { loginManager?: LoginManager; localOnly?: boolean; runner?: Runner } = {}): Hono {
  const app = new Hono()
  const cwBin = resolveCwBin(reader.cwHome)
  const logins = options.loginManager ?? new LoginManager(cwBin)
  const run = options.runner ?? runCommand
  const limitGh = createLimiter(4)
  const REVIEW_TTL_MS = 30_000
  const reviewCache = new Map<string, { at: number; value: Promise<TaskReviewState> }>()
```

(keep the existing `knownAccount` and `doctor` lines that follow).

Add the route right before `app.post('/start', ...)`:

```ts
  app.get('/review-state/:project/:sessionDir', async (c) => {
    const project = c.req.param('project')
    const sessionDir = c.req.param('sessionDir')
    const session = reader.getSession(project, sessionDir)
    if (!session) return c.json({ error: 'Session not found' }, 404)

    const key = `${project}::${sessionDir}`
    const cached = reviewCache.get(key)
    if (c.req.query('fresh') !== '1' && cached && Date.now() - cached.at < REVIEW_TTL_MS) {
      return c.json(await cached.value)
    }
    const projectPath = reader.getProjects()[project]?.path ?? null
    const value = buildTaskReviewState(session, projectPath, { run, limitGh, exists: existsSync })
    reviewCache.set(key, { at: Date.now(), value })
    value.catch(() => reviewCache.delete(key))
    return c.json(await value)
  })
```

In `packages/core/src/server.ts`, pass `localOnly` through:

```ts
  app.route('/api/cw', cwRoutes(cwReader, { loginManager, localOnly }))
```

- [ ] **Step 8: Run the core suite**

Run: `cd packages/core && pnpm vitest run`
Expected: PASS, including the three new route tests and the existing 248.

- [ ] **Step 9: Typecheck and commit**

Run: `cd packages/core && pnpm tsc --noEmit`
Expected: exit 0.

```bash
git add packages/core/src/task-review.ts packages/core/src/task-review-build.test.ts packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts packages/core/src/server.ts
git commit -m "feat(core): serve a task's review state"
```

### Task 6: Detect editors and open a task in one

**Files:**
- Create: `packages/core/src/editors.ts`
- Test: `packages/core/src/editors.test.ts`
- Modify: `packages/core/src/cw-routes.ts` (option `editors`, `GET /editors`, `POST /open-in-editor`)
- Test: `packages/core/src/cw-routes.test.ts` (new `describe`)

**Interfaces:**
- Consumes: `cwRoutes` options and `localOnly` (Task 5).
- Produces (`editors.ts`):
  - `interface EditorDef { id: string; label: string; cli: string; app: string }`, `EDITORS: EditorDef[]`
  - `interface DetectedEditor { id: string; label: string; bin: string; args: string[] }`
  - `interface EditorProbe { onPath: (cli: string) => string | null; appExists: (app: string) => boolean; platform: NodeJS.Platform }`
  - `detectEditors(probe: EditorProbe): DetectedEditor[]`, `systemProbe: EditorProbe`
  - `openInEditor(editor: DetectedEditor, dir: string): Promise<void>`
- Produces (routes):
  - `GET /api/cw/editors` → `{ enabled: boolean; editors: Array<{ id: string; label: string }> }`
  - `POST /api/cw/open-in-editor` `{ project, sessionDir, editor }` → `{ ok: true }` | `403|400|404|500 { ok: false, error }`
  - `cwRoutes` option `editors?: DetectedEditor[]` (defaults to `detectEditors(systemProbe)`, run once per `cwRoutes` call).

- [ ] **Step 1: Write the failing unit tests**

Create `packages/core/src/editors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectEditors, openInEditor, type EditorProbe } from './editors.js'

const probe = (over: Partial<EditorProbe>): EditorProbe => ({
  onPath: () => null, appExists: () => false, platform: 'linux', ...over,
})

describe('detectEditors', () => {
  it('uses a CLI found on PATH', () => {
    const found = detectEditors(probe({ onPath: cli => cli === 'code' ? '/usr/local/bin/code' : null }))
    expect(found).toEqual([{ id: 'vscode', label: 'VS Code', bin: '/usr/local/bin/code', args: [] }])
  })

  it('falls back to open -a for a macOS app without a CLI', () => {
    const found = detectEditors(probe({ platform: 'darwin', appExists: app => app === 'Cursor.app' }))
    expect(found).toEqual([{ id: 'cursor', label: 'Cursor', bin: 'open', args: ['-a', 'Cursor'] }])
  })

  it('ignores app bundles off macOS', () => {
    expect(detectEditors(probe({ platform: 'linux', appExists: () => true }))).toEqual([])
  })

  it('keeps the table order: VS Code, Cursor, Windsurf, Zed', () => {
    const found = detectEditors(probe({ onPath: cli => `/bin/${cli}` }))
    expect(found.map(e => e.id)).toEqual(['vscode', 'cursor', 'windsurf', 'zed'])
  })
})

describe('openInEditor', () => {
  it('resolves once the editor process starts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-editor-'))
    try {
      await expect(openInEditor({ id: 'vscode', label: 'VS Code', bin: '/bin/sh', args: ['-c', 'exit 0'] }, dir)).resolves.toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rejects when the binary does not exist', async () => {
    await expect(openInEditor({ id: 'zed', label: 'Zed', bin: '/nonexistent/zed', args: [] }, tmpdir())).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/core && pnpm vitest run src/editors.test.ts`
Expected: FAIL, cannot resolve `./editors.js`.

- [ ] **Step 3: Implement `editors.ts`**

Create `packages/core/src/editors.ts`:

```ts
import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export interface EditorDef { id: string; label: string; cli: string; app: string }

export const EDITORS: EditorDef[] = [
  { id: 'vscode', label: 'VS Code', cli: 'code', app: 'Visual Studio Code.app' },
  { id: 'cursor', label: 'Cursor', cli: 'cursor', app: 'Cursor.app' },
  { id: 'windsurf', label: 'Windsurf', cli: 'windsurf', app: 'Windsurf.app' },
  { id: 'zed', label: 'Zed', cli: 'zed', app: 'Zed.app' },
]

export interface DetectedEditor { id: string; label: string; bin: string; args: string[] }

export interface EditorProbe {
  onPath: (cli: string) => string | null
  appExists: (app: string) => boolean
  platform: NodeJS.Platform
}

export function detectEditors(probe: EditorProbe): DetectedEditor[] {
  const found: DetectedEditor[] = []
  for (const def of EDITORS) {
    const cliPath = probe.onPath(def.cli)
    if (cliPath) {
      found.push({ id: def.id, label: def.label, bin: cliPath, args: [] })
    } else if (probe.platform === 'darwin' && probe.appExists(def.app)) {
      found.push({ id: def.id, label: def.label, bin: 'open', args: ['-a', def.app.replace(/\.app$/, '')] })
    }
  }
  return found
}

export const systemProbe: EditorProbe = {
  onPath: (cli) => {
    for (const dir of (process.env.PATH ?? '').split(delimiter)) {
      if (!dir) continue
      const candidate = join(dir, cli)
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        // not in this directory
      }
    }
    return null
  },
  appExists: (app) => existsSync(join('/Applications', app)),
  platform: process.platform,
}

export function openInEditor(editor: DetectedEditor, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(editor.bin, [...editor.args, dir], { detached: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
```

- [ ] **Step 4: Run the unit tests to see them pass**

Run: `cd packages/core && pnpm vitest run src/editors.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests**

Add to the imports of `packages/core/src/cw-routes.test.ts`:

```ts
import type { DetectedEditor } from './editors.js'
```

Add as the last block inside `describe('CW Routes', ...)`:

```ts
  describe('editors', () => {
    const workspace = join(tmpdir(), `forge-editor-route-${Date.now()}`)
    const editors: DetectedEditor[] = [{ id: 'vscode', label: 'VS Code', bin: '/bin/sh', args: ['-c', 'exit 0'] }]
    let localApp: Hono
    let remoteApp: Hono

    beforeAll(() => {
      mkdirSync(workspace, { recursive: true })
      mkdirSync(join(TEST_CW, 'sessions/testproj/task-editable'), { recursive: true })
      writeFileSync(join(TEST_CW, 'sessions/testproj/task-editable/session.json'), JSON.stringify({
        project: 'testproj', task: 'editable', type: 'task', account: 'default', worktree: workspace, notes: '',
        status: 'active', created: '2026-09-14T00:00:00Z', last_opened: '2026-09-14T00:00:00Z', opens: 1,
      }))
      localApp = new Hono()
      localApp.route('/api/cw', cwRoutes(new CWReader(TEST_CW), { editors, localOnly: true }))
      remoteApp = new Hono()
      remoteApp.route('/api/cw', cwRoutes(new CWReader(TEST_CW), { editors, localOnly: false }))
    })

    afterAll(() => { rmSync(workspace, { recursive: true, force: true }) })

    const open = (target: Hono, body: Record<string, string>) => target.request('/api/cw/open-in-editor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })

    it('lists detected editors in local mode and none remotely', async () => {
      expect(await (await localApp.request('/api/cw/editors')).json()).toEqual({ enabled: true, editors: [{ id: 'vscode', label: 'VS Code' }] })
      expect(await (await remoteApp.request('/api/cw/editors')).json()).toEqual({ enabled: false, editors: [] })
    })

    it('refuses to open an editor remotely', async () => {
      const res = await open(remoteApp, { project: 'testproj', sessionDir: 'task-editable', editor: 'vscode' })
      expect(res.status).toBe(403)
    })

    it('rejects an editor that was not detected', async () => {
      const res = await open(localApp, { project: 'testproj', sessionDir: 'task-editable', editor: 'zed' })
      expect(res.status).toBe(400)
    })

    it('returns 404 when the task has no workspace on disk', async () => {
      const res = await open(localApp, { project: 'testproj', sessionDir: 'task-mytask', editor: 'vscode' })
      expect(res.status).toBe(404)
    })

    it('opens the worktree', async () => {
      const res = await open(localApp, { project: 'testproj', sessionDir: 'task-editable', editor: 'vscode' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })
  })
```

- [ ] **Step 6: Run them to see them fail**

Run: `cd packages/core && pnpm vitest run src/cw-routes.test.ts -t editors`
Expected: FAIL (404 on every route, type error on the `editors` option).

- [ ] **Step 7: Add the routes**

In `packages/core/src/cw-routes.ts`, add the import:

```ts
import { detectEditors, openInEditor, systemProbe, type DetectedEditor } from './editors.js'
```

Extend the options type and add two lines after `const run = ...`:

```ts
export function cwRoutes(reader: CWReader, options: { loginManager?: LoginManager; localOnly?: boolean; runner?: Runner; editors?: DetectedEditor[] } = {}): Hono {
```

```ts
  const localOnly = options.localOnly ?? true
  const editors = options.editors ?? detectEditors(systemProbe)
```

Add the routes right after the `/review-state` route:

```ts
  app.get('/editors', (c) => c.json({
    enabled: localOnly,
    editors: localOnly ? editors.map(({ id, label }) => ({ id, label })) : [],
  }))

  app.post('/open-in-editor', async (c) => {
    if (!localOnly) {
      return c.json({ ok: false, error: 'Opening an editor only works on the machine running Forge' }, 403)
    }
    const { project, sessionDir, editor } = await c.req.json<{ project: string; sessionDir: string; editor: string }>()
    const target = editors.find(e => e.id === editor)
    if (!target) return c.json({ ok: false, error: `Editor not available: ${editor}` }, 400)
    const session = reader.getSession(project, sessionDir)
    if (!session?.worktree || !existsSync(session.worktree)) {
      return c.json({ ok: false, error: 'This task has no workspace on disk yet' }, 404)
    }
    try {
      await openInEditor(target, session.worktree)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: `Could not start ${target.label}: ${(err as Error).message}` }, 500)
    }
  })
```

- [ ] **Step 8: Run the core suite, typecheck, commit**

Run: `cd packages/core && pnpm vitest run && pnpm tsc --noEmit`
Expected: all tests PASS, tsc exit 0.

```bash
git add packages/core/src/editors.ts packages/core/src/editors.test.ts packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts
git commit -m "feat(core): detect editors and open a task's worktree"
```

### Task 7: `/done` waits for CW, git routes move to `execFile`

**Files:**
- Modify: `packages/core/src/cw-routes.ts` (`/done`, `/git/status`, `/git/log`, `/git/branch`, `/git/diff`; new `runCw` and `tailOutput`)
- Test: `packages/core/src/cw-routes.test.ts` (replace the loop `done` test; add failure and git route tests)

**Interfaces:**
- Consumes: `run`, `reviewCache` inside `cwRoutes` (Task 5); `resolveBase`, `RunResult` (Task 3); `makeFixtureRepo` (Task 3); `envWithoutHarness` (existing, `cw-doctor.ts`).
- Produces:
  - `export function tailOutput(text: string, max?: number): string` in `cw-routes.ts` — ANSI removed, last `max` (default 20) lines.
  - `POST /api/cw/done` → `200 { ok: true }` | `500 { ok: false, error: string }`. No `updated` field any more.

- [ ] **Step 1: Write the failing tests**

In `packages/core/src/cw-routes.test.ts`, add to the imports:

```ts
import { tailOutput } from './cw-routes.js'
import { makeFixtureRepo, type FixtureRepo } from './test-git.js'
```

(merge `tailOutput` into the existing `import { cwRoutes } from './cw-routes.js'` line.)

Replace the whole test `it('POST /api/cw/done marks a loop session done using the loop-<task> sessionDir default', ...)` with:

```ts
  describe('POST /api/cw/done', () => {
    const cwScript = () => join(TEST_CW, 'bin/cw')
    const argsLog = () => join(TEST_CW, 'done-args.log')
    const writeCw = (body: string) => {
      writeFileSync(cwScript(), `#!/bin/sh\n${body}\n`)
      chmodSync(cwScript(), 0o755)
    }
    const done = (body: Record<string, string>) => app.request('/api/cw/done', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })

    afterAll(() => writeCw('exit 0'))

    it('runs cw loop --done and waits for it', async () => {
      writeCw(`echo "$@" > "${argsLog()}"\nexit 0`)
      const res = await done({ project: 'testproj', task: 'donetest', type: 'loop' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(readFileSync(argsLog(), 'utf-8').trim()).toBe('loop testproj donetest --done')
    })

    it('runs cw work --done for a task', async () => {
      writeCw(`echo "$@" > "${argsLog()}"\nexit 0`)
      await done({ project: 'testproj', task: 'mytask', type: 'task' })
      expect(readFileSync(argsLog(), 'utf-8').trim()).toBe('work testproj mytask --done')
    })

    it('returns the tail of cw output without ANSI codes when it fails', async () => {
      writeCw(`echo "Closing task: mytask"\nprintf '\\033[31mError:\\033[0m worktree is locked\\n' >&2\nexit 3`)
      const res = await done({ project: 'testproj', task: 'mytask', type: 'task' })
      expect(res.status).toBe(500)
      const body = await res.json() as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
      expect(body.error).toBe('Closing task: mytask\nError: worktree is locked')
    })
  })

  describe('tailOutput', () => {
    it('keeps the last lines and strips ANSI codes', () => {
      const text = Array.from({ length: 25 }, (_, i) => `[2mline ${i + 1}[0m`).join('\n')
      const tail = tailOutput(text).split('\n')
      expect(tail).toHaveLength(20)
      expect(tail[0]).toBe('line 6')
      expect(tail[19]).toBe('line 25')
    })
  })

  describe('git routes on a real worktree', () => {
    let repo: FixtureRepo

    beforeAll(() => {
      repo = makeFixtureRepo()
      repo.git('switch', '-q', '-c', 'fix-diff')
      writeFileSync(join(repo.work, 'a.txt'), 'one\n')
      repo.git('add', 'a.txt')
      repo.git('commit', '-q', '-m', 'a')
      mkdirSync(join(TEST_CW, 'sessions/testproj/task-fix-diff'), { recursive: true })
      writeFileSync(join(TEST_CW, 'sessions/testproj/task-fix-diff/session.json'), JSON.stringify({
        project: 'testproj', task: 'fix-diff', type: 'task', account: 'default', worktree: repo.work,
        base_branch: 'origin/main', notes: '', status: 'active',
        created: '2026-09-14T00:00:00Z', last_opened: '2026-09-14T00:00:00Z', opens: 1,
      }))
    })

    afterAll(() => { rmSync(repo.root, { recursive: true, force: true }) })

    it('reads the branch', async () => {
      const res = await app.request('/api/cw/git/branch/testproj/task-fix-diff')
      expect(await res.json()).toEqual({ branch: 'fix-diff' })
    })

    it('diffs against the base branch instead of HEAD~5', async () => {
      const res = await app.request('/api/cw/git/diff/testproj/task-fix-diff')
      const body = await res.json() as { output: string }
      expect(body.output).toContain('a.txt')
      expect(body.output).toContain('1 file changed')
    })

    it('reads a clean status as empty output', async () => {
      const res = await app.request('/api/cw/git/status/testproj/task-fix-diff')
      expect(await res.json()).toEqual({ output: '' })
    })
  })
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/core && pnpm vitest run src/cw-routes.test.ts -t "done|tailOutput|git routes"`
Expected: FAIL — `tailOutput` not exported; the failure test gets `200`; the diff test shows `HEAD~5` output or an error.

- [ ] **Step 3: Add `runCw` and `tailOutput`**

In `packages/core/src/cw-routes.ts`, change the task-review import to include what this task uses:

```ts
import { buildTaskReviewState, createLimiter, resolveBase, runCommand, type Runner, type RunResult } from './task-review.js'
```

Add after `export function resolveCwBin(...) { ... }`:

```ts
const ANSI_RE = /\[[0-9;]*[A-Za-z]/g

export function tailOutput(text: string, max = 20): string {
  return text.replace(ANSI_RE, '').split('\n').map(line => line.trimEnd()).filter(line => line.length > 0).slice(-max).join('\n')
}

const CW_DONE_TIMEOUT_MS = 60_000

async function runCw(bin: string, args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, { env: envWithoutHarness(), timeout: CW_DONE_TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 })
    return { code: 0, stdout: String(stdout), stderr: String(stderr) }
  } catch (err) {
    const e = err as { code?: number | string; stdout?: string; stderr?: string; message: string }
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr || e.message }
  }
}
```

- [ ] **Step 4: Replace `/done`**

Replace the whole `app.post('/done', ...)` handler with:

```ts
  app.post('/done', async (c) => {
    const { project, task, type, sessionDir } = await c.req.json<{ project: string; task: string; type: string; sessionDir?: string }>()
    const sessionDirName = sessionDir ?? (type === 'review' ? `review-pr-${task}` : type === 'loop' ? `loop-${task}` : `task-${task}`)
    const args = type === 'review'
      ? ['review', project, task, '--done']
      : type === 'loop'
        ? ['loop', project, task, '--done']
        : ['work', project, task, '--done']

    reviewCache.delete(`${project}::${sessionDirName}`)
    // CW closes the session itself; a failed close leaves it active so nothing is lost silently
    const result = await runCw(cwBin, args)
    if (result.code === 0) return c.json({ ok: true })
    return c.json({ ok: false, error: tailOutput(`${result.stdout}\n${result.stderr}`) || 'cw --done failed' }, 500)
  })
```

- [ ] **Step 5: Move the git routes to `execFile`**

Replace the four handlers `/git/status`, `/git/log`, `/git/branch` and `/git/diff` with:

```ts
  app.get('/git/status/:project/:sessionDir', async (c) => {
    const result = loadGitSession(c.req.param('project'), c.req.param('sessionDir'))
    if ('error' in result) return c.json({ error: 'Session not found' }, 404)
    if ('empty' in result) return c.json({ output: '' })
    const status = await run('git', ['status', '--short'], result.session.worktree)
    return c.json({ output: status.code === 0 ? status.stdout : '' })
  })

  app.get('/git/log/:project/:sessionDir', async (c) => {
    const result = loadGitSession(c.req.param('project'), c.req.param('sessionDir'))
    if ('error' in result) return c.json({ error: 'Session not found' }, 404)
    if ('empty' in result) return c.json({ output: '' })
    const log = await run('git', ['log', '--oneline', '-20'], result.session.worktree)
    return c.json({ output: log.code === 0 ? log.stdout : '' })
  })

  app.get('/git/branch/:project/:sessionDir', async (c) => {
    const result = loadGitSession(c.req.param('project'), c.req.param('sessionDir'))
    if ('error' in result) return c.json({ error: 'Session not found' }, 404)
    if ('empty' in result) return c.json({ branch: '' })
    const head = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], result.session.worktree)
    return c.json({ branch: head.code === 0 ? head.stdout.trim() : '' })
  })

  app.get('/git/diff/:project/:sessionDir', async (c) => {
    const result = loadGitSession(c.req.param('project'), c.req.param('sessionDir'))
    if ('error' in result) return c.json({ error: 'Session not found' }, 404)
    if ('empty' in result) return c.json({ output: '' })
    const worktree = result.session.worktree
    // D3 without the pull request step, so this route never calls gh
    const base = await resolveBase(run, worktree, [result.session.base_branch, 'origin/HEAD', 'origin/main'])
    if (!base) return c.json({ output: '' })
    const diff = await run('git', ['diff', '--stat', base], worktree)
    return c.json({ output: diff.code === 0 ? diff.stdout : '' })
  })
```

Then check whether `execSync` is still used: `grep -n "execSync(" packages/core/src/cw-routes.ts`. If nothing matches, remove `execSync` from the `node:child_process` import. Leave `spawn`, `readFileSync` and `writeFileSync` if other handlers still use them (tsc reports nothing for unused imports in this config, so check with grep: `grep -nE "\bspawn\(|readFileSync\(|writeFileSync\(" packages/core/src/cw-routes.ts`).

- [ ] **Step 6: Run the core suite, typecheck, commit**

Run: `cd packages/core && pnpm vitest run && pnpm tsc --noEmit`
Expected: all tests PASS, tsc exit 0.

```bash
git add packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts
git commit -m "feat(core): wait for cw --done and diff tasks against their base"
```

### Task 8: Console summary, GitHub and editor buttons

**Files:**
- Modify: `packages/console/src/config/types.ts` (add `sessionDirOf`)
- Create: `packages/console/src/config/review.ts`
- Create: `packages/console/src/hooks/useTaskReview.ts`
- Create: `packages/console/src/hooks/useEditors.ts`
- Create: `packages/console/src/components/ReviewSummary.tsx`
- Modify: `packages/console/src/pages/TaskDetail.tsx`
- Modify: `packages/console/src/app.tsx` (pass `active` to `TaskDetail`)

**Interfaces:**
- Consumes: `TaskReviewState`, `CWSession` types from `@forge-dev/core` (Task 2); `GET /api/cw/review-state/...` (Task 5); `GET /api/cw/editors`, `POST /api/cw/open-in-editor` (Task 6); `showToast` from `@forge-dev/ui`.
- Produces:
  - `sessionDirOf(s: CWSession): string` (`config/types.ts`)
  - `reviewSummary(state: TaskReviewState): string`, `unpushedCount(state: TaskReviewState): number` (`config/review.ts`)
  - `type ReviewEntry = { state: TaskReviewState; error: null } | { state: null; error: string }`
  - `reviewKeyOf(s: CWSession): string`, `loadReviewState(s: CWSession, fresh?: boolean): Promise<ReviewEntry>`, `refreshReviewStates(): void`, `useTaskReview(s: CWSession, opts?: { poll?: boolean }): ReviewEntry | null` (`hooks/useTaskReview.ts`)
  - `interface EditorsResponse { enabled: boolean; editors: Array<{ id: string; label: string }> }`, `editorsInfo` signal, `loadEditors(): Promise<void>`, `openTaskInEditor(s: CWSession, editorId: string): Promise<void>` (`hooks/useEditors.ts`)
  - `ReviewSummary` component, props `{ session: CWSession; entry: ReviewEntry | null }`
  - `TaskDetail` gains prop `active: boolean`

The console has no test runner (spec §8). Verification for this task is the typecheck plus a manual check in the running app.

- [ ] **Step 1: Add `sessionDirOf`**

In `packages/console/src/config/types.ts`, right after `sessionKey`:

```ts
export const sessionDirOf = (s: CWSession): string =>
  s.sessionDir ?? (s.type === 'review' ? `review-pr-${s.pr}` : s.type === 'loop' ? `loop-${s.task}` : `task-${s.task}`)
```

- [ ] **Step 2: Add the summary helpers**

Create `packages/console/src/config/review.ts`:

```ts
import type { TaskReviewState } from '@forge-dev/core'

// commits that exist only on this machine: ahead of the upstream, or every task commit when there is none
export const unpushedCount = (s: TaskReviewState): number =>
  s.upstream ? (s.unpushed ?? 0) : (s.commits ?? 0)

const PR_STATE_LABEL = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' } as const
const CHECKS_MARK = { passing: '✓', failing: '✗', pending: '…', none: '' } as const

export function reviewSummary(s: TaskReviewState): string {
  if (s.workspace === 'missing') return 'Workspace not created yet'
  if (s.closeWarnings.includes('state-unknown') && s.branch === null) return 'Changes unknown'

  const parts: string[] = []
  if (s.diff && s.diff.files > 0) {
    parts.push(`+${s.diff.insertions} −${s.diff.deletions} · ${s.diff.files} file${s.diff.files === 1 ? '' : 's'}`)
  }
  if (s.uncommitted > 0) parts.push(`${s.uncommitted} uncommitted`)
  const unpushed = unpushedCount(s)
  if (unpushed > 0) parts.push(`${unpushed} unpushed`)
  if (s.pr.status === 'found') {
    const stateLabel = s.pr.state === 'OPEN' && s.pr.isDraft ? 'draft' : PR_STATE_LABEL[s.pr.state]
    parts.push(`PR #${s.pr.number} ${stateLabel}`)
    if (s.pr.checks !== 'none') parts.push(`checks ${CHECKS_MARK[s.pr.checks]}`)
    if (s.pr.review === 'APPROVED') parts.push('approved')
    if (s.pr.review === 'CHANGES_REQUESTED') parts.push('changes requested')
  }

  if (parts.length > 0) return parts.join(' · ')
  return s.workspace === 'ready' ? 'No changes yet' : ''
}
```

- [ ] **Step 3: Add the shared review store**

Create `packages/console/src/hooks/useTaskReview.ts`:

```ts
import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import type { CWSession, TaskReviewState } from '@forge-dev/core'
import { sessionDirOf } from '../config/types.js'

export type ReviewEntry = { state: TaskReviewState; error: null } | { state: null; error: string }

export const reviewEntries = signal<Record<string, ReviewEntry>>({})
// bumped when the task list refreshes, so mounted cards fetch again
const reviewEpoch = signal(0)

const POLL_MS = 60_000
const inFlight = new Map<string, Promise<ReviewEntry>>()

export const reviewKeyOf = (s: CWSession): string => `${s.project}::${sessionDirOf(s)}`

export function loadReviewState(session: CWSession, fresh = false): Promise<ReviewEntry> {
  const key = reviewKeyOf(session)
  const pending = inFlight.get(key)
  if (pending && !fresh) return pending

  const url = `/api/cw/review-state/${encodeURIComponent(session.project)}/${encodeURIComponent(sessionDirOf(session))}${fresh ? '?fresh=1' : ''}`
  const request: Promise<ReviewEntry> = fetch(url)
    .then(async (res): Promise<ReviewEntry> => res.ok
      ? { state: await res.json() as TaskReviewState, error: null }
      : { state: null, error: `Forge could not read this task (HTTP ${res.status})` })
    .catch((): ReviewEntry => ({ state: null, error: 'Could not reach the Forge server' }))
    .then((entry) => {
      reviewEntries.value = { ...reviewEntries.value, [key]: entry }
      if (inFlight.get(key) === request) inFlight.delete(key)
      return entry
    })
  inFlight.set(key, request)
  return request
}

export function refreshReviewStates(): void {
  reviewEpoch.value++
}

export function useTaskReview(session: CWSession, { poll = false }: { poll?: boolean } = {}): ReviewEntry | null {
  const key = reviewKeyOf(session)
  const epoch = reviewEpoch.value
  useEffect(() => {
    void loadReviewState(session)
    if (!poll) return
    const timer = setInterval(() => { void loadReviewState(session, true) }, POLL_MS)
    return () => clearInterval(timer)
  }, [key, poll, epoch])
  return reviewEntries.value[key] ?? null
}
```

- [ ] **Step 4: Add the editors store**

Create `packages/console/src/hooks/useEditors.ts`:

```ts
import { signal } from '@preact/signals'
import type { CWSession } from '@forge-dev/core'
import { sessionDirOf } from '../config/types.js'

export interface EditorsResponse { enabled: boolean; editors: Array<{ id: string; label: string }> }

export const editorsInfo = signal<EditorsResponse | null>(null)

let loading: Promise<void> | null = null

export function loadEditors(): Promise<void> {
  if (!loading) {
    loading = fetch('/api/cw/editors')
      .then(res => res.json() as Promise<EditorsResponse>)
      .then((info) => { editorsInfo.value = info })
      .catch(() => { editorsInfo.value = { enabled: false, editors: [] } })
  }
  return loading
}

export async function openTaskInEditor(session: CWSession, editorId: string): Promise<void> {
  const res = await fetch('/api/cw/open-in-editor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: session.project, sessionDir: sessionDirOf(session), editor: editorId }),
  })
  const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` })) as { ok: boolean; error?: string }
  if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not open the editor')
}
```

- [ ] **Step 5: Add `ReviewSummary`**

Create `packages/console/src/components/ReviewSummary.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import type { ReviewEntry } from '../hooks/useTaskReview.js'
import { editorsInfo, loadEditors, openTaskInEditor } from '../hooks/useEditors.js'
import { reviewSummary } from '../config/review.js'

const chipClass = 'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 transition-colors'
const chipStyle = { backgroundColor: 'var(--forge-ghost-bg)', color: 'var(--forge-text)', border: '1px solid var(--forge-ghost-border)' }

export const ReviewSummary: FunctionComponent<{ session: CWSession; entry: ReviewEntry | null }> = ({ session, entry }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { void loadEditors() }, [])

  if (!entry) return <span class="text-[11px] text-forge-muted">Checking changes…</span>
  if (entry.error !== null) return <span class="text-[11px] text-forge-muted" title={entry.error}>Changes unknown</span>

  const { state } = entry
  const summary = reviewSummary(state)
  const editors = editorsInfo.value
  const editorList = editors?.enabled ? editors.editors : []
  const showEditor = editorList.length > 0 && state.workspace === 'ready'

  const open = async (editorId: string) => {
    setMenuOpen(false)
    try {
      await openTaskInEditor(session, editorId)
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  return (
    <div class="flex items-center gap-2.5 min-w-0">
      {summary && <span class="text-[11px] text-forge-muted truncate" title={summary}>{summary}</span>}

      {state.github && (state.github.url !== null ? (
        <a class={chipClass} style={chipStyle} href={state.github.url} target="_blank" rel="noopener noreferrer">
          {state.github.label}
        </a>
      ) : (
        <button class={`${chipClass} opacity-50 cursor-not-allowed`} style={chipStyle} disabled title={state.github.reason}>
          View on GitHub
        </button>
      ))}

      {showEditor && editorList.length === 1 && (
        <button class={`${chipClass} cursor-pointer`} style={chipStyle} onClick={() => open(editorList[0].id)}>
          Open in {editorList[0].label}
        </button>
      )}

      {showEditor && editorList.length > 1 && (
        <div class="relative shrink-0">
          <button class={`${chipClass} cursor-pointer`} style={chipStyle} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            Open in editor ▾
          </button>
          {menuOpen && (
            <div class="absolute left-0 top-full mt-1 z-20 min-w-[140px] rounded-lg py-1 bg-forge-surface" style={{ border: '1px solid var(--forge-ghost-border)' }}>
              {editorList.map(editor => (
                <button key={editor.id} class="block w-full text-left px-3 py-1.5 text-xs text-forge-text hover:bg-forge-border cursor-pointer" onClick={() => open(editor.id)}>
                  {editor.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire it into `TaskDetail`**

In `packages/console/src/pages/TaskDetail.tsx`:

1. Imports — replace `import { TYPE_STYLES } from '../config/types.js'` with, and add below it:

```tsx
import { TYPE_STYLES, sessionDirOf } from '../config/types.js'
import { ReviewSummary } from '../components/ReviewSummary.js'
import { useTaskReview } from '../hooks/useTaskReview.js'
```

2. Props — add `active`:

```tsx
interface TaskDetailProps {
  session: CWSession
  active: boolean
  onClose: () => void
  onDone: () => void
}

export const TaskDetail: FunctionComponent<TaskDetailProps> = ({ session, active, onClose, onDone }) => {
```

3. Delete the `gitStatus` state line (`const [gitStatus, setGitStatus] = useState<string>('')`).

4. Replace the `sessionDir` line with:

```tsx
  const sessionDir = sessionDirOf(session)
  const review = useTaskReview(session, { poll: active && session.type === 'task' })
```

5. Replace `fetchData` with (drops the `/git/status` call the summary replaces):

```tsx
  const fetchData = async () => {
    const [toolsRes, branchRes] = await Promise.all([
      fetch(`/api/cw/tools?project=${projectEnc}`).catch(() => null),
      fetch(`/api/cw/git/branch/${projectEnc}/${sessionDirEnc}`).catch(() => null),
    ])
    if (toolsRes) setTools(await toolsRes.json() as ToolsInfo)
    if (branchRes) {
      const data = await branchRes.json() as { branch: string }
      setBranch(data.branch || session.task || session.pr || '')
    } else {
      setBranch(session.task ?? session.pr ?? '')
    }
  }
```

6. Delete the line `const filesChanged = gitStatus ? gitStatus.split('\n').filter(Boolean).length : 0`.

7. Replace the `{/* Stats */}` block with:

```tsx
          {/* Stats */}
          <div class="flex items-center gap-2.5 text-[11px] text-forge-muted min-w-0">
            {!isLogin && <ReviewSummary session={session} entry={review} />}
            <span style={{ opacity: 0.3 }}>&middot;</span>
            <span class="shrink-0">{session.opens} session{session.opens !== 1 ? 's' : ''}</span>
          </div>
```

- [ ] **Step 7: Pass `active` from `app.tsx`**

In `packages/console/src/app.tsx`, in the tabs view, the `TaskDetail` element becomes:

```tsx
                <TaskDetail
                  session={session}
                  active={isActive}
                  onClose={() => tabs.closeTab(i)}
                  onDone={() => { tabs.closeTab(i); refreshAfterAction() }}
                />
```

- [ ] **Step 8: Typecheck**

Run:

```bash
pnpm --filter @forge-dev/core build
cd packages/console && npx tsc --noEmit -p tsconfig.json
```

Expected: both exit 0.

- [ ] **Step 9: Check it in the app**

Run: `pnpm build && FORGE_NO_OPEN=1 node packages/platform/dist/index.js`, open `http://localhost:3000`, open an active task tab.
Expected: the status bar shows the summary (`No changes yet`, `Workspace not created yet`, or counts), a GitHub chip when the task's origin is GitHub and it has something to show, and `Open in VS Code` on this machine. Clicking `Open in VS Code` opens the worktree. Stop the server afterwards.

- [ ] **Step 10: Commit**

```bash
git add packages/console/src/config/types.ts packages/console/src/config/review.ts packages/console/src/hooks/useTaskReview.ts packages/console/src/hooks/useEditors.ts packages/console/src/components/ReviewSummary.tsx packages/console/src/pages/TaskDetail.tsx packages/console/src/app.tsx
git commit -m "feat(console): show a task's changes with GitHub and editor links"
```

### Task 9: Close dialog, close flow and PR chip

**Files:**
- Create: `packages/console/src/components/CloseTaskDialog.tsx`
- Modify: `packages/console/src/app.tsx` (close flow, dialog in both views, refresh review states)
- Modify: `packages/console/src/pages/TaskDetail.tsx` (Done asks the app to close)
- Modify: `packages/console/src/components/TaskCard.tsx` (PR chip; Done visible when merged)

**Interfaces:**
- Consumes: `loadReviewState`, `refreshReviewStates`, `reviewEntries`, `reviewKeyOf`, `useTaskReview`, `ReviewEntry` (Task 8); `unpushedCount` (Task 8); `POST /api/cw/done` → `{ ok: true } | { ok: false, error }` (Task 7); `Modal`, `ActionButton`, `showToast` from `@forge-dev/ui`.
- Produces:
  - `interface CloseRequest { session: CWSession; state: TaskReviewState | null; error: string | null; onClosed?: () => void }`
  - `closeWarningText(warning: CloseWarning, state: TaskReviewState | null): string`
  - `CloseTaskDialog` props `{ request: CloseRequest | null; onCancel: () => void; onConfirm: () => Promise<void> }`
  - In `app.tsx`: `requestClose(session: CWSession, onClosed?: () => void): Promise<void>` used by `TaskCard` (via `onMarkDone`) and `TaskDetail` (via `onDone`).

- [ ] **Step 1: Add the dialog**

Create `packages/console/src/components/CloseTaskDialog.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import { Modal, ActionButton } from '@forge-dev/ui'
import type { CloseWarning, CWSession, TaskReviewState } from '@forge-dev/core'
import { unpushedCount } from '../config/review.js'

export interface CloseRequest {
  session: CWSession
  state: TaskReviewState | null
  error: string | null
  onClosed?: () => void
}

export function closeWarningText(warning: CloseWarning, state: TaskReviewState | null): string {
  switch (warning) {
    case 'uncommitted': {
      const n = state?.uncommitted ?? 0
      return `${n} file${n === 1 ? ' has' : 's have'} uncommitted changes. Closing deletes them.`
    }
    case 'unpushed': {
      const n = state ? unpushedCount(state) : 0
      return `${n} commit${n === 1 ? ' is' : 's are'} not pushed. They stay on ${state?.branch ?? 'the task branch'} on this machine only.`
    }
    case 'pr-open': {
      const number = state?.pr.status === 'found' ? state.pr.number : ''
      return `PR #${number} is still open. If changes are requested, reopening starts the agent without this conversation.`
    }
    case 'state-unknown':
      return "Forge could not read this task's changes."
  }
}

export const CloseTaskDialog: FunctionComponent<{
  request: CloseRequest | null
  onCancel: () => void
  onConfirm: () => Promise<void>
}> = ({ request, onCancel, onConfirm }) => {
  if (!request) return null
  const warnings: CloseWarning[] = request.state ? request.state.closeWarnings : ['state-unknown']
  const destructive = warnings.includes('uncommitted')

  return (
    <Modal open title="Close this task?" onClose={onCancel}>
      <div class="space-y-4">
        <ul class="space-y-2 text-sm text-forge-text list-disc pl-5">
          {warnings.map(warning => <li key={warning}>{closeWarningText(warning, request.state)}</li>)}
        </ul>
        {request.error && <p class="text-xs text-forge-muted">{request.error}</p>}
        <div class="flex justify-end gap-2">
          <button
            autoFocus
            class="px-4 py-2 rounded-lg text-sm bg-forge-surface border border-forge-border hover:bg-forge-border"
            onClick={onCancel}
          >
            Cancel
          </button>
          <ActionButton label="Close task" variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} />
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Replace the close flow in `app.tsx`**

In `packages/console/src/app.tsx`:

1. Add imports:

```tsx
import { CloseTaskDialog, type CloseRequest } from './components/CloseTaskDialog.js'
import { loadReviewState, refreshReviewStates } from './hooks/useTaskReview.js'
```

2. In `fetchData`, right after `setAccounts(...)`, add:

```tsx
      refreshReviewStates()
```

3. Replace the whole `handleMarkDone` `useCallback` with:

```tsx
  const [closeRequest, setCloseRequest] = useState<CloseRequest | null>(null)

  const performClose = useCallback(async (session: CWSession, onClosed?: () => void) => {
    try {
      const res = await fetch('/api/cw/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: session.project,
          task: session.type === 'review' ? session.pr : session.task,
          type: session.type,
          sessionDir: session.sessionDir,
        }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Task closed', 'info')
        onClosed?.()
        refreshAfterAction()
      } else {
        const error = result.error ?? 'cw --done failed'
        console.error(`[forge] closing ${session.project}/${session.task ?? session.pr} failed:\n${error}`)
        showToast(error.split('\n')[0], 'error')
      }
    } catch {
      showToast('Failed to close the task', 'error')
    }
  }, [refreshAfterAction])

  // checks the task first and only asks when closing could lose work or cut a review short
  const requestClose = useCallback(async (session: CWSession, onClosed?: () => void) => {
    const entry = await loadReviewState(session, true)
    if (entry.state && entry.state.closeWarnings.length === 0) {
      await performClose(session, onClosed)
      return
    }
    setCloseRequest({ session, state: entry.state, error: entry.error, onClosed })
  }, [performClose])

  const handleMarkDone = useCallback((session: CWSession) => { void requestClose(session) }, [requestClose])

  const closeDialog = (
    <CloseTaskDialog
      request={closeRequest}
      onCancel={() => setCloseRequest(null)}
      onConfirm={async () => {
        const request = closeRequest
        setCloseRequest(null)
        if (request) await performClose(request.session, request.onClosed)
      }}
    />
  )
```

The `useState<CloseRequest | null>` line must sit with the other `useState` calls before any early return; the component has none before `// --- Render ---`, so placing it where `handleMarkDone` was is fine.

4. In the list view's `<Shell onLogoClick={handleGoToList}>`, add `{closeDialog}` as the last child, right before `</Shell>`.

5. In the tabs view, add `{closeDialog}` as the last child of `<Shell fullHeight ...>`, and change the `TaskDetail` element to:

```tsx
                <TaskDetail
                  session={session}
                  active={isActive}
                  onClose={() => tabs.closeTab(i)}
                  onDone={() => requestClose(session, () => tabs.closeTab(i))}
                />
```

- [ ] **Step 3: Make `TaskDetail`'s Done ask the app**

In `packages/console/src/pages/TaskDetail.tsx`, delete the whole `markDone` function and change the Done button to:

```tsx
            {session.status === 'active' && !isLogin && (
              <ActionButton label="Done" variant="secondary" onClick={onDone} />
            )}
```

Change the prop type so the button can await it:

```tsx
  onDone: () => void | Promise<void>
```

- [ ] **Step 4: Add the PR chip to `TaskCard`**

In `packages/console/src/components/TaskCard.tsx`:

1. Add imports:

```tsx
import { reviewEntries, reviewKeyOf, useTaskReview } from '../hooks/useTaskReview.js'
```

2. Above `/* ── Active task card ── */`, add:

```tsx
/* ── Pull request chip ── */

const PR_CHIP_STYLES = {
  OPEN: { color: 'var(--forge-success)', bg: 'var(--forge-tint-emerald-bg)' },
  DRAFT: { color: 'var(--forge-muted)', bg: 'var(--forge-ghost-bg)' },
  MERGED: { color: '#a855f7', bg: 'var(--forge-tint-purple-bg)' },
  CLOSED: { color: 'var(--forge-error)', bg: 'var(--forge-tint-rose-bg)' },
} as const

const CHECKS_MARK = { passing: ' ✓', failing: ' ✗', pending: ' …', none: '' } as const

// its own component so only task and review cards fetch review state
const PrChip: FunctionComponent<{ session: CWSession }> = ({ session }) => {
  const entry = useTaskReview(session)
  const pr = entry?.state?.pr
  if (!pr || pr.status !== 'found') return null
  const kind = pr.state === 'OPEN' && pr.isDraft ? 'DRAFT' : pr.state
  const style = PR_CHIP_STYLES[kind]
  return (
    <span
      class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
      style={{ color: style.color, backgroundColor: style.bg }}
      title={pr.url}
    >
      PR #{pr.number}{pr.state === 'MERGED' ? ' merged' : ''}{CHECKS_MARK[pr.checks]}
    </span>
  )
}
```

3. Inside `TaskCard`, before `return`, add:

```tsx
  const reviewed = session.type === 'task' || session.type === 'review'
  const reviewPr = reviewEntries.value[reviewKeyOf(session)]?.state?.pr
  const merged = reviewPr?.status === 'found' && reviewPr.state === 'MERGED'
```

4. After `<SourceLink source={session.source} url={session.source_url} />`, add:

```tsx
          {reviewed && <PrChip session={session} />}
```

5. On the Done `<button>`, replace the class string with one that stays visible when merged:

```tsx
            class={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors text-forge-muted hover:text-forge-success ${merged ? '' : 'opacity-0 group-hover:opacity-100'}`}
```

- [ ] **Step 5: Typecheck**

Run:

```bash
pnpm --filter @forge-dev/core build
cd packages/console && npx tsc --noEmit -p tsconfig.json
```

Expected: both exit 0.

- [ ] **Step 6: Check the flow in the app**

Run: `pnpm build && FORGE_NO_OPEN=1 node packages/platform/dist/index.js`, open `http://localhost:3000`. On a throwaway task (create one with `cw work <project> close-check --harness codex` so CW creates the worktree):

1. Without changes, click Done on its card → it closes straight away, toast `Task closed`.
2. Recreate it, add an untracked file in `<project>/.tasks/close-check`, click Done → the dialog lists `1 file has uncommitted changes. Closing deletes them.`, `Close task` is red, Cancel keeps the task.
3. Click `Close task` → the task closes and the worktree directory is gone.

Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add packages/console/src/components/CloseTaskDialog.tsx packages/console/src/app.tsx packages/console/src/pages/TaskDetail.tsx packages/console/src/components/TaskCard.tsx
git commit -m "feat(console): confirm before closing a task that could lose work"
```

### Task 10: Docs, install CW, verify on this machine

**Files:**
- Modify: `CHANGELOG.md` (Forge, `## Unreleased`)
- Modify: `CLAUDE.md` (Forge: key files, API endpoints)
- Modify: `docs/specs/2026-09-14-task-review-and-close.md` (status, §9 results)

**Interfaces:**
- Consumes: everything above; CW branch `feat/session-base-branch` (Task 1).
- Produces: documentation only.

- [ ] **Step 1: Update the Forge changelog**

In `CHANGELOG.md`, under `## Unreleased`, add to `### Added`:

```markdown
- A task's status bar summarises its changes — uncommitted files, unpushed commits, the diff against its base branch, and its pull request with checks and review — and links to GitHub (the pull request, or the compare page for a pushed branch).
- Open in editor for a task's worktree: VS Code, Cursor, Windsurf or Zed, when Forge runs locally.
- A pull request chip on task cards; a merged pull request keeps the card's Done button visible.
- `GET /api/cw/review-state/:project/:sessionDir`, `GET /api/cw/editors` and `POST /api/cw/open-in-editor`.
```

and to `### Changed`:

```markdown
- Done asks for confirmation when a task has uncommitted changes, unpushed commits or an open pull request, or when Forge cannot read its changes.
- `POST /api/cw/done` waits for `cw --done` and returns its error; a failed close leaves the task active. Forge no longer writes `session.json` itself.
- `/api/cw/git/diff` compares against the task's base branch instead of the last five commits, and every git route runs git without a shell.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Under `### Core` in Key Files, add after the `sandbox-manager.ts` line:

```markdown
- `packages/core/src/task-review.ts` — A task's review state: git snapshot, base branch, pull request via `gh`, GitHub link, close warnings (injected command runner)
- `packages/core/src/editors.ts` — Editor detection (PATH, macOS apps) and opening a worktree
- `packages/core/src/test-git.ts` — Fixture repositories for tests, isolated from the global git config (not built)
```

Under `### Console`, add after the `PrototypePanel.tsx` line:

```markdown
- `packages/console/src/hooks/useTaskReview.ts` — Shared review state per session; TaskDetail's active tab polls every 60 s
- `packages/console/src/components/ReviewSummary.tsx` — Change summary, View on GitHub, Open in editor
- `packages/console/src/components/CloseTaskDialog.tsx` — Confirmation before closing a task that could lose work
```

Under `### CW (/api/cw)` in API Endpoints, replace the `POST /done` line with:

```markdown
- `POST /done` — Runs `cw <work|review|loop> --done` and waits; `500 { error }` when CW fails
- `GET /review-state/:project/:sessionDir` — Changes, pull request, GitHub link and close warnings (30 s cache, `?fresh=1`)
- `GET /editors`, `POST /open-in-editor` — Detected editors and opening a worktree (local mode only)
```

In the Console Architecture tree, change the `TaskList` card line and the `TaskDetail` line to:

```
│   │   ├── TaskCard, DoneTaskRow → HarnessBadge, PrChip (components/TaskCard.tsx)
```

```
    └── TaskDetail (pages/TaskDetail.tsx) → xterm.js terminal, HarnessBadge, ReviewSummary
```

and add under `└── Skills` in the list view:

```
│   └── CloseTaskDialog (shared by TaskCard and TaskDetail Done)
```

(the previous `└── Skills` becomes `├── Skills`).

- [ ] **Step 3: Install CW from the branch**

```bash
cd ~/workspace/personal/cw
git switch feat/session-base-branch
./install.sh
cmp cw ~/.cw/bin/cw && echo installed
```

Expected: `installed`.

- [ ] **Step 4: Verify the spec's open points**

Run each and note the result:

1. A branch with `/` through `gh --head`:
   `cd ~/workspace/personal/forge && gh pr list --head docs/task-review-close-spec --state all --limit 1 --json number,headRefName`
   Expected: the spec PR if it was opened, otherwise `[]` without an error.
2. `open -a` opens a folder:
   `mkdir -p /tmp/forge-open-check && open -a "Visual Studio Code" /tmp/forge-open-check`
   Expected: VS Code opens that folder, not an empty window.
3. A new codex task's worktree is clean and records its base:
   `cw work forge base-check --harness codex` (exit the agent at once), then
   `git -C ~/workspace/personal/forge/.tasks/base-check status --porcelain` → empty (linked `TASK_NOTES.md` and `SHARED_CONTEXT.md` are excluded), and
   `python3 -c 'import json; print(json.load(open("'"$HOME"'/.cw/sessions/forge/task-base-check/session.json"))["base_branch"])'` → `origin/main`.
   Close it: `cw work forge base-check --done`.
4. A claude task's recorded `worktree` matches where the agent creates it: `cw work forge path-check`, let the agent run its setup steps, then compare the `worktree` field of `~/.cw/sessions/forge/task-path-check/session.json` with `ls -d ~/workspace/personal/forge/.tasks/path-check`. Close it with `cw work forge path-check --done`.

In `docs/specs/2026-09-14-task-review-and-close.md`, change `**Status:** draft for review` to `**Status:** implemented`, and under each bullet of §9 add one line starting `Verified:` or `Not verified:` with what the check showed.

- [ ] **Step 5: Run everything once more**

```bash
cd ~/workspace/personal/forge && pnpm test
cd packages/console && npx tsc --noEmit -p tsconfig.json
cd ~/workspace/personal/cw && ./tests/run.sh
```

Expected: Forge core tests pass (248 existing plus the new ones), console typecheck exits 0, CW suite passes.

- [ ] **Step 6: Commit**

```bash
cd ~/workspace/personal/forge
git add CHANGELOG.md CLAUDE.md docs/specs/2026-09-14-task-review-and-close.md
git commit -m "docs: document task review and close"
```

Then hand over to superpowers:finishing-a-development-branch for each repository (CW first, since Forge reads its `base_branch`).

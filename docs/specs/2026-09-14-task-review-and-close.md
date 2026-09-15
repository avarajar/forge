# Spec: review and close a task

**Status:** implemented
**Date:** 2026-09-14
**Requires:** nothing new to run. CW recording `base_branch` (section 3) makes the counts exact; `gh` adds pull request state. Both are optional (D4, D5).

## 1. Goal

A Forge user sees where a task stands — nothing done yet, uncommitted changes, unpushed commits, a pushed branch, a pull request with its checks — and opens the changes on GitHub or in a local editor.

Done becomes safe. Forge warns before closing a task that would lose work or is still under review, points out when the pull request has merged, and shows CW's error when closing fails.

Forge does not render diffs.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | No diff viewer in Forge. A task offers **View on GitHub** and **Open in editor**, and a one-line summary of its changes. |
| D2 | The server computes the task's state from git in its worktree and from `gh`, and also derives what the console shows: the GitHub link or why it is unavailable, and the warnings for closing. The console only renders. |
| D3 | The base branch, first match wins: the pull request's `baseRefName` when a pull request exists; the session's `base_branch`; `origin/HEAD`; `origin/main`. When none resolves, commit counts and the diff summary are unknown, not zero. |
| D4 | Forge works without the CW change. Sessions without `base_branch` (older CW, older sessions) use the later steps of D3. |
| D5 | `gh` is optional. When it is missing, not authenticated, or the remote is not GitHub, pull request state is `unavailable` and everything else works. |
| D6 | Done never happens automatically. A merged pull request makes the task card say so and shows its Done button without hovering. |
| D7 | Closing asks for confirmation when the task has uncommitted changes, unpushed commits, or an open pull request, or when Forge could not read its state. Otherwise it closes straight away, as today. |
| D8 | `POST /api/cw/done` waits for `cw … --done` and reports its failure. Forge no longer writes `session.json` itself; CW's `_session_close` does. A failed close leaves the session active. |
| D9 | Open in editor runs on the server and only in local mode (`localOnly`). With `FORGE_HOST` set, the button is not offered, because the editor would open on the machine running Forge. |
| D10 | Every git and `gh` call added or touched here uses `execFile` with an argument array and a timeout. The existing `/git/status`, `/git/log`, `/git/branch` and `/git/diff` routes move off `execSync` strings, and `/git/diff` compares against the base from D3 instead of `HEAD~5`. |
| D11 | The server caches each session's state for 30 s and runs at most 4 `gh` calls at once. `?fresh=1` skips the cache; the close flow always uses it. |

## 3. CW change

Repository: `~/workspace/personal/cw`.

- **Where:** `cmd_work`, the Python block under `# Save session` that writes a new `session.json`.
- **What:** pass `CW_S_BASE="$base_branch"` and write `'base_branch': e['CW_S_BASE']`. `$base_branch` is already resolved there to an `origin/`-prefixed ref: `--base`, else `origin/HEAD`, else `origin/main`.
- **Which sessions:** every new `work` session, whether CW creates the worktree (codex, pi, opencode) or the agent does (claude, whose prompt uses the same `$base_branch`). A task started from a pull request also records it; Forge prefers the pull request's base (D3).
- **Not changed:** resumed sessions keep the field they have. `review`, `loop`, `create` and `general` sessions do not get it.
- **Tests:** in `tests/work_worktree.bats`, with `make_origin_project`:
  - a plain task records `base_branch` = `origin/main`;
  - `--base develop` records `origin/develop`;
  - a claude task (agent-driven setup) records it too.
- **Docs:** a `CHANGELOG.md` entry, and `base_branch` in the `session.json` example in `docs/architecture.md`. That example also shows a `branch` field the writer no longer produces; remove it.
- **Install:** `./install.sh`, since `~/.cw/bin/cw` is a copy.

Forge adds `base_branch?: string` to `CWSession` in `packages/core/src/cw-types.ts`.

## 4. Task state

### 4.1 Type

Added to `packages/core/src/cw-types.ts`.

```ts
export type ChecksSummary = 'passing' | 'failing' | 'pending' | 'none'

export type PullRequestInfo =
  | { status: 'found'; number: number; url: string; state: 'OPEN' | 'MERGED' | 'CLOSED'; isDraft: boolean
      baseRefName: string; checks: ChecksSummary; review: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null }
  | { status: 'none' }
  | { status: 'unavailable'; reason: string }

export type CloseWarning = 'uncommitted' | 'unpushed' | 'pr-open' | 'state-unknown'

export interface TaskReviewState {
  workspace: 'ready' | 'missing' | 'none'  // none: the session type has no worktree
  branch: string | null
  base: string | null                      // e.g. "origin/main"
  uncommitted: number                      // lines of `git status --porcelain`, untracked included
  commits: number | null                   // base..HEAD; null when base is unknown
  upstream: string | null                  // e.g. "origin/fix-auth"; null when the branch has none
  unpushed: number | null                  // upstream..HEAD; null without upstream
  diff: { files: number; insertions: number; deletions: number } | null  // base to working tree
  pr: PullRequestInfo
  github: { url: string; label: 'View PR on GitHub' | 'View on GitHub' } | { url: null; reason: string } | null
  closeWarnings: CloseWarning[]
}
```

`github` is `null` when the remote is not GitHub or the session has nothing to show.

### 4.2 Reading it

`packages/core/src/task-review.ts`. Every function takes an injected runner, `(bin, args, cwd) => Promise<{ code: number; stdout: string; stderr: string }>`, so tests can use real repositories or canned output.

For a `task` session whose `worktree` directory exists (`workspace: 'ready'`):

| Field | Command in the worktree |
|---|---|
| `branch` | `git rev-parse --abbrev-ref HEAD` |
| `uncommitted` | `git status --porcelain` |
| `base` | D3; each candidate checked with `git rev-parse --verify --quiet <ref>^{commit}`; `origin/HEAD` read with `git symbolic-ref --quiet refs/remotes/origin/HEAD` |
| `commits` | `git rev-list --count <base>..HEAD` |
| `upstream` | `git rev-parse --abbrev-ref --symbolic-full-name @{u}` (non-zero exit: none) |
| `unpushed` | `git rev-list --count @{u}..HEAD` |
| `diff` | `git diff --shortstat <base>` |
| GitHub remote | `git remote get-url origin`, parsed by `parseGitHubRemote` |

Forge never runs `git fetch`. Counts reflect the last fetch; pull request state from `gh` is live.

A `task` session whose worktree directory does not exist yet (claude has not created it) is `workspace: 'missing'`: every count is `0` or `null`, `pr` is `none`, `github` is `null`, `closeWarnings` is empty.

A `review` session is `workspace: 'none'`. The remote comes from the project's path in `projects.json`, and the pull request is read by number (below). Loop, general, create and login sessions are `workspace: 'none'` with `pr: none` and `github: null`.

### 4.3 Pull request

Run in the project's path, with the harness environment untouched:

- task: `gh pr list --head <branch> --state all --limit 1 --json number,state,url,isDraft,baseRefName,reviewDecision,statusCheckRollup`; an empty array is `none`.
- review: `gh pr view <number> --json` with the same fields.

`ENOENT` → `unavailable: "gh is not installed"`. A non-zero exit → `unavailable` with the first line of stderr. A remote that is not GitHub → `unavailable: "origin is not a GitHub repository"`, without calling `gh`.

`summarizeChecks(statusCheckRollup)`:

| Result | When |
|---|---|
| `failing` | any CheckRun `conclusion` in `FAILURE`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, or StatusContext `state` in `FAILURE`, `ERROR` |
| `pending` | otherwise, any CheckRun `status` other than `COMPLETED`, or StatusContext `state` in `PENDING`, `EXPECTED` |
| `passing` | otherwise, a non-empty rollup |
| `none` | an empty rollup |

`reviewDecision` `""` becomes `null`.

### 4.4 Derived fields

`parseGitHubRemote` accepts `git@github.com:o/r(.git)`, `ssh://git@github.com/o/r(.git)` and `https://github.com/o/r(.git)`, and returns `null` for anything else.

`github`, first match wins:

| Case | Value |
|---|---|
| Remote not GitHub | `null` |
| Pull request found | `{ url: <pr url>/files, label: 'View PR on GitHub' }`; a review session uses `<pr url>` |
| Review session, pull request not read (`gh` unavailable) | `{ url: https://github.com/o/r/pull/<number>, label: 'View PR on GitHub' }` |
| Task, upstream exists, base known | `{ url: https://github.com/o/r/compare/<base without origin/>...<branch>, label: 'View on GitHub' }` |
| Task, upstream exists, base unknown | `{ url: https://github.com/o/r/tree/<branch>, label: 'View on GitHub' }` |
| Task with commits or uncommitted changes, no upstream | `{ url: null, reason: 'Push the branch first' }` |
| Anything else | `null` |

Refs and branch names in these URLs go through `encodeURIComponent`.

`closeWarnings`, in this order:

| Warning | When |
|---|---|
| `uncommitted` | `uncommitted > 0` |
| `unpushed` | `upstream` is null and `commits > 0`, or `unpushed > 0` |
| `pr-open` | `pr.status === 'found'` and `pr.state === 'OPEN'` |
| `state-unknown` | for a `ready` workspace: reading git failed, or neither the base nor an upstream resolves, so unpushed work cannot be ruled out |

## 5. Server

### 5.1 `GET /api/cw/review-state/:project/:sessionDir`

Returns `TaskReviewState`. `404` for an unknown session. Cached per `project::sessionDir` for 30 s; `?fresh=1` bypasses and refreshes the cache. At most 4 `gh` processes run at once; extra calls wait.

### 5.2 Editors

`packages/core/src/editors.ts`.

| id | Label | CLI on `PATH` | macOS app |
|---|---|---|---|
| `vscode` | VS Code | `code` | `Visual Studio Code.app` |
| `cursor` | Cursor | `cursor` | `Cursor.app` |
| `windsurf` | Windsurf | `windsurf` | `Windsurf.app` |
| `zed` | Zed | `zed` | `Zed.app` |

- `GET /api/cw/editors` → `{ enabled: boolean, editors: Array<{ id, label }> }`. `enabled` is `localOnly`; `editors` is empty when disabled. Detection runs once at server start.
- `POST /api/cw/open-in-editor` `{ project, sessionDir, editor }`:
  - `403` when not `localOnly`;
  - `400` for an editor that was not detected;
  - `404` when the session is unknown or its worktree directory does not exist;
  - otherwise spawn, detached, `<cli> <worktree>` or `open -a <App> <worktree>`, and return `{ ok: true }`.

`cwRoutes` gains a `localOnly` option, passed from `createForgeServer`.

### 5.3 `POST /api/cw/done`

- Resolve the session as today, then run `cw review|loop|work <project> <task> --done` with `execFile`, `envWithoutHarness()`, a 60 s timeout, and wait.
- Exit 0: `{ ok: true }`.
- Non-zero exit or timeout: `500` with `{ ok: false, error }`, where `error` is the last 20 lines of stdout and stderr with ANSI codes removed.
- Forge no longer writes `status` or `closed` into `session.json`.
- The cached review state for the session is dropped.

### 5.4 Git routes

`/git/status`, `/git/log` and `/git/branch` keep their responses and move to `execFile`. `/git/diff` returns `git diff --stat <base>` with the base from D3 minus the pull request step, so it never calls `gh`, and `{ output: '' }` when no base resolves.

## 6. Console

### 6.1 `hooks/useTaskReview.ts`

`useTaskReview(session, { poll })` fetches `/api/cw/review-state/…`, exposes `{ state, loading, error, refresh(fresh) }`, and keeps one in-memory entry per session key so the list and the tab share it. It fetches on mount and on `refresh()`. With `poll: true` it also refreshes every 60 s while mounted; only `TaskDetail`'s active tab passes it, so a long task list does not keep calling `gh`.

### 6.2 `components/ReviewSummary.tsx`

Replaces the `N files` stat in `TaskDetail`'s status bar.

| State | Summary text |
|---|---|
| `workspace: 'missing'` | `Workspace not created yet` |
| No changes, no pull request | `No changes yet` |
| Otherwise, joined with `·` | `+120 −34 · 5 files`, `2 uncommitted`, `1 unpushed`, `PR #41 open` / `draft` / `merged` / `closed`, `checks ✓` / `✗` / `…`, `approved` / `changes requested` |

Buttons, after the summary:

- **View on GitHub / View PR on GitHub** — an `<a target="_blank" rel="noopener noreferrer">` when `github.url` is set; a disabled button with `github.reason` as its title when `url` is null; absent when `github` is null.
- **Open in editor** — shown when `/api/cw/editors` is enabled, lists at least one editor, and `workspace` is `ready`. One editor: a button named after it. More: a button with a menu. A failure shows a toast with the server's error.

### 6.3 `components/CloseTaskDialog.tsx`

Used by `TaskDetail`'s Done and `TaskCard`'s Done, through one `closeTask(session)` flow in `app.tsx`:

1. Fetch the review state with `fresh=1`.
2. If `closeWarnings` is empty, `POST /api/cw/done`.
3. Otherwise open the dialog. Title: **Close this task?** One line per warning:
   - `uncommitted`: *N files have uncommitted changes. Closing deletes them.*
   - `unpushed`: *N commits are not pushed. They stay on `<branch>` on this machine only.*
   - `pr-open`: *PR #N is still open. If changes are requested, reopening starts the agent without this conversation.*
   - `state-unknown`: *Forge could not read this task's changes.*
   - Buttons: **Cancel**, which has focus, and **Close task**, styled as danger when `uncommitted` is present.
4. If fetching the state itself fails, open the dialog with the `state-unknown` line and the fetch error.
5. After `POST /api/cw/done`: on `ok`, today's toast and refresh. On failure, an error toast with the first line of `error`, the full text in the console log, and the tab stays open.

### 6.4 `TaskCard`

- A pull request chip after `SourceLink`: `PR #41`, colored by state, with the checks mark.
- `MERGED`: the chip reads `PR #41 merged`, and the Done button is visible without hovering.
- Cards fetch through `useTaskReview` without `poll`, only for active `task` and `review` sessions, on mount and when the list refreshes.

## 7. Errors

| Case | Behavior |
|---|---|
| `git` not on `PATH` or a command times out | `closeWarnings: ['state-unknown']`; the summary reads `Changes unknown` |
| No base resolves | `commits` and `diff` null; the summary omits them; `github` falls back to the no-upstream rules |
| `gh` missing or not authenticated | `pr: unavailable`; no chip; the summary omits pull request parts |
| Editor spawn fails | `500 { ok: false, error }`, shown as a toast |
| `cw --done` fails | Section 5.3; the session stays active |
| A remote Forge (`FORGE_HOST`) | No Open in editor; GitHub links still work, since they open in the viewer's browser |

## 8. Testing

Core, Vitest:

- `task-review.test.ts`, on real repositories in `mkdtemp` directories with a local bare `origin`:
  - no changes;
  - uncommitted only, untracked included;
  - commits without upstream;
  - pushed with unpushed commits;
  - fully pushed;
  - base from `base_branch`, from a pull request's `baseRefName`, from `origin/HEAD`, from `origin/main`, and unresolved;
  - a missing worktree directory;
  - `github` and `closeWarnings` for each case.
- `parseGitHubRemote`: the three GitHub forms with and without `.git`, a GitLab URL, and an empty string.
- `summarizeChecks`: each row of 4.3, mixing CheckRun and StatusContext entries.
- Pull request reading through the injected runner: found, empty array, `ENOENT`, non-zero exit.
- `editors.test.ts`: detection with injected lookups, and `open-in-editor` returning `403` when not `localOnly`.
- `cw-routes.test.ts`:
  - `review-state` returns `404` for an unknown session, and `workspace: 'none'` for a loop;
  - `done` waits for the fake `cw` script the suite already writes to `TEST_CW/bin/cw`; a variant that exits 1 makes it return the output. The existing loop `done` test stops expecting Forge to write `session.json` (D8).

CW, bats: section 3.

The console has no test runner. Logic the console would otherwise hold lives in the server's derived fields (D2), so it is covered above.

## 9. Verify during implementation

- `gh pr list --head <branch>` with a branch containing `/`, such as `task/fix-auth`.
  Verified: no PR found (returned `[]`).
- `open -a "Visual Studio Code" <dir>` opens the folder, not a new empty window.
  Not verified: needs a person at the machine (deferred at the end of implementation).
- A claude task's `worktree` path in `session.json` matches where the agent creates it (`<project>/.tasks/<task>`).
  Not verified: needs a person at the machine (deferred at the end of implementation).
- `git status --porcelain` in a worktree ignores the linked `TASK_NOTES.md` and `SHARED_CONTEXT.md` (CW adds them to `info/exclude`).
  Not verified: needs a person at the machine (deferred at the end of implementation).

## 10. Out of scope

- A Create PR button. On a branch without a pull request, View on GitHub opens the compare page, where GitHub offers to create one.
- The blocked-agent notice and sessions that survive a Forge restart. Each gets its own spec.
- Hosts other than GitHub.
- Rendering diffs in Forge.

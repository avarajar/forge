# Spec: harness-aware sessions in Forge

**Status:** draft for review
**Date:** 2026-09-12
**Brief:** `docs/plans/2026-09-11-harness-integration-brief.md`
**Mockup:** `docs/specs/harness-picker.html`, sections 1–6
**Requires:** CW 0.3.0 (`~/.cw/bin/cw version` prints `cw 0.3.0` on this machine)

## 1. Goal

A Forge user picks the harness for a task, sees which harness each session runs on, and
connects each account to each harness without typing a command.

The work is additive. When `cw doctor --json` is unavailable (CW older than 0.3.0, or the call
fails), Forge behaves exactly as it does today: no selector, no harness sent, Claude Code only.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | Harness selector below Account. It preselects the resolved default: the project's `harness` in `projects.json`, else the account's `default_harness`, else `claude`. | Brief 1, mockup §2, review |
| D2 | When doctor is available, every **new** session carries the effective harness. A resumed session never does. | Brief 1–2 |
| D3 | New vs. resume is decided in `pty-routes.ts`: a session taken from `pendingSessions` is new, one read from disk is a resume. | Review |
| D4 | `CW_HARNESS` is removed from the environment of every `cw` Forge spawns. Only a new General session sets it. | Brief 2 |
| D5 | Forge carries the capability table itself, because `cw doctor --json` does not expose capabilities. UI and server gate on capabilities, never on harness names. An unknown harness (a user driver) has no capabilities. | Review |
| D6 | Loop is Claude Code only, enforced in the form and in `POST /api/cw/start`. | Brief 1, review |
| D7 | Model: claude keeps today's pills; other harnesses get free text prefilled with the account's model. General on a non-claude harness shows no Model field. | Brief 1, 3 |
| D8 | Skip permissions is hidden when the harness lacks `skip_permissions`. | Review |
| D9 | One endpoint, `GET /api/cw/harnesses`. The server shares one in-flight doctor call; the console keeps one shared store and polls no faster than every 3 s, only while a Connect is in progress. | Brief 4, review |
| D10 | An Accounts screen replaces `CreateAccountModal.tsx`. Creating an account no longer opens a session. | Brief 4, review |
| D11 | Codex Connect runs in a hidden PTY owned by a small `LoginManager`, separate from `PTYManager`. The Accounts screen reads its state over HTTP. | Brief 4 |
| D12 | The API key goes to `cw` through a piped stdin, never through a PTY, which would echo it. | Brief 4 |
| D13 | Connect for claude, pi and opencode opens a tab running a new Forge-only session type, `login`. | Brief 4 |
| D14 | `HARNESS_STYLES` sits next to `TYPE_STYLES` in `config/types.ts`, with the mockup's palette. | Review |
| D15 | Harness filter pills sit next to the type pills. The account and project selects stay. | Review |
| D16 | A non-blocking notice in the form when a Linear or Notion ticket goes to a harness without MCP and CW has no token. | Brief 6 |
| D17 | A notice on the Accounts screen when Forge is not opened on localhost. | Brief 7 |
| D18 | Forge drops the Plan task type. It was unused and launched `cw work` anyway, so the brief's Plan row does not apply. | Review |

D11 departs from the earlier suggestion to reuse `PTYManager`. `PTYManager` streams output to
WebSocket clients attached to tabs; a device login needs parsed state that the Accounts screen
polls and that never appears as a tab.

## 3. CW contract as TypeScript

Added to `packages/core/src/cw-types.ts`.

```ts
export type HarnessStatus = 'connected' | 'not_logged_in' | 'not_installed' | 'local' | 'error'
export type ProviderKind = 'native' | 'api' | 'local'

export interface CWDoctorHarness {
  name: string
  installed: boolean
  path: string | null
  version: string | null
  source: 'builtin' | 'user'
}

export interface CWLocalDetail {
  endpoint: string
  reachable: boolean
  model_pulled: boolean
}

export interface CWDoctorCell {
  harness: string
  status: HarnessStatus
  detail: null | string | CWLocalDetail
  config_env: string
  config_dir: string
  provider: string
  provider_kind: ProviderKind
  model: string | null
  unofficial: boolean
  has_api_key: boolean
}

export interface CWDoctorAccount {
  name: string
  root: string
  layout: 'split' | 'legacy' | 'none'
  default_harness: string
  harnesses: CWDoctorCell[]
}

export interface CWDoctorFinding {
  code: string
  message: string
  count?: number
}

export interface CWDoctor {
  schema: 1
  cw_version: string
  cw_home: string
  generated: string
  harnesses: CWDoctorHarness[]
  accounts: CWDoctorAccount[]
  issues: CWDoctorFinding[]
  warnings: CWDoctorFinding[]
}
```

Captured on 2026-09-12 from CW 0.3.0 against a scratch `CW_HOME` holding a `work` account
(claude) and a `personal` account (codex): every field above was present. Two observations:

- `config_env` can hold two names separated by a newline (opencode:
  `OPENCODE_DATA_DIR\nOPENCODE_CONFIG`). Forge does not display it.
- `layout`, `root` and `config_dir` are not displayed. `layout` describes claude only.

`CWSession` gains three optional fields, and its `type` union gains `'login'` (Forge-only, never
on disk):

```ts
harness?: string
harness_session_id?: string
provider?: string
```

`CWProject` gains `harness?: string`.

`CWReader.getSpaces` and `getSession` fill `harness ??= 'claude'` and `provider ??= 'native'` on
read, so a pre-0.3.0 session shows as Claude Code. Forge never writes these fields; `/done` and
`/move-project` keep round-tripping the whole object.

Forge keeps reading `session.json` directly and does not use `cw spaces --json`, which omits
loop sessions.

`packages/core/src/__fixtures__/cw-0.3.0/doctor-two-accounts.json` holds that capture with paths
scrubbed. Tests write session files inline: one shaped like a real pre-0.3.0 `session.json`, one
with the 0.3.0 fields. A `local` cell has no fixture until one can be captured (§9).

## 4. Capabilities in Forge

`packages/core/src/harness-capabilities.ts`, copied from the brief's table:

```ts
export type Capability =
  | 'skip_permissions' | 'agent_teams' | 'slash_commands' | 'mcp'
  | 'headless_login' | 'api_key_login' | 'custom_provider' | 'model_flag'
  | 'resume_by_name' | 'continue_last'

export const HARNESS_CAPABILITIES: Record<string, readonly Capability[]> = {
  claude: ['skip_permissions', 'agent_teams', 'slash_commands', 'mcp', 'model_flag', 'resume_by_name', 'continue_last'],
  codex: ['headless_login', 'api_key_login', 'custom_provider', 'model_flag', 'continue_last'],
  pi: ['model_flag'],
  opencode: ['custom_provider', 'model_flag'],
}

export function supports(harness: string | undefined, cap: Capability): boolean
```

An undefined harness means `claude`. An unknown harness supports nothing.

## 5. Server

### 5.1 `GET /api/cw/harnesses`

```ts
type HarnessesResponse =
  | {
      available: true
      doctor: CWDoctor
      capabilities: Record<string, Capability[]>
      contextTokens: { linear: boolean; notion: boolean }
    }
  | { available: false; reason: string }
```

- `packages/core/src/cw-doctor.ts` runs `execFile(cwBin, ['doctor', '--json'])` with a 15 s
  timeout and an environment without `CW_HARNESS`.
- A non-zero exit, `ENOENT`, a timeout, invalid JSON or `schema !== 1` returns
  `available: false` with the reason.
- Concurrent requests share one in-flight call. A result is reused for 2 s; `?fresh=1` skips the
  cache but still joins an in-flight call.
- `capabilities` maps each harness in `doctor.harnesses` to `HARNESS_CAPABILITIES[name] ?? []`.
- `contextTokens.linear` is true when `LINEAR_API_KEY` is non-empty in Forge's environment or
  `<cwHome>/tokens.env` has a line matching `^\s*(export\s+)?LINEAR_API_KEY\s*=\s*\S`. Same rule
  for `NOTION_TOKEN`. Only booleans leave the server.

### 5.2 `POST /api/cw/start`

The body gains `harness?: string`.

- `harness` must match `^[a-z0-9][a-z0-9_-]{0,31}$`, else 400 `Invalid harness`.
- For `type: 'loop'`, a `harness` other than `claude` returns 400
  `Loop runs on Claude Code only`.
- Every pending session stores `harness` (task, review, loop, create, general).
- New `type: 'login'` requires an existing `account` and a `harness`. It stores
  `{ project: '__accounts', type: 'login', account, harness, sessionDir: 'login-<account>-<harness>', worktree: '' }`
  and returns it. No 409: reopening the same key reattaches the running PTY.

### 5.3 `pty-routes.ts`

```ts
const pending = pendingSessions.get(sessionId)
const session = pending ?? reader.getSession(project, sessionDir)
manager.getOrCreate(project, sessionDir, session, { isNew: pending !== undefined })
```

### 5.4 Building the launch

`buildCommand` becomes an exported pure function,
`buildLaunch(session, isNew): { command: string; env: Record<string, string> }`, and `getOrCreate`
spawns with the returned `env`.

- `env` is a copy of `process.env` without `CW_HARNESS`.
- `h = session.harness ?? 'claude'`. The flag ` --harness <h>` is appended only when `isNew` and
  `session.harness` is set.

| Type | Launch |
|---|---|
| task, review | Today's command, plus the flag |
| loop | Today's command, plus the flag |
| create | Today's command, plus the flag. `--team` only when `supports(h, 'agent_teams')` |
| general | `cw launch <account>`. When new with a harness, `env.CW_HARNESS = h`. `--model` and `--dangerously-skip-permissions` only when `h === 'claude'` |
| login | `cw account login <account> --harness <h>`, cwd `$HOME` |

A General session has no `session.json`, so it is always new on its first connection.

### 5.5 Accounts

**`POST /api/cw/accounts`** takes `{ name, harness?, provider?, model? }` and runs
`cw account add <name> [--harness h] [--provider p] [--model m]`.

- `harness`: same pattern as 5.2.
- `provider`: `^[a-z0-9][a-z0-9_.-]{0,63}$`, and only with a harness that supports
  `custom_provider`, else 400 `<harness> cannot use a provider`.
- `model`: `^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$` (covers `qwen/qwen3-coder:free`).
- A non-zero exit returns 500 with the first line of stderr.

**`POST /api/cw/accounts/:name/login`** takes `{ harness }`. It requires an existing account and
`supports(harness, 'headless_login')`, else 400. It starts a device login, or returns the one
already running for that account and harness.

**`GET /api/cw/accounts/:name/login/:harness`** returns the login state, or 404.
**`DELETE /api/cw/accounts/:name/login/:harness`** kills it.

**`POST /api/cw/accounts/:name/api-key`** takes `{ harness, apiKey }`.

- Requires `supports(harness, 'api_key_login')`, else 400.
- `apiKey` is non-empty, has no newline and is at most 4096 characters.
- Runs `spawn(cwBin, ['account', 'login', name, '--harness', harness, '--with-api-key', '-'])`
  with piped stdio, writes `apiKey + '\n'`, closes stdin, and waits up to 60 s.
- Exit 0 returns `{ ok: true }`. Otherwise 500 with the output, every occurrence of the key
  replaced by `***`.
- The key is never logged, stored, or placed in argv.

`packages/core/src/login-manager.ts`:

```ts
interface LoginState {
  account: string
  harness: string
  status: 'running' | 'exited'
  url: string | null
  code: string | null
  exitCode: number | null
  output: string[]
  startedAt: string
}
```

- Spawns `cwBin` with node-pty and an args array (no shell), cwd `$HOME`, environment without
  `CW_HARNESS`: `account login <name> --harness <h> --no-browser`.
- Output is stripped of ANSI sequences and `\r`, split into lines, last 50 kept in `output`.
- The first `^CW_LOGIN_URL=(https?://\S+)$` sets `url`; a URL with any other scheme is ignored.
  The first `^CW_LOGIN_CODE=([A-Za-z0-9-]{4,64})$` sets `code`.
- On exit, `status` becomes `exited` and the state is kept for 5 minutes.
- A login still running after 15 minutes is killed.
- One login per account and harness. `dispose()` is called wherever `PTYManager.dispose()` is.

## 6. Console

### 6.1 `hooks/useHarnesses.ts`

- Module-level signals hold the latest `HarnessesResponse`.
- `loadHarnesses(fresh?)` deduplicates concurrent loads.
- `watchUntil(check, { timeoutMs = 600_000 })` polls `?fresh=1` every 3 s until `check(doctor)`
  is true, the timeout passes, or the returned `stop()` is called. All watchers share one timer.

### 6.2 `config/types.ts`

- `HARNESS_STYLES`: `claude` Claude Code, `codex` Codex, `pi` Pi, `opencode` OpenCode. Colors
  come from new `--forge-harness-<h>` and `--forge-harness-<h>-bg` variables in `theme.css`,
  light and dark, with the mockup's values (light `#c9633f` `#0f8f6f` `#2f6fe0` `#c98a12`, dark
  `#e08a68` `#2fbf97` `#6b9bff` `#e8b44a`). An unknown harness gets a neutral style labelled
  with its raw name.
- `harnessLabel(session)`: the label, or `Label · <model ?? provider>` when `provider` is set
  and is not `native`.
- `CLAUDE_MODELS`: today's `MODELS`, moved out of `NewTask.tsx`.
- `resolveHarness(project, account, projects, doctor)`: the rule in D1.
- `TYPE_STYLES.login` (neutral) and `sessionLabel` for login: `Login: <account> · <Harness>`.

### 6.3 New Task (mockup §1)

The Harness block renders only when the response is `available`; otherwise the body carries no
`harness`.

One pill per `doctor.harnesses` entry, described by the selected account's cell:

| Condition | Pill |
|---|---|
| `not_installed` | Disabled, with `detail` |
| Type is Loop and the harness is not claude | Disabled, "Loop uses Claude Code's /loop" |
| `not_logged_in` | Enabled, "not logged in · Connect", which opens the Accounts screen |
| `error` | Enabled, with `detail` |
| Otherwise | The version from `doctor.harnesses`, or "account default" when it is the resolved default |

- The selection is the resolved default on mount and whenever the account or project changes.
  A click overrides it until then. Switching to Loop selects claude.
- If the selected harness is disabled, Start is disabled and says why.
- Skip permissions renders only with `skip_permissions`; switching away resets it to false.
- Model: claude shows `CLAUDE_MODELS`. Other harnesses show a text input prefilled with the
  account cell's `model`. General on a non-claude harness shows no Model and sends none.
- Notice, non-blocking: the task is a `linear.app` URL, the harness lacks `mcp`, and
  `contextTokens.linear` is false: "<Harness> has no MCP and CW has no LINEAR_API_KEY, so the
  ticket will not reach TASK_NOTES.md. The task still starts, without the ticket." Same for
  `notion.so` / `notion.site` with `NOTION_TOKEN`.
- The footer names the harness instead of "Claude".
- Capabilities come from the response. The console does not import core runtime code.

### 6.4 Badges and filter (mockup §4)

- `HarnessBadge` in `components/TaskCard.tsx`: on `TaskCard` before the time, muted on
  `DoneTaskRow`, and after the type badge in the `TaskDetail` status bar.
- `useTaskFilters` gains `filterHarness`. `TaskList` shows one pill per harness present in the
  sessions, after the type pills, hidden when fewer than two harnesses are present. Clear filters
  resets it.

### 6.5 Accounts screen (mockup §6)

- `pages/Accounts.tsx`, reached through a new `listView` value `'accounts'`. The "+ Account"
  button in `TaskList` becomes "Accounts". `CreateAccountModal.tsx` is deleted.
- When the response is unavailable, the screen shows the reason, a Retry button, and an Add
  account form with the name only, so older CW keeps today's capability.
- Doctor `issues` and `warnings` are listed above the matrix.
- The remote notice shows when `window.location.hostname` is not `localhost`, `127.0.0.1` or
  `::1`.
- Rows are `doctor.accounts`; columns are `doctor.harnesses`. The row label reads
  `default: <Harness>`, with the provider when the default cell is not native.

Cell rendering, first match wins:

| Cell | Shows |
|---|---|
| Connect in progress | "Connecting…" and Cancel |
| `not_installed` | "Not installed" and `detail` |
| `error` | "Error" and `detail` |
| `local` | "Local", `provider · model`, reachability and pull status from `detail` |
| `connected` with `provider_kind: 'api'` or `has_api_key` | "API key", and `provider · model` when not native |
| `connected` | "Connected" |
| `not_logged_in` | Connect button |

A cell with `unofficial: true` also shows an "unofficial" tag.

Connect:

- **Harness with `headless_login`** (codex): `POST …/login`, then a panel below the matrix with
  "Open login" (`target="_blank" rel="noopener noreferrer"`), the code with Copy, and the output
  collapsed. The panel polls `GET …/login/:harness` every 3 s while `watchUntil` waits for the
  cell to be `connected`. An exit before that shows the output and Retry. On success it calls
  `DELETE`, which ends the process if it is still running.
- **Harness with `api_key_login`** (codex): the same panel has a password input; Save posts to
  `…/api-key`, then refreshes and watches.
- **Any other harness**: `POST /api/cw/start` with `type: 'login'` and open the tab. Opening a
  tab unmounts the Accounts screen, and returning to it runs a fresh doctor call, so this path
  needs no watcher.

Add account: name (`ACCOUNT_NAME_RE`), harness pills, and provider and model inputs shown only
for a harness with `custom_provider`. A hint says the default harness cannot be changed later.
After creation it refreshes; it opens no tab.

### 6.6 `TaskDetail`

- Shows `HarnessBadge`.
- For `type: 'login'`: no Done button, and no git or tools requests.

## 7. Errors

| Situation | Forge |
|---|---|
| CW refuses a launch (harness mismatch, loop, unknown harness, provider) | The message shows in the terminal, as today. Forge's rules avoid the known cases |
| Doctor unavailable | No selector; Accounts shows the reason and Retry |
| Device login exits without a URL or code | Output tail and Retry |
| API key rejected | Redacted output |
| Harness from a user driver | Neutral style, no capabilities, Connect through the visible terminal |

## 8. Testing

Vitest in `packages/core`. The console has no test setup today, and adding one is out of scope.
Tests use temp directories next to the package, as `cw-routes.test.ts` does, and a fake `cw`
script at `<temp CW_HOME>/bin/cw`, which `cwRoutes` already prefers. No test runs the real `cw`
or touches `~/.cw` or `~/.forge`.

| Unit | Tests |
|---|---|
| `cw-reader` | Legacy session reads as claude/native; codex fixture fields preserved |
| `harness-capabilities` | Table matches the brief; unknown harness supports nothing; undefined means claude |
| `cw-doctor` | Parses the captured fixture; `schema` 2, non-zero exit, invalid JSON and ENOENT are unavailable; concurrent calls run one process; 2 s cache; `CW_HARNESS` absent from the child env |
| `GET /harnesses` | Capabilities mapping; tokens from env and from `tokens.env`; token values never in the body |
| `POST /start` | `harness` stored per type; invalid harness 400; loop with codex 400, with claude 200; login session shape; login with an unknown account 400 |
| `buildLaunch` | Each type × claude/codex × new/resume: flag only when new; General sets `CW_HARNESS` and drops Claude-only flags for codex; `--team` only for claude; inherited `CW_HARNESS` removed; quoting unchanged |
| `pty-routes` | Pending session connects with `isNew: true`, disk session with `false` |
| `POST /accounts` | Args for harness, provider, model; provider on claude 400; invalid model 400 |
| `login-manager` | Fake `cw` printing ANSI-coloured lines: URL and code parsed, `javascript:` URL ignored, last 50 lines kept, exit state, 15-minute kill with fake timers, one process per account and harness |
| `POST …/api-key` | Fake `cw` records stdin and argv: key only on stdin, redacted on failure; harness without `api_key_login` 400 |

The brief's acceptance criteria are walked manually with real sessions at the end.

## 9. Verify during implementation

- The exact `CW_LOGIN_URL` / `CW_LOGIN_CODE` lines codex prints through `cw account login
  --no-browser`, and whether the login needs a TTY or would work over pipes.
  Verified through a PTY: CW prints both lines and the login completed from the Accounts screen.
  CW truncates the code — codex printed a nine-character code and `CW_LOGIN_CODE` carried
  eight (gap 9). Pipes were not tried.
- Whether a `done` task restarted from Forge with `--harness` is refused when its `session.json`
  records a different harness. Not verified.
- `cw account login <acct> --harness claude` inside Forge's embedded terminal reaches a usable
  login screen. Verified: the tab showed Claude Code's onboarding screen. The login was not
  completed; opening it was enough for doctor to report the cell as connected (gap 10).
- OpenCode's own API-provider login works in the embedded terminal. Not verified: OpenCode is not
  installed.
- The `detail` object of a `local` cell, which could not be captured without an Ollama-backed
  account. Not verified: no Ollama-backed account.
- What CW older than 0.3.0 does with `cw doctor --json` (expected: unavailable). Not verified:
  only CW 0.3.0 is installed.
- `cw account add --provider` on codex and opencode produces the cell doctor then reports.
  Partly verified: `cw account add <name> --harness codex` without a provider produced a
  `not_logged_in` codex cell that turned `connected` after the device login. The provider path
  was not tried.
- `codex resume --last` scoping, before relying on resume across tabs (brief gap 7). Partly
  verified: reopening a codex task from Forge resumed codex in the task's own worktree with no
  `--harness`. Resume from the shared project root was not tried.

## 10. CW gaps to file

The brief's gaps 1–7, plus:

8. `cw doctor --json` does not expose per-harness capabilities, so Forge copies the table.
9. `cw account login … --no-browser` truncates the device code in `CW_LOGIN_CODE`: codex printed
   a nine-character code and CW emitted eight, so the code Forge shows is rejected. The full code
   is still visible in the panel's Output.
10. `cw doctor --json` reports claude `connected` for an account whose login was never completed:
    opening Claude Code in the account's config directory writes `.claude.json`, and doctor treats
    that file as authentication. The account's `layout` also changes from `none` to `legacy`.

## 11. Out of scope

The module SDK and plugin ecosystem, team mode, CW bash work, `cw spaces --json`, changing an
account's default harness, model lists for non-claude harnesses, and a console test setup.

Implementation follows the brief's step order: types and reader, New Task and `/start`, badges
and filter, Accounts, the Linear and Notion notice, docs.

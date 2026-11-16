# Today Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bundled SDK v1 module, mod-today, that reads the user's Linear and Slack once a day through headless Claude, sorts each item against open CW tasks, auto-starts research and proposes the rest from a banner on the task list.

**Architecture:** Core gains a headless session start, a send-to-session path and a headless agent runner, exposed to modules through SDK 1.1.0 (`cw` and `agent` permissions, `ctx.cw`, `ctx.sessions.send`, `ctx.agent`) and a new `view.banner` entry the console renders above the start card. mod-today is a module built on those: a 5-minute job, pure digest logic, item actions, a banner and a Today page.

**Tech Stack:** TypeScript strict, Hono, node-pty, Preact + `@forge-dev/ui`, esbuild (module build), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-today-module-design.md`

## Global Constraints

- SDK version becomes `1.1.0` (`packages/sdk/src/define.ts` `SDK_VERSION` and `packages/sdk/package.json`); mod-today declares `"sdk": "^1.1.0"`.
- Nothing mod-today does publishes to a third party: every action is `effect: 'local'`; the reader's allowlist holds only read tools.
- Module id `today`, folder `modules/mod-today`, npm name `@forge-dev/mod-today`.
- Settings defaults: `time` `08:00`, `autoResearch` true, `maxAuto` 3, `model` `claude-sonnet-5-5`.
- `ctx.sessions.send` types only into Claude Code sessions; other harnesses answer `unsupported`.
- Banner switch default: on for bundled modules, off for installed ones.
- One-line comments only; English for code, docs and commits; spawn with args arrays, never shell strings (the existing `buildLaunch` is the only `-c` command and stays as is).
- Update `CHANGELOG.md` (Unreleased) and CLAUDE.md key files/endpoints for each user-visible slice.

## Review Focus

1. Reader returns non-JSON, truncated JSON or items with unknown `kind` → the reading is marked failed, yesterday's digest stays, no session starts. (Task 4 `parseReaderOutput rejects…`, Task 5 `readNow on reader failure…`)
2. Same Slack thread or Linear issue seen on two consecutive days → not proposed twice unless its `when` is newer. (Task 4 test `dedupe keeps only newer activity`)
3. More research items than `maxAuto`, or the job re-running the same day after a Forge restart → total auto-starts per day never exceed `maxAuto`. (Task 5 test `auto research respects the daily cap across runs`)
4. Send to a session whose PTY died overnight and never reaches `waiting` → `send` gives up after the timeout and the item stays a proposal with an error, the text is never typed into a wrong screen. (Task 2 test `send resumes and gives up when the session never waits`)
5. A headless session nobody opens → not killed by idle cleanup while running; killed normally once a client attached and left. (Task 1 test `headless session survives cleanup until a client leaves`)

---

### Task 1: Headless session start in core

**Files:**
- Create: `packages/core/src/cw-start.ts`
- Modify: `packages/core/src/cw-routes.ts:348-611` (route body moves to `prepareStart`), `packages/core/src/pty-manager.ts` (`headless` option, cleanup), `packages/core/src/pty-routes.ts` (export `takeSession` unchanged)
- Test: `packages/core/src/cw-start.test.ts`, `packages/core/src/pty-manager.test.ts`

**Interfaces:**
- Produces:
  - `type StartInput` = the JSON body `POST /api/cw/start` accepts today (move its type here).
  - `prepareStart(input: StartInput, deps: { reader: CWReader }): Promise<{ ok: true; session: CWSession; key: string; command: string } | { ok: false; status: 400 | 409 | 500; error: string }>` — exactly what the route did up to and including `pendingSessions.set`.
  - `launchHeadless(project: string, sessionDir: string, deps: { reader: CWReader; manager: PTYManager; general: GeneralSessions }): PTYSession | null` — `takeSession` then `manager.getOrCreate(project, sessionDir, session, { isNew, headless: true })`.
  - `PTYManager.getOrCreate(..., options: { isNew?: boolean; headless?: boolean })`; `PTYSession.headless: boolean`.

- [ ] **Step 1: Failing tests.** In `cw-start.test.ts`: `prepareStart with a Linear URL returns session task ABC-123 and source linear` and `prepareStart without project answers 400`. In `pty-manager.test.ts`: `headless session survives cleanup until a client leaves` — create with `headless: true`, advance `createdAt` 31 min, `cleanup()`, expect `has(key)`; attach + detach a client, advance `lastClientDisconnect` 31 min, `cleanup()`, expect `!has(key)`.
- [ ] **Step 2: Run** `pnpm --filter @forge-dev/core exec vitest run src/cw-start.test.ts src/pty-manager.test.ts` → FAIL (module not found / survives assertion).
- [ ] **Step 3: Implement.** Move the route body into `prepareStart` verbatim; the route becomes `const r = await prepareStart(body, { reader }); return r.ok ? c.json({ ok: true, session: r.session, command: r.command }) : c.json({ ok: false, error: r.error }, r.status)`. In `cleanup()`, skip the "never connected" branch when `session.headless`.
- [ ] **Step 4: Run** the two files plus `src/cw-routes.test.ts` → PASS (existing start tests unchanged prove the move).
- [ ] **Step 5: Commit** `refactor: start sessions through prepareStart and launch them headless`.

### Task 1b: General sessions survive a reload

The server keeps general sessions in `<dataDir>/general-sessions.json`, but `GET /api/cw/spaces` returns only sessions with a `session.json`, so the console's tab restore (`useTabManager.ts:25-41`, matches keys against `spaces`) drops every general tab on reload and they never appear in the task list.

**Files:**
- Modify: `packages/core/src/general-sessions.ts` (`list()`), `packages/core/src/cw-routes.ts:115-118` (`/spaces` merges them), `packages/core/src/server.ts` (pass `generalSessions` to `cwRoutes`)
- Test: `packages/core/src/general-sessions.test.ts`, `packages/core/src/cw-routes.test.ts`

**Interfaces:**
- Produces: `GeneralSessions.list(project?: string): CWSession[]`; `cwRoutes` option `general?: GeneralSessions`; `/spaces` returns CW sessions plus general ones (filtered by `?project=`), sorted by `last_opened` like today.

- [ ] **Step 1: Failing tests.** `list returns remembered sessions and drops expired ones`; `GET /spaces includes a remembered general session`; `GET /spaces?project=x includes only x's general sessions`; `a killed general session is gone from /spaces` (after `POST /terminal/kill`).
- [ ] **Step 2: Run** `pnpm --filter @forge-dev/core exec vitest run src/general-sessions.test.ts src/cw-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement**; general rows render in their project card through the existing `sessionLabel` (`config/types.ts:111`), no console change unless the type check or a manual reload shows one is needed.
- [ ] **Step 4: Verify** core tests pass; build, start a general session, reload the browser: the tab comes back and the row shows in its project.
- [ ] **Step 5: Commit** `fix: general sessions come back after a reload`; CHANGELOG line under Fixed.

### Task 2: SDK 1.1.0 — `cw` and `agent` permissions and context

**Files:**
- Modify: `packages/sdk/src/types.ts` (`ModulePermissions`, `ForgeContext`, new types), `packages/sdk/forge-module.schema.json:67-95`, `packages/sdk/src/define.ts:6`, `packages/sdk/package.json`, `packages/core/src/module-manifest.ts:19,55-62`, `packages/core/src/module-permissions.ts:10-23`, `packages/core/src/module-context.ts`, `packages/core/src/module-install.ts:61-73`
- Create: `packages/core/src/module-cw.ts`, `packages/core/src/agent-runner.ts`
- Modify: `packages/core/src/server.ts:134` (pass `cw`, `agent` deps)
- Test: `packages/core/src/module-context.test.ts`, `packages/core/src/module-cw.test.ts`, `packages/core/src/agent-runner.test.ts`, `packages/core/src/module-manifest.test.ts`

**Interfaces:**
- Consumes: Task 1 `prepareStart`, `launchHeadless`.
- Produces (SDK, exported from `@forge-dev/sdk`):
  - `ModulePermissions.cw?: ('start' | 'send')[]`, `ModulePermissions.agent?: boolean`
  - `interface CwStartInput { type: 'work' | 'general'; project?: string; task: string; directory?: string; account?: string; harness?: string }`
  - `type SendResult = 'typed' | 'resumed' | 'unsupported' | 'unavailable'`
  - `interface AgentRunInput { account: string; prompt: string; model?: string; allowedTools: string[]; timeoutMs?: number }`
  - `interface AgentRunResult { text: string; costUsd?: number; turns?: number }`
  - `ForgeContext.cw: { start(input: CwStartInput): Promise<{ project: string; sessionDir: string }> }`
  - `ForgeContext.sessions.send(project: string, sessionDir: string, text: string): Promise<SendResult>`
  - `ForgeContext.agent: { run(input: AgentRunInput): Promise<AgentRunResult> }`
- Produces (core): `ContextDeps.cw?: { start(i: CwStartInput): Promise<{ project: string; sessionDir: string }>; send(p: string, s: string, t: string): Promise<SendResult> }`, `ContextDeps.agent?: { run(i: AgentRunInput): Promise<AgentRunResult> }`; `createCwDeps(o: { reader; manager; states: StateTracker | null; general; waitMs?: number }): NonNullable<ContextDeps['cw']>`; `runAgent(input: AgentRunInput, o: { cwHome: string; spawn?: typeof spawn }): Promise<AgentRunResult>`.

- [ ] **Step 1: Failing tests.**
  - `module-manifest.test.ts`: `accepts cw ["start","send"] and agent true`; `rejects cw ["delete"]`.
  - `module-context.test.ts`: `cw.start without the cw start grant throws PermissionError and records the denial`; `sessions.send without the send grant is denied`; `agent.run without agent is denied`; with grants, the calls reach stub deps with the same arguments.
  - `module-cw.test.ts` (stub manager/states): `send types into a live claude session` → `'typed'`; `send to a codex session is unsupported`; `send resumes a dead session and types once it waits` → `'resumed'`, `typeLine` called after state `waiting`; `send resumes and gives up when the session never waits` → with `waitMs: 50` rejects `ModuleError('unreachable', …)` and `typeLine` never called; `start general runs prepareStart then launchHeadless`.
  - `agent-runner.test.ts` (fake spawn): spawns `claude` with args `['-p', prompt, '--model', m, '--allowedTools', tools.join(','), '--output-format', 'json']`, env `CLAUDE_CONFIG_DIR=<cwHome>/accounts/<account>` and no `CW_HARNESS`; returns `{ text: result, costUsd: total_cost_usd, turns: num_turns }`; `rejects an unknown account`; `rejects non-JSON stdout`; `kills the child after timeoutMs`.
- [ ] **Step 2: Run** `pnpm --filter @forge-dev/core exec vitest run src/module-manifest.test.ts src/module-context.test.ts src/module-cw.test.ts src/agent-runner.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Schema: `cw` array of enum `start|send`, `agent` boolean. `Grants` gains `cw: Set<'start'|'send'>`, `agent: boolean`. Context denies with `deny('cw', 'start')`, `deny('cw', 'send')`, `deny('agent', account)`; missing dep throws "not available" like `pty`. `createCwDeps.send`: harness not claude → `unsupported`; `manager.typeLine` true → `typed`; else `reader.getSession` + `manager.getOrCreate(..., { isNew: false, headless: true })`, poll `states.snapshot()[key]?.state === 'waiting'` every 500 ms up to `waitMs` (default 90 000), then `typeLine` → `resumed`; no session file → `unavailable`. `runAgent` uses `envWithoutHarness()` plus `CLAUDE_CONFIG_DIR`, default `timeoutMs` 180 000. Install preview lines: `cw` → the listed verbs, `agent` → `yes`. Bump SDK to 1.1.0. Wire `cw: createCwDeps({...})`, `agent: { run: i => runAgent(i, { cwHome: cwReader.cwHome }) }` in `server.ts`.
- [ ] **Step 4: Run** the four files, then `pnpm --filter @forge-dev/core test` and `pnpm --filter @forge-dev/sdk test` → PASS.
- [ ] **Step 5: Docs + commit.** Add `cw`/`agent` rows to `docs/module-authoring.md` §3 and the `ctx` list in §4; run `pnpm --filter @forge-dev/sdk reference`. Commit `feat(sdk): cw and agent permissions for modules`.

### Task 3: `view.banner` and the per-module switch

**Files:**
- Modify: `packages/sdk/src/types.ts:114,135`, `packages/sdk/forge-module.schema.json:51-56`, `packages/core/src/module-host.ts:11,245-248`, `packages/core/src/module-routes.ts:106-114`, `packages/core/src/module-install.ts`, `packages/console/src/pages/ModuleView.tsx:75-87`, `packages/console/src/config/moduleClient.ts`, `packages/console/src/pages/TaskList.tsx:137-138`, `packages/console/src/components/ModuleSettings.tsx`, `packages/console/src/components/AddModule.tsx:94`
- Create: `packages/console/src/components/ModuleBanners.tsx`
- Test: `packages/core/src/module-host.test.ts`, `packages/core/src/module-routes.test.ts`, fixture `packages/core/test/fixtures/modules/with-banner/`

**Interfaces:**
- Produces:
  - Manifest `view.banner?: string` (`ModuleManifest.view.banner`).
  - `ModuleStatus.banner?: { url: string; version: number; enabled: boolean }`.
  - `GET /api/modules/:id/banner.js`; `PUT /api/modules/:id/banner` body `{ enabled: boolean }` → the module's status. Persisted in `<dataDir>/module-banners.json` as `{ [id]: boolean }`; missing → `origin === 'bundled'`.
  - Console `importPanel(url: string, version: number): Promise<PanelComponent>` in `config/moduleClient.ts` (moved out of ModuleView).
  - `ModuleBanners` renders every module with `banner.enabled`, each in its own error boundary, with `createPanelClient`.

- [ ] **Step 1: Failing tests.** `module-host.test.ts`: `status carries banner url for a manifest with view.banner`; `banner is enabled by default only for bundled modules`; `setBanner persists across a new host`. `module-routes.test.ts`: `GET banner.js serves the entry`; `PUT banner toggles enabled`; `banner.js is a reserved route segment`.
- [ ] **Step 2: Run** `pnpm --filter @forge-dev/core exec vitest run src/module-host.test.ts src/module-routes.test.ts` → FAIL.
- [ ] **Step 3: Implement** host `setBanner(id: string, enabled: boolean): void`, route, schema, status field; console: extract `importPanel`, add `<ModuleBanners />` above `<StartCard>` in TaskList, a "Show on task list" switch in ModuleSettings when `status.banner` exists, and "Adds a banner to the task list" in the AddModule preview when the previewed manifest has `view.banner`.
- [ ] **Step 4: Run** core tests, `npx tsc --noEmit -p packages/console`, `pnpm --filter @forge-dev/console build` → PASS.
- [ ] **Step 5: Docs + commit.** `module-authoring.md` §6 gets a "Banner" paragraph; CLAUDE.md endpoints list. Commit `feat(modules): banner views on the task list`.

### Task 4: mod-today scaffold and digest logic

**Files:**
- Create: `modules/mod-today/{package.json,forge-module.json,build.mjs,tsconfig.json}` (copied from `packages/cli/templates/module`, `__SDK__`/`__UI__` → `workspace:*`), `modules/mod-today/src/digest.ts`, `modules/mod-today/src/prompt.ts`
- Test: `modules/mod-today/src/digest.test.ts`, `modules/mod-today/src/prompt.test.ts`

**Interfaces:**
- Produces (`digest.ts`):
  - `type Kind = 'to-task' | 'issue' | 'request' | 'research'`
  - `interface Item { id: string; source: 'linear' | 'slack'; kind: Kind; title: string; who: string; where: string; when: string; quote?: string; link: string; issueKey?: string; targetSession?: { project: string; sessionDir: string }; project?: string; state: 'proposed' | 'done' | 'dismissed' | 'failed'; startedSession?: { project: string; sessionDir: string }; error?: string }`
  - `interface Digest { date: string; readAt: string; since: string; items: Item[]; error?: string; autoStarted: number }`
  - `parseReaderOutput(text: string, known: { projects: string[]; sessions: string[] }): Item[]` — extracts the JSON object, validates every field, drops a `project`/`targetSession` that is not known, throws `Error` on anything invalid.
  - `itemId(source: string, link: string): string`
  - `dedupe(items: Item[], handled: Record<string, string>): Item[]` — `handled` maps id → last `when` seen.
  - `shouldRead(now: Date, time: string, lastReadAt?: string): boolean` — true when no reading today and local time ≥ `time`, or no reading ever.
  - `pendingCount(d: Digest): number`
- Produces (`prompt.ts`): `buildPrompt(o: { since: string; sessions: SessionInfo[]; projects: string[] }): string` and `READER_TOOLS: string[]` (the read-only Slack and Linear tool names from the spike: `slack_search_public_and_private`, `slack_read_thread`, `slack_read_user_profile`, `list_issues`, `get_issue`, `list_comments`, `whoami`, prefixed `mcp__claude_ai_Slack__` / `mcp__claude_ai_Linear__`). The prompt asks for detailed Slack results with permalinks (or channel + ts), all Linear pages, and strict JSON matching `Item` without `state`.

- [ ] **Step 1: Failing tests.** `parseReaderOutput accepts the four kinds with links`; `parseReaderOutput rejects non-JSON, truncated JSON and an unknown kind`; `parseReaderOutput drops an unknown project and session`; `dedupe keeps only newer activity`; `shouldRead before 08:00 is false, after is true, false once read today`; `buildPrompt lists open sessions and the since window`; `READER_TOOLS holds no write tool` (no name matches `send|create|save|update|delete|schedule`).
- [ ] **Step 2: Run** `pnpm --filter @forge-dev/mod-today test` → FAIL.
- [ ] **Step 3: Implement** the functions above.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(mod-today): digest parsing, dedupe and reader prompt`.

### Task 5: mod-today server — job, actions, routes

**Files:**
- Create: `modules/mod-today/src/server.ts`, `modules/mod-today/src/run.ts`
- Modify: `modules/mod-today/forge-module.json` (settings, permissions `agent: true`, `cw: ["start","send"]`)
- Test: `modules/mod-today/src/run.test.ts`

**Interfaces:**
- Consumes: Task 2 `ctx.agent.run`, `ctx.cw.start`, `ctx.sessions.send`; Task 4 functions.
- Produces:
  - `readNow(ctx: ForgeContext, now: Date): Promise<Digest>` — runs the reader, parses, dedupes, saves `digest/<date>`, `lastReadAt`, `handled`, auto-researches, sets `badge('today', pendingCount)`. On failure saves the previous digest with `error` and rethrows nothing.
  - `applyItem(ctx: ForgeContext, date: string, id: string, op: 'send' | 'start' | 'research' | 'dismiss', project?: string): Promise<Item>`
  - Storage keys: `digest/<yyyy-mm-dd>`, `lastReadAt`, `handled`, `folded/<yyyy-mm-dd>`.
  - Actions (all `effect: 'local'`): `refresh`, `send`, `start`, `research`, `dismiss`, `accept-all` (input `{ date, id, project? }` or `{ date }`), `fold` (`{ date, folded: boolean }`).
  - Routes: `GET /digest` → `{ digest: Digest | null; folded: boolean; lastError?: string }` (today, else latest); `GET /digest/:date`; `GET /days` → dates with a digest, newest first, max 14.
  - Job `read` every `5m`: `if (shouldRead(new Date(), settings.time, lastReadAt)) await readNow(ctx, new Date())`.
- Op mapping: `send` → `sessions.send(target, "[Today] <who> in <where>: <quote or title> — <link>")`, `unsupported` keeps the item proposed with "open the task"; `start` issue → `cw.start({ type: 'work', project, task: link })`; `start` request → `cw.start({ type: 'work', project, task: '<title>\n\nFrom <who> in <where>: <link>' })`; `research` → `cw.start({ type: 'general', directory: researchProject dir or home, task: '<title> — find out and leave the answer in the session. Context: <quote> <link>' })`. A `request`/`issue` with no `project` refuses `start` with `ModuleError('bad_request', 'pick a project')`.

- [ ] **Step 1: Failing tests** (stub `ctx` cast to `ForgeContext`, in-memory storage): `readNow saves the digest and the badge`; `readNow on reader failure keeps the previous digest with error and starts nothing`; `auto research respects the daily cap across runs` (5 research items, `maxAuto` 3, two `readNow` calls same day → `cw.start` called 3 times total); `autoResearch false starts nothing`; `send to a codex session stays proposed`; `start without project is refused`; `accept-all applies every proposed item that has what it needs and skips the rest`.
- [ ] **Step 2: Run** `pnpm --filter @forge-dev/mod-today test` → FAIL.
- [ ] **Step 3: Implement** `run.ts` (logic) and `server.ts` (`defineModule` wiring only).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(mod-today): daily reading, auto research and item actions`.

### Task 6: mod-today banner and Today page

**Files:**
- Create: `modules/mod-today/src/banner.tsx`, `modules/mod-today/src/view.tsx`, `modules/mod-today/src/rows.tsx` (shared row, source icons, kind pill)
- Modify: `modules/mod-today/build.mjs` (third entry `banner`), `modules/mod-today/forge-module.json` (`view: { entry: './dist/view.js', title: 'Today', banner: './dist/banner.js' }`)

**Interfaces:**
- Consumes: Task 5 routes and actions through `forge.route` / `forge.action`; Task 3 banner slot.
- Produces: `Row({ item, onAct })`, `SourceIcon({ source })`, `KindPill({ kind })` in `rows.tsx`.

- [ ] **Step 1: Build the banner** to the approved mockup (`.superpowers/brainstorm/*/content/franja-v2.html`): header with greeting, reading time and window; count pills; one `Row` per item with source icon, author, where, when, quote, "View in Linear/Slack ↗" link, kind pill and its button (Send / Start / Open session, project picker when `project` is missing); "Accept all" and "Fold". Folded state: one line `☀︎ Today · N started · N researching · N sent   See all →`. Hidden when the digest has no items. Theme tokens only (`var(--card)`, `var(--ink-2)`…), polls `GET /digest` every 60 s.
- [ ] **Step 2: Build the page**: rows grouped In open tasks / New / Researching / Dismissed, a day picker from `/days`, last reading time and error, "Read now" (`refresh`).
- [ ] **Step 3: Verify** `pnpm --filter @forge-dev/mod-today build && pnpm --filter @forge-dev/mod-today test`, then `pnpm build && FORGE_NO_OPEN=1 node packages/platform/dist/index.js` and check in the browser: banner above the start card, fold persists across reload, Today page lists the same items. Capture a screenshot.
- [ ] **Step 4: Commit** `feat(mod-today): banner and Today page`.

### Task 7: Bundle, pack and document

**Files:**
- Modify: `packages/core/src/modules.ts:6` (add `BUNDLED_V1_MODULES = ['mod-today']`, the legacy loader keeps `BUNDLED_MODULES`), `packages/core/src/module-host.ts:179` (candidates read both lists), `packages/platform/scripts/pack.mjs:41-47`, `packages/desktop/scripts/pack.mjs:52-54` (copy `forge-module.json`, `package.json` and `dist/` for v1 bundled modules), `CHANGELOG.md`, `CLAUDE.md` (monorepo list, key files, SDK 1.1.0)
- Test: `packages/core/src/module-host.test.ts`

- [ ] **Step 1: Failing test** `bundled v1 module loads from bundledDir and the legacy loader ignores it`.
- [ ] **Step 2: Run** `pnpm --filter @forge-dev/core exec vitest run src/module-host.test.ts` → FAIL.
- [ ] **Step 3: Implement** the list and both packers.
- [ ] **Step 4: Verify** `pnpm test`; `cd packages/platform && pnpm pack`, then `tar tzf forge-cw-*.tgz | grep mod-today` lists `forge-module.json`, `package.json`, `dist/server.js`, `dist/view.js`, `dist/banner.js`.
- [ ] **Step 5: Commit** `feat(mod-today): bundle with forge-cw and the desktop app`.

---

## Addendum tasks (spec section "Addendum: GitHub source and refresh on demand")

### Task 8: Refresh on demand

**Files:** `modules/mod-today/src/banner.tsx`, `modules/mod-today/src/rows.tsx` (shared bits), `modules/mod-today/src/run.ts` only if refresh needs a change, tests in `modules/mod-today/src/run.test.ts`.

- [ ] **Step 1:** Banner header and the folded line get a Refresh button calling the `refresh` action, disabled while any action or reading runs (shared acting state), then reload the digest.
- [ ] **Step 2:** Replace the hidden state: with no items (or no digest yet), render the minimal line `☀︎ Today · nothing new since <time of last reading> · Refresh` (`Not read yet · Refresh` before the first reading).
- [ ] **Step 3:** Test `refresh reads only what is new since the last reading and merges into today` in run.test.ts if not already covered (second readNow same day with one new item → digest has old + new, old states kept).
- [ ] **Step 4:** Build, test, browser check of the three banner states, commit `feat(mod-today): refresh on demand`; CHANGELOG line.

### Task 9: GitHub source

**Files:** `packages/sdk/src/types.ts` (`CwStartInput.type` adds `'review'`, `SessionInfo.taskUrl?: string`), `packages/core/src/module-cw.ts` + `module-context.ts` (pass review through to prepareStart; fill `taskUrl` from the session's source URL), `modules/mod-today/forge-module.json` (`shell: ["gh"]`), new `modules/mod-today/src/github.ts`, `modules/mod-today/src/{digest.ts,prompt.ts,run.ts,ops.ts,rows.tsx}`, tests next to each, docs (`module-authoring.md` cw row, CHANGELOG, CLAUDE.md).

**Interfaces:**
- `fetchGithub(ctx: ForgeContext, since: string): Promise<{ items: GithubEvent[]; error?: string }>` in github.ts; `GithubEvent = { type: 'comment' | 'review' | 'review-request' | 'mention' | 'assigned' | 'ci-failure'; repo: string; number: number; title: string; url: string; who?: string; when: string; text?: string; headRef?: string; checks?: string[] }`. Uses only `ctx.shell.exec('gh', [...])`, read-only commands, JSON output; `gh` missing/unauthenticated → `{ items: [], error }`.
- `buildPrompt` gains `github: GithubEvent[]` and the rules from the spec addendum; `Kind` adds `'review'`; `source` adds `'github'`; `opFor` maps `review` → `start` with `cw.start({ type: 'review', project, task: url })`.

- [ ] **Step 1: Failing tests.** github.test.ts with a stub `ctx.shell.exec` returning canned `gh` JSON: `maps review requests, comments, reviews, mentions, assigned issues and failing checks since a time`; `gh missing gives an error and no items`; `only read-only gh commands are run` (no `pr merge|comment|review|edit|close`, no `api -X POST|PATCH|DELETE`). digest.test.ts: `accepts source github and kind review`. run.test.ts: `a review item starts cw review with the PR url`; `a github failure does not fail the reading and is noted`. module-cw test: `start review passes through to prepareStart`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; rows show a GitHub icon and "View on GitHub ↗"; the review kind pill reads "Review".
- [ ] **Step 4:** `pnpm test`, `pnpm build`, commit `feat(mod-today): GitHub comments, reviews, mentions and CI failures`.

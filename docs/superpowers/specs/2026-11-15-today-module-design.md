# Today module (mod-today) — design

## Intent

Every morning the user's work arrives scattered across Linear and Slack. They want Forge to gather it once a day, sort
each item against the CW tasks already running, and either feed it to the task that owns it or start the work, so that
opening Forge shows what today holds and part of it is already moving.

## Goals

1. Once a day, read the user's Linear issues and Slack threads, mentions and direct messages since the last reading.
2. Sort each item into one of four kinds:
   1. **to-task**: belongs to an open CW task → send the news to that session.
   2. **issue**: a Linear issue with no task → start `cw work <issue url>`.
   3. **request**: a concrete Slack request with no issue → start a task with the request text and the thread link.
   4. **research**: something general or to find out → start a general session with the question and context.
3. Mixed automation: kind 4 starts on its own (capped per day); kinds 1–3 wait as proposals with a button each and an
   "Accept all".
4. Show it on opening Forge as a banner at the top of the task list (above the start card), plus a sidebar badge and a
   full "Today" page.
5. Every item names its source and links to it: Linear or Slack, who wrote it, where (issue comment, `#channel`, DM),
   when, a short quote, and a link to the original.

## Non-goals

- Creating Linear issues or replying in Slack. Nothing is published to a third party.
- Sources beyond Linear and Slack in this version (Notion, GitHub, email come later through the same reader prompt).
- Team mode (modules with a server do not load there).
- Running while Forge is closed.

## Anti-goals

- Typing into a live agent's terminal without the user's click.
- A busy Slack day burning the usage limit: automatic sessions are capped.
- A banner that pushes the task list down all day.

## Constraints found

- Forge has no Slack credential; the user's claude.ai connectors (Slack, Linear) exist only inside Claude Code.
  Spike (2026-11-15): `CLAUDE_CONFIG_DIR=~/.cw/accounts/monoku claude -p --model claude-sonnet-5-5 … --allowedTools
  <slack/linear read tools> --output-format json` read 5 Slack mentions/DMs and 5 Linear issues in 13 s, 6 turns,
  ~$0.31 equivalent. Slack's concise search returns no permalinks: the prompt must ask for the detailed format or
  channel + ts so the module can build links. Linear's `list_issues` paginates.
- SDK v1 `ForgeContext` can list sessions but cannot start a CW task or type into a session, and a module's view only
  renders on its own page (`pages/ModuleView.tsx`).
- `PTYManager.typeLine` already types a line into a live Claude Code session (used by Kioku's Remember… and
  `/terminal/command`); `POST /api/cw/start` already parses Linear URLs into `task-ABC-123`.
- Bundled modules today ship only a legacy manifest (`BUNDLED_MODULES = ['mod-qa']`, `pack.mjs` copies the manifest);
  a bundled v1 module with `dist/server.js` and `dist/view.js` is new for packaging.

## Approaches

1. **Module plus SDK extension (chosen).** mod-today is a real v1 module (job, reader, classification, storage, Today
   page). The SDK gains three general capabilities other modules can use: `ctx.cw.start`, `ctx.sessions.send` and a
   `view.banner` entry rendered on the task list. Keeps the module boundary and grows the platform; most work.
2. Native Forge feature (`daily.ts`, `/api/daily`, a console banner). Fastest, full access, but not a module and the
   SDK gains nothing.
3. Module without SDK changes, calling Forge's own API over localhost and a hard-coded console banner. Rejected: a
   back door around permissions and a console tied to one module.

The user picked 1.

## Design

### SDK additions (`packages/sdk`, minor version 1.1.0)

- Permission `cw`: `["start", "send"]` (either or both). Checked by `module-context.ts` like the others.
- `ctx.cw.start({ type: 'work' | 'general', project?, task, directory?, account?, harness? }) → { project, sessionDir }`
  registers the session like `POST /api/cw/start` (shared function extracted from `cw-routes.ts`, no HTTP hop) **and
  spawns its PTY on the server with no client attached** (today the PTY only spawns when the console's terminal
  WebSocket connects). A headless PTY is not idle-cleaned until its process exits or a client attaches and later
  leaves; general sessions keep going through `general-sessions.json` so a restart relaunches them. Account and harness
  default to what the start card would use for that project (CW defaults). *(Builder's call: the conversation agreed
  research should already be done when the user arrives, which requires a real headless start.)*
- `ctx.sessions.send(project, sessionDir, text) → { delivered: 'typed' | 'resumed' | 'unsupported' }` uses
  `PTYManager.typeLine` when the PTY is live; when it is not, it relaunches the session headlessly (same path as
  start, CW resumes the session) and types the text once the harness is ready (state `waiting`). Claude Code sessions
  only for now (same rule as `/terminal/command`); other harnesses answer `unsupported` and the item stays a proposal
  with "Open task" instead of "Send". *(Agreed in the conversation: a closed session is reopened and given the message.)*
- Permission `agent: true` and `ctx.agent.run({ account, prompt, model?, allowedTools, timeoutMs? }) → { text, costUsd?,
  turns }`: runs `claude -p … --output-format json` under the account's config dir (core sets `CLAUDE_CONFIG_DIR`, the
  module never passes env). Narrower than adding `env` to `shell.exec`, which could redirect any tool. *(Builder's
  call.)*
- Manifest `view.banner: "./dist/banner.js"`: a second view entry, a `definePanel` component rendered by the console at
  the top of `TaskList` inside an error boundary. Banners stack in module order. A module's banner is listed in the
  install preview next to its permissions, and every module with one gets a "Show on task list" switch in its settings
  drawer (on by default for bundled modules, off for installed ones). *(Builder's call.)*
- `forge-module.schema.json`, `sdk-reference.md` and `module-authoring.md` updated.

### mod-today (`modules/mod-today`, id `today`, bundled)

- **Settings**: `account` (CW account for the reader, default the first Claude one), `time` (HH:MM, default `08:00`),
  `autoResearch` (boolean, default true), `maxAuto` (number, default 3), `researchProject` (cw-project, folder for
  general sessions; empty → home), `model` (enum, default Sonnet).
- **Permissions**: `agent: true`, `cw: ["start", "send"]`.
- **Job** `read`, every 5 min: runs when today's reading has not happened and local time ≥ `time`, or on load when the
  day has none. Also a `refresh` action (`local`) for the banner's reload button.
- **Reader**: `ctx.agent.run({ account, prompt, model, allowedTools: <read-only Slack and Linear tools> })`. The prompt carries the window
  (since the last reading), the open sessions (`ctx.sessions.list()` with task, project, task URL) and the projects,
  and asks for a strict JSON list: `{ id, source: 'linear'|'slack', kind: 1–4, title, who, where, when, quote, link,
  issueKey?, targetSession?, project? }`. The module validates it; invalid output marks the reading failed and keeps
  yesterday's digest.
- **Dedup**: storage keeps item ids already handled (source + link); an item seen before is not proposed again unless
  it has newer activity.
- **Project for kinds 2 and 3**: the reader proposes one from the registered projects; when it gives none or an unknown
  one, the row shows a project picker before "Start" and the item is never auto-started. *(Builder's call.)*
- **Actions per item**: `send` (kind 1), `start` (kinds 2, 3), `research` (kind 4), `dismiss`, and `accept-all`. All
  `local` (nothing leaves the machine). Auto-research runs `research` for kind 4 up to `maxAuto`; the rest stay
  proposals.
- **Storage**: `folded/<yyyy-mm-dd>` (server-side, so the desktop app and a browser agree), `digest/<yyyy-mm-dd>` (items with state proposed | done | dismissed | failed and the session they
  started), `lastReadAt`, `handled`.
- **Notifications**: `badge('today', pendingCount)`.
- **Routes**: `GET /digest` (today's, or the latest), `GET /digest/:date`.

### Banner (`dist/banner.js`)

Three states: full (pending items: greeting, reading time and window, count pills, one row per item with source icon,
author, where, when, quote, link, kind and button, "Accept all", "Fold"); folded one line (`☀︎ Today · 2 started · 1
researching · 1 sent  See all →`) once resolved or folded, reopened only by new items; hidden on days with nothing.
Mockup: `.superpowers/brainstorm/*/content/franja-v2.html` (A, version 2), uses theme tokens.

### Today page (`dist/view.js`)

The same rows grouped by kind (in open tasks, new, researching), past days, last reading status and error, and a "Read
now" button.

### Packaging

`BUNDLED_MODULES` gains `mod-today`; `pack.mjs` copies its manifest and `dist/`. The module builds with esbuild like the
scaffold.

## Left to the builder

- Exact prompt wording and the tool allowlist names.
- How the reading's failure is shown (banner line vs. page only).
- Banner animation and layout details within the mockup.

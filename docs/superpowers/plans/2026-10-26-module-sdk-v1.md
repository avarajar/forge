# Module SDK v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@forge-dev/sdk` 1.0.0 with runtime-loaded modules (server half in Forge's process, one sidebar view per module) and prove it with mod-harvey in its own repo.

**Architecture:** A new `ModuleHost` in core discovers v1 modules, validates manifests, imports `server.js`, and serves everything through one dispatcher at `/api/modules/:id/*`; a `ForgeContext` checks the manifest's templated permissions on every call. The console loads each module's `view.js` with dynamic `import()` against an import map of shared packages, inside an error boundary. Legacy manifests keep going through today's `ModuleLoader` and `/api/actions`.

**Tech Stack:** TypeScript strict ESM, Hono, node:sqlite, Preact + signals, Vite, Vitest, esbuild (module builds), `semver`.

**Spec:** `docs/superpowers/specs/2026-10-26-module-sdk-v1-design.md`

## Global Constraints

- SDK version `1.0.0`; modules declare `"sdk": "^1.0.0"`; incompatible → disabled "needs SDK <range>, Forge has 1.0.0".
- Module `id` matches `^[a-z][a-z0-9-]{1,31}$`.
- Reserved route segments under `/api/modules/<id>/`: `settings`, `actions`, `view.js`, `status`, `notifications`, `reload`.
- Confirmation tokens: single-use, 120 s, bound to module + action + input hash.
- Job `every` minimum `30s`; event handler timeout 10 s.
- Console polls: notifications 5 s (15 s hidden), modules 10 s + on focus.
- Shell is always `spawn(command, args)`, never `sh -c` with built strings.
- Tests never touch the real `~/.forge` or `~/.cw`: temp dirs only.
- v1 modules with `server` or `view` are disabled in team mode ("modules run only in local mode").
- No secrets in settings or DB; Harvey's token is read per call and never stored or returned.
- Comments: one short line, no task or PR references. Commits: `feat(scope):`, `test:`, `docs:`, no Claude attribution, GPG-signed (never disable signing).
- `npm publish` is never run by the agent.

## Review Focus

1. A setting path with a symlink or `..` that escapes its grant → `PermissionError` (Task 3 test `rejects a path that escapes through a symlink`).
2. Harvey writes a new draft between Approve all's confirm and run → the new draft is never approved (Task 13 test `approve-all skips drafts not in the plan`).
3. A module reloaded by `dev` while its job is running → the old run is aborted and only the new job schedules (Task 6 test `reload aborts the running job and schedules once`).
4. Settings saved with an empty `instances` list → grants drop to none and the watch job stops, no widened permission (Task 2 test `drops a grant whose template resolves to nothing`, Task 6 test `job not scheduled when enabled() is false`).
5. Module view imported twice across a version bump while the old view is mounted → old one unmounts cleanly, no duplicate Preact (Task 8 manual check plus `ModuleView` test `re-imports on version change`).

---

## File map

Core (`packages/core/src/`):
- `module-manifest.ts` — schema validation, semver check, legacy detection. Test alongside.
- `module-permissions.ts` — template expansion, grant matching (origins, realpath paths, executables).
- `module-context.ts` — builds `ForgeContext` per module; `PermissionError` paths.
- `module-host.ts` — discovery order, import, status table, unload/reload, dev module registry.
- `module-routes.ts` — dispatcher, settings, actions + prepare + stream, notifications, view.js, rescan, dev.
- `module-confirmations.ts` — token store.
- `module-jobs.ts` — scheduler; `module-events.ts` — bus.
- `module-install.ts` — manifest preview and npm args for the CLI.
- `db.ts`, `db-interface.ts`, `db-postgres.ts` — new tables and methods.
- `server.ts`, `cw-routes.ts`, `pty-manager.ts` — wiring and event emission.
- `test/fixtures/modules/*` — fixture modules (Task 4).

SDK (`packages/sdk/`): `src/types.ts`, `src/define.ts`, `src/errors.ts`, `src/index.ts`, `forge-module.schema.json`.

Console (`packages/console/`): `vite.config.ts`, `vite.shared.config.ts`, `index.html`, `src/hooks/useModules.ts`, `src/hooks/useModuleNotifications.ts`, `src/pages/ModuleView.tsx`, `src/components/ModuleSettings.tsx`, `src/components/ConfirmAction.tsx`, `src/config/moduleClient.ts`, `Sidebar.tsx`, `app.tsx`, `state/notifications.ts`.

CLI (`packages/cli/src/commands/module.ts`, `packages/cli/templates/module/*`).

mod-harvey: `~/workspace/personal/forge-mod-harvey/` (own git repo).

---

### Task 1: SDK 1.0.0 surface and manifest schema

**Files:**
- Modify: `packages/sdk/src/types.ts`, `packages/sdk/src/define.ts`, `packages/sdk/src/index.ts`, `packages/sdk/package.json` (version `1.0.0`, `exports` for `.` and `./forge-module.schema.json`, `files`)
- Create: `packages/sdk/src/errors.ts`, `packages/sdk/forge-module.schema.json`, `packages/sdk/src/define.test.ts`, `packages/sdk/vitest.config.ts` (add `"test": "vitest run"` script)

**Interfaces:**
- Produces: every type and helper in the spec's "SDK surface", `ForgeContext`, `PanelClient`, `ModuleSettings = Record<string, unknown>`, `ModuleStatus`, `ForgeEvents` map (six events, payloads per spec), `ForgeEventName = keyof ForgeEvents`, `SettingDef` (union of `string|number|boolean|enum|list` defs), `ModuleManifestV1`, `LegacyManifest` (today's `ModuleManifest`, renamed; keep `ModuleManifest` as an alias of `LegacyManifest` so mod-qa and core compile), `LegacyActionDef` (today's `ActionDef`; the v1 one takes the name `ActionDef`).
- `ModuleError(code, message)`, `PermissionError(permission, value)`, `ModuleRequestError` (console) with `code` and `message`; all set `name`.
- `shell(command, args): ShellExecutor` returns `{ kind: 'shell', command, args }`.
- `SDK_VERSION = '1.0.0'`.

- [ ] **Step 1: Write failing tests** in `define.test.ts`: `defineModule/defineAction/defineRoute/defineJob/onEvent/definePanel return their input`; `onEvent('session.started', h)` returns `{ event: 'session.started', handler: h }`; `shell('harvey', ['status'])` deep-equals `{ kind: 'shell', command: 'harvey', args: ['status'] }`; `new ModuleError('unreachable', 'x')` has `code === 'unreachable'` and `instanceof Error`; `SDK_VERSION === '1.0.0'`; schema file parses and has `required` containing `id`, `name`, `version`, `sdk`, `displayName`.
- [ ] **Step 2:** `pnpm --filter @forge-dev/sdk test` → FAIL.
- [ ] **Step 3:** Implement types, helpers, errors, schema (JSON Schema draft 2020-12 mirroring the spec's manifest, including setting defs and `permissions`). Rename the legacy types and fix core/mod-qa imports (`ActionDef` → `LegacyActionDef` in `modules.ts`, `server.ts`, `action-params.ts`).
- [ ] **Step 4:** `pnpm --filter @forge-dev/sdk test && pnpm build` → PASS, whole monorepo compiles.
- [ ] **Step 5:** Commit `feat(sdk): v1 surface, errors and manifest schema`.

### Task 2: Manifest validation and permission templates

**Files:**
- Create: `packages/core/src/module-manifest.ts`, `module-manifest.test.ts`, `module-permissions.ts`, `module-permissions.test.ts`
- Modify: `packages/core/package.json` (add `semver`, `@types/semver`)

**Interfaces:**
- Produces:
  - `type ManifestCheck = { kind: 'v1'; manifest: ModuleManifestV1 } | { kind: 'legacy'; manifest: LegacyManifest } | { kind: 'invalid'; reason: string }`
  - `checkManifest(raw: unknown, moduleDir: string): ManifestCheck` — schema errors as `"<json path>: <message>"`, joined `; `; legacy rule and "declares v1 fields but no sdk range"; `server`/`view.entry` realpath must stay inside `moduleDir`; reserved segments are checked later (Task 4) because routes live in code.
  - `checkSdk(range: string, version = SDK_VERSION): string | null` — reason or null.
  - `validateSettings(schema: Record<string, SettingDef>, values: unknown): { ok: true; value: ModuleSettings } | { ok: false; errors: Array<{ path: string; message: string }> }` — applies defaults, `required`, `pattern`, `min/max`, `enum`, list items.
  - `type Grants = { network: string[]; fsRead: string[]; fsWrite: string[]; shell: string[]; pty: boolean }`
  - `expandGrants(permissions: ModuleManifestV1['permissions'], settings: ModuleSettings): Grants` — `{key}` and `{list[].field}`; unresolved → dropped; `~` → home.
  - `allowsOrigin(grants, url): boolean`, `allowsPath(list: string[], path: string): Promise<boolean>` (realpath both sides; trailing `/` = folder), `allowsCommand(grants, command): boolean`.

- [ ] **Step 1: Failing tests** — manifest: valid v1 passes; legacy (no sdk, no v1 fields) → `legacy`; `server` field without `sdk` → invalid "declares v1 fields but no sdk range"; bad `id` → invalid with `/id` in the reason; `server: '../x.js'` → invalid "outside the module folder"; `checkSdk('^2.0.0')` → `"needs SDK ^2.0.0, Forge has 1.0.0"`, `checkSdk('^1.0.0')` → null. Settings: defaults applied for list items (`port` 5555); missing required `path` → error path `instances[0].path`; enum outside values errors. Permissions: two instances expand to two origins; `drops a grant whose template resolves to nothing` (empty list → `network: []`); `allowsOrigin` exact origin, any path, rejects other port; `rejects a path that escapes through a symlink` (temp dir with a symlink pointing outside the granted folder → false); exact file grant does not allow its sibling.
- [ ] **Step 2:** `pnpm --filter @forge-dev/core exec vitest run src/module-manifest.test.ts src/module-permissions.test.ts` → FAIL.
- [ ] **Step 3:** Implement. Validator is hand-written against the schema shape (no new validator dependency); reasons use JSON paths.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(core): module manifest validation and permission grants`.

### Task 3: ForgeContext, storage and notifications tables

**Files:**
- Create: `packages/core/src/module-context.ts`, `module-context.test.ts`
- Modify: `db.ts` (tables `module_kv(module_id, key, value, updated_at, PK(module_id,key))`, `module_notifications(module_id, key, kind 'attention'|'badge', title, body, version, count, label, created_at, seen_at, PK(module_id,key))`), `db-interface.ts`, `db-postgres.ts` (new methods throw `Error('not available in team mode')`), `db.test.ts`

**Interfaces:**
- Consumes: Task 2 `Grants`, `allows*`; `ActionRunner` from `runner.ts`; `CWReader`; `PTYManager`.
- Produces:
  - `IForgeDB` additions: `kvGet(moduleId, key): string | undefined`, `kvSet(moduleId, key, json)`, `kvDelete`, `kvList(moduleId, prefix?)`, `upsertNotification(n: ModuleNotificationRow): boolean` (returns true when new or version changed), `deleteNotification(moduleId, key)`, `listNotifications(): ModuleNotificationRow[]`, `markNotificationsSeen(moduleId)`.
  - `createForgeContext(deps: ContextDeps, mod: { id: string; version: string }, getSettings: () => ModuleSettings, getGrants: () => Grants, onDenial: (permission: string, value: string) => void): ForgeContext`
  - `ContextDeps = { db: IForgeDB; reader: CWReader; runner: ActionRunner; pty?: PTYManager; fetch?: typeof fetch; log?: Pick<Console,'info'|'warn'|'error'> }`
- `ctx.shell.exec` adds `ActionRunner.spawn(command, args, opts)` (new method next to `exec`, same process-group kill and timeout; `exec` unchanged).

- [ ] **Step 1: Failing tests** — `fetch to an undeclared origin throws PermissionError and calls onDenial`; `fetch to a granted origin calls the injected fetch`; `fs.read inside a granted file returns its text`; `rejects a path that escapes through a symlink` (via context); `shell.exec without a grant throws`; `shell.exec granted runs spawn with the args array` (use `node -e`); `storage round-trips JSON per module and never leaks between modules`; `notify.attention twice with the same version stores one row and reports new once`; `notify.badge with 0 removes it`; db: `upsertNotification returns false for an unchanged version`.
- [ ] **Step 2:** run the two test files → FAIL.
- [ ] **Step 3:** Implement. Settings and grants are read through the getters at call time.
- [ ] **Step 4:** → PASS; `pnpm --filter @forge-dev/core test` stays green.
- [ ] **Step 5:** Commit `feat(core): permission-checked module context and storage`.

### Task 4: ModuleHost — discovery, loading, status, unload

**Files:**
- Create: `packages/core/src/module-host.ts`, `module-host.test.ts`, `packages/core/test/fixtures/modules/{valid,legacy,bad-json,schema-error,sdk-incompatible,sdk-missing,import-throws,shell-undeclared,duplicate-a,duplicate-b,reserved-route}/` (each a `forge-module.json` plus `dist/server.js` and `dist/view.js` where needed, plain JS)
- Modify: `modules.ts` only if `ModuleLoader` must skip v1 manifests (it should: legacy-only)

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces:
  - `class ModuleHost { constructor(opts: HostOptions); scan(): Promise<ModuleStatus[]>; list(): ModuleStatus[]; get(id: string): LoadedModule | undefined; reload(id: string): Promise<void>; addDev(path: string): Promise<ModuleStatus>; removeDev(path: string): Promise<void>; settings(id): ModuleSettings; saveSettings(id, values): { ok: true } | { ok: false; errors }; onChange(listener: (id: string) => void): () => void; close(): Promise<void> }`
  - `HostOptions = { modulesDir: string; bundledDir?: string; forgeNodeModules?: string; devFile: string; localOnly: boolean; deps: ContextDeps }`
  - `LoadedModule = { status: ModuleStatus; dir: string; manifest: ModuleManifestV1; server?: ModuleServer; ctx: ForgeContext; abort: AbortController }`
  - `ModuleStatus.source`: `'bundled' | 'dev' | 'installed' | 'node_modules'`.
- Discovery order and duplicate rule exactly as the spec; `import(pathToFileURL(file) + '?v=' + mtimeMs)`.

- [ ] **Step 1: Failing tests**, one per fixture: valid → `enabled` with `view.url === '/api/modules/valid/view.js'`; legacy → `legacy`; bad-json, schema-error, sdk-incompatible, sdk-missing, import-throws (message included), shell-undeclared ("action <id> uses shell but the manifest does not declare it"), reserved-route ("route /settings uses a reserved segment") → `disabled` with reason; duplicate → second disabled "duplicate id, already loaded from <path>"; discovery order (`~/.forge/modules/<dir>` beats `node_modules`); `localOnly: false` disables valid with "modules run only in local mode"; `reload re-imports a changed server.js` (edit the file, bump mtime); `close aborts the module signal`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS, full core suite green.
- [ ] **Step 5:** Commit `feat(core): module host with discovery and status`.

### Task 5: Module routes and the effect protocol

**Files:**
- Create: `packages/core/src/module-routes.ts`, `module-routes.test.ts`, `module-confirmations.ts`, `module-confirmations.test.ts`
- Modify: `server.ts` (create `ModuleHost`, mount `moduleRoutes(host, db)` before the legacy `/api/modules/:module/settings` handlers so v1 ids win and legacy ids fall through; `GET /api/modules` returns `host.list()` merged with legacy loader manifests as `state: 'legacy'`), `server.test.ts`

**Interfaces:**
- Consumes: Task 4 `ModuleHost`.
- Produces HTTP:
  - `GET /api/modules` → `ModuleStatus[]` (each with `settingsSchema`); `POST /api/modules/rescan` → list; `POST|DELETE /api/modules/dev { path }`; `POST /api/modules/:id/reload`.
  - `GET|PUT /api/modules/:id/settings` (v1: parsed JSON + defaults; `400 { errors }`).
  - `POST /api/modules/:id/actions/:action` `{ input, token? }`; `.../prepare`; `.../stream` (SSE `start|output|done|error`).
  - `GET /api/modules/notifications` → `{ items: Array<{ moduleId, key, kind, title, body?, count?, label?, seen: boolean, createdAt }> }`; `POST /api/modules/:id/notifications/seen`.
  - `GET /api/modules/:id/view.js` (file from `view.entry`, `Content-Type: text/javascript`, `Cache-Control: no-cache`).
  - `ALL /api/modules/:id/*` → the module's matching `RouteDef`, JSON response.
  - Error mapping: `ModuleError` codes → `bad_request` 400, `not_found` 404, `unauthorized` 401, `unreachable|upstream` 502; `PermissionError` → 403 `{ code: 'permission', permission, value }`; other → 500 `{ code: 'module_error', message }`; unknown/disabled id → 404 `{ code: 'module_removed' }`.
  - `class Confirmations { issue(moduleId, actionId, inputHash, confirmation): string; take(token, moduleId, actionId, inputHash): Confirmation | null }` (120 s, single use; clock injectable).

- [ ] **Step 1: Failing tests** — `external action without token → 409 confirmation_required and run not called`; `prepare then run → run receives ctx.confirmed equal to the plan`; `token is single-use`; `token for another input → 409`; `expired token → 409` (fake clock); `read action runs directly`; `stream emits start, output, done`; `route ModuleError unreachable → 502 with code`; `route throwing TypeError → 500 module_error and server keeps answering`; `PermissionError → 403`; `removed module → 404 module_removed`; `settings PUT with a bad list item → 400 with path instances[0].path`; `view.js served with javascript content type`; `notifications seen marks only that module`; existing `server.test.ts` legacy settings and `/api/actions` tests still pass; action runs logged to `action_logs` without the input.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(core): module routes, settings and confirmed actions`.

### Task 6: Jobs, events and emission points

**Files:**
- Create: `packages/core/src/module-jobs.ts`, `module-jobs.test.ts`, `module-events.ts`, `module-events.test.ts`
- Modify: `module-host.ts` (start/stop jobs and subscriptions on load/unload and on settings change; emit `module.settings.changed` to the owner), `cw-routes.ts` (accept an `events?: ModuleEvents` option; emit `session.started` after `/start` spawns, `task.done` after `/done` succeeds, `project.registered`), `pty-manager.ts` or `server.ts` (`session.ended` on PTY exit), the shared doctor client for `harness.changed`, `server.ts` wiring

**Interfaces:**
- Produces: `parseEvery(text: string): number` (ms; throws under 30 s); `class JobScheduler { start(moduleId, job, ctx, settings): void; stopModule(moduleId): void }` (no overlap, timeout = interval, `onError(moduleId, jobId, message)`); `class ModuleEvents { emit<E>(name, payload): void; subscribe(moduleId, sub, ctx): void; unsubscribeModule(moduleId): void }` (async after emit, 10 s timeout, errors to the module status).

- [ ] **Step 1: Failing tests** (fake timers) — `parseEvery('2m') === 120000`, `'10s'` throws; `skips a tick while the previous run is going`; `times out a run at the interval and records lastJobError`; `job not scheduled when enabled() is false`; `reload aborts the running job and schedules once`; `a throwing handler does not reach the emitter`; `handlers get harness, provider and model in session.started`; cw-routes: `POST /start emits session.started` with a stub runner.
- [ ] **Step 2:** → FAIL. **Step 3:** implement; verify the real emission points while wiring (the spec marks them "verify during implementation"). **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(core): module jobs and core events`.

### Task 7: Shared packages through an import map

**Files:**
- Create: `packages/console/vite.shared.config.ts`, `packages/console/scripts/check-shared.mjs`
- Modify: `packages/console/vite.config.ts`, `packages/console/index.html`, `packages/console/package.json` (`build` runs the shared build first; `dev` serves `/shared/*` from it), `packages/ui/package.json` (version `1.0.0`, `main/types` → `dist`, `exports`, `files`, build with `tsc`), `packages/platform/scripts/pack.mjs` if it lists console files

**Interfaces:**
- Produces: URLs `/shared/preact.js`, `/shared/preact-hooks.js`, `/shared/preact-jsx-runtime.js`, `/shared/preact-signals.js`, `/shared/forge-ui.js`, `/shared/forge-sdk.js`, and the import map in `index.html` mapping `preact`, `preact/hooks`, `preact/jsx-runtime`, `@preact/signals`, `@forge-dev/ui`, `@forge-dev/sdk` to them. The console's own build marks the same six as external so it uses these files.

- [ ] **Step 1:** Write `check-shared.mjs`: builds a tiny fixture view (esbuild, the six externals) that uses `useState` and ui `Badge`, then loads `dist/index.html` in jsdom-free fashion by asserting (a) every import-map URL exists in `dist/shared`, (b) `dist/assets/*.js` contains no copy of Preact's `options` object (grep for a Preact internal marker such as `__H` defined more than once across `dist`). Run it → FAIL.
- [ ] **Step 2:** Implement the shared build (library mode, one ES build with multiple entries so Preact is a single chunk) and the externals.
- [ ] **Step 3:** `pnpm --filter @forge-dev/console build && node packages/console/scripts/check-shared.mjs` → PASS. Then `pnpm start`, open the console, confirm every existing page renders (Tasks, Accounts, Skills, Prototypes, QA, Memory) and the terminal works. Also confirm `pnpm dev` still serves a working console.
- [ ] **Step 4:** Commit `feat(console): share Preact and ui through an import map`.

### Task 8: Modules in the console — store, sidebar, view, confirmations, notifications

**Files:**
- Create: `src/hooks/useModules.ts`, `src/hooks/useModuleNotifications.ts`, `src/config/moduleClient.ts`, `src/pages/ModuleView.tsx`, `src/components/ConfirmAction.tsx`
- Modify: `src/components/Sidebar.tsx` (`View` widens to ``View | `module:${string}` ``; a Modules group under `NAV` with icon glyph, color token, neutral badge count, red attention count; disabled greyed with `title` = reason; warning dot for `lastJobError`/`lastDenial`), `src/app.tsx` (render `ModuleView`, command palette entries), `src/state/notifications.ts` (switch label "Notify me when a session or module needs me"; `notify` reused with tag `module:<id>:<key>`)

**Interfaces:**
- Consumes: Task 5 HTTP; Task 7 import map; SDK `PanelClient`, `PanelConfig`.
- Produces: `modules` signal (`ModuleStatus[]`), `watchModules(): () => void`; `moduleNotifications` signal; `createPanelClient(moduleId: string, openSettings: () => void): PanelClient` — `action()` calls prepare for `external`, awaits `ConfirmAction` (a promise-returning `confirmAction(c: Confirmation): Promise<boolean>` mounted once in `app.tsx`, ui `Modal`, destructive button with `confirmLabel`, Escape/backdrop → false), then runs with the token; streamed actions read SSE and call `onOutput`.
- `ModuleView`: imports `view.url + '?v=' + view.version` once per version, error boundary card "<displayName>'s view crashed: <message>" with Reload view, removed state "<displayName> was removed" + link to Tasks, marks notifications seen on mount, header with title and gear.

- [ ] **Step 1:** Console has no unit test runner; verification is scripted. Add a fixture module (`packages/core/test/fixtures/modules/valid` gains a view with a button that runs an `external` action and one that throws on click-render). Start Forge with `FORGE_NO_OPEN=1` and a temp `HOME`-independent data dir containing the fixture (`forge module dev <fixture>` arrives in Task 10; until then, place it under the temp data dir's `modules/`).
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Verify with the browser (Playwright MCP): sidebar shows the module; the view renders and a `useState` counter updates; the external action shows the confirmation and Escape sends nothing (server log shows no run); confirm runs once; the throwing view shows the error card while the sidebar still works; deleting the fixture folder and rescanning shows the removed state; a job that calls `notify.attention` raises one notification and a red count. `npx tsc --noEmit -p packages/console` passes.
- [ ] **Step 4:** Commit `feat(console): module views, confirmations and notifications`.

### Task 9: Generated settings drawer

**Files:**
- Create: `src/components/ModuleSettings.tsx`
- Modify: `src/pages/ModuleView.tsx` (gear opens it; empty-state helpers can call `openSettings`)

**Interfaces:**
- Consumes: `GET|PUT /api/modules/:id/settings`, `ModuleStatus.settingsSchema` (Task 5).
- Produces: `<ModuleSettings moduleId schema open onClose onSaved />` in ui `Drawer`: string/number/toggle/select; `list` as item cards with Add/Remove; `format: path` → existing `DirectoryPicker`; `format: cw-project` → select of `/api/cw/projects`; server errors inline by `path`.

- [ ] **Step 1:** Implement. **Step 2:** Verify in the browser with the fixture: add two list items, save, reload, values persist; an invalid pattern shows the error under the field; `tsc --noEmit` passes.
- [ ] **Step 3:** Commit `feat(console): settings drawer generated from a module schema`.

### Task 10: CLI install, remove, list, rescan

**Files:**
- Create: `packages/core/src/module-install.ts`, `module-install.test.ts`
- Modify: `packages/cli/src/commands/module.ts`, `packages/core/src/index.ts` (export the install helpers and `checkManifest`)

**Interfaces:**
- Produces: `previewManifest(spec: string, opts: { cwd: string; run: Runner }): Promise<{ manifest: ModuleManifestV1 | LegacyManifest; permissionsText: string }>` (path → read directly; otherwise `npm pack <spec> --pack-destination <tmp>` with `--ignore-scripts`, extract `package/forge-module.json` with `tar`); `installArgs(spec, prefix): string[]` → `['install', '--ignore-scripts', '--prefix', prefix, spec]`; `removeTarget(idOrName, modulesDir)`.
- CLI: `install|add <spec> [--yes]`, `remove <id|name>`, `list` (id, version, source, state, reason), all calling `POST /api/modules/rescan` when the server answers.

- [ ] **Step 1: Failing tests** — `previewManifest of a path reads its manifest without running npm`; `installArgs puts --ignore-scripts before the spec`; `permissionsText lists each permission and the trust note`; `previewManifest of an npm spec calls npm pack with an args array` (stub runner).
- [ ] **Step 2:** → FAIL. **Step 3:** implement; replace every `execSync` string in `module.ts` with `spawn` arrays. **Step 4:** → PASS; manual: `node packages/cli/dist/index.js module install <fixture path> --yes` against a temp `HOME` installs and lists it.
- [ ] **Step 5:** Commit `feat(cli): module install shows permissions before any code runs`.

### Task 11: CLI dev and create

**Files:**
- Create: `packages/cli/templates/module/{package.json,forge-module.json,src/server.ts,src/view.tsx,src/server.test.ts,build.mjs,tsconfig.json,README.md}` (the build marks the six shared packages external; README states the styling rule)
- Modify: `packages/cli/src/commands/module.ts`, `packages/cli/package.json` (`files` includes `templates`)

**Interfaces:**
- `dev <path>`: `POST /api/modules/dev { path }`, runs the module's `build --watch` script if present (spawn, inherit stdio), watches `dist/` with `fs.watch` and calls `POST /api/modules/:id/reload` (Task 5), `DELETE /api/modules/dev` on SIGINT.
- `create <name>`: copies the template, replaces `__ID__`, `__NAME__`, prints next steps.

- [ ] **Step 1:** Implement. **Step 2:** Verify: `forge module create demo` in a temp dir, `pnpm install && pnpm test && pnpm build` in it pass; `forge module dev ./demo` shows it in the sidebar; editing `src/view.tsx` updates the view after the next poll without restarting Forge.
- [ ] **Step 3:** Commit `feat(cli): module dev and create`.

### Task 12: mod-harvey repo and Harvey client

**Files (in `~/workspace/personal/forge-mod-harvey`, new git repo, created from `forge module create harvey`):**
- `forge-module.json` (exactly the spec's example), `src/harvey.ts`, `src/harvey.test.ts`, `test/fake-harvey.ts`

**Interfaces:**
- Produces: `instanceByName(ctx, name): Instance` (throws `ModuleError('not_found')`); `harveyFetch<T>(ctx, inst, path, init?): Promise<T>` — reads `<path>/data/dashboard-token` per call, 5 s timeout, error mapping per spec; `type Instance = { name; path; port; provider; project? }`.
- `fake-harvey.ts`: `startFakeHarvey(state): Promise<{ port; tokenDir; calls: Array<{ method; path; auth }>; set(state); close() }>` — a `node:http` server answering the Harvey paths the module uses with the state given.
- Dependencies: `@forge-dev/sdk` and `@forge-dev/ui` via `link:../forge/packages/...` until published.

- [ ] **Step 1: Failing tests** with a hand-built ctx (`createTestContext` helper in the test file implementing `ForgeContext` with real fs/fetch): `reads the token on every call` (rotate the token file between calls, fake sees the new one); `unreachable port → ModuleError unreachable "Harvey is not running on :<port>"`; `401 → unauthorized`; `500 with message → upstream carrying Harvey's message`; `token never appears in a thrown message`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement. **Step 4:** → PASS. **Step 5:** commit in that repo `feat: harvey client`.

### Task 13: mod-harvey routes, actions and watch job

**Files:** `src/server.ts`, `src/actions.ts`, `src/watch.ts`, tests beside each.

**Interfaces:**
- Routes and actions exactly as the spec's tables; `approve` and `approve-all` plans are `Array<{ id: string; hash: string }>` with `hash = sha256(subject + '\n' + body)`.
- `watch` job `every: '2m'`, `enabled: s => (s.instances as unknown[]).length > 0`; previous reading in storage key `reading:<instance>` as `{ needsHuman, badKeys: string[], up: boolean }`.

- [ ] **Step 1: Failing tests** against the fake — routes map to the right Harvey path; `approve confirm lists recipient, subject and body`; `approve-all skips drafts not in the plan` (fake adds a draft after confirm); `approve skips an email whose body changed`; `discover-run sends max_spend and its confirmation says "Spend up to US$<n> on <provider>"`; `edit, reject, sending are local and call the right path`; watch: `needs_human 0→1 notifies once, 1→1 does not, →0 clears`; `new bad item notifies, same item next poll does not`; `running→stopped notifies down once`; `outbox_pending sets the badge`; `nothing notified for sent emails`.
- [ ] **Step 2:** → FAIL. **Step 3:** implement; check each Harvey field name against `~/workspace/tools/harvey/harvey/dashboard.py` while writing the fake. **Step 4:** → PASS. **Step 5:** commit `feat: harvey routes, actions and watch job`.

### Task 14: mod-harvey view and end-to-end acceptance

**Files:** `src/view.tsx`, `src/tabs/{Today,Outbox,Pipeline}.tsx`, `README.md`

**Interfaces:** Consumes the module's routes through `forge.route` and actions through `forge.action`; styling per the spec's rule.

- [ ] **Step 1:** Implement per the spec's View section (instance selector hidden with one, status pill with Pause/Resume, Open Harvey dashboard link, empty and unreachable states, Pipeline estimate → max spend prefilled with the estimate rounded up to the next 0.10).
- [ ] **Step 2:** `forge module dev ~/workspace/personal/forge-mod-harvey` against the real Harvey checkout with its dashboard running (`.venv/bin/harvey dashboard`); walk the spec's Acceptance 1–7 in the browser; record what was verified. Do not approve real email or run a paid discover: use the confirmation and cancel, and run discover only with the free OpenStreetMap provider if offered.
- [ ] **Step 3:** Commit `feat: harvey view`; prepare `npm publish --dry-run` output for the user, do not publish.

### Task 15: Docs and release notes

**Files:** `docs/module-authoring.md` (rewrite for v1: layout, manifest, permissions and the trust note, effects, jobs, events, notifications, styling rule, dev/create/install), `docs/sdk-reference.md` (generated from the SDK types with `tsc --declaration` output summarized, or `typedoc` if already available — no new heavy dependency), `CHANGELOG.md` (Unreleased), `CLAUDE.md` (Key Files, API Endpoints, module paragraph), `README.md` module claims, `SHARED_CONTEXT.md` (new routes and SDK rename).

- [ ] **Step 1:** Write the docs. **Step 2:** `pnpm build && pnpm test` → green; the full regression check from the task rules (legacy `/api/actions`, Qa page, `forge module list`, `npx forge-cw` pack via `pnpm pack` in `packages/platform` and starting the tarball until `/api/health` answers) against `origin/main` and this branch. **Step 3:** Commit `docs: module SDK v1`.

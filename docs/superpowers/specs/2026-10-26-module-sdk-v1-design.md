# Module SDK v1, designed against mod-harvey

Date: 2026-10-26. Step 1 of `docs/plans/2026-09-09-plugin-ecosystem-brief.md` (its decisions
stand and are not repeated here unless this design narrows them). The design case is
`docs/plans/2026-10-26-mod-harvey-brief.md`: a module for Harvey, a third-party outbound
sales agent with its own local API.

## Intent

Forge modules today are manifests with shell strings; the console renders none of them
except mod-qa, which `pages/Qa.tsx` imports by hand. SDK v1 makes a module something a
third party builds, publishes to npm and installs into a running Forge with no rebuild: a
server half (routes, actions, jobs, events) and a console half (one view), bound by a
manifest that declares what the module may touch.

Harvey is the test because it is the opposite of a dev tool: a long-running agent with its
own API and token, actions that email real people or spend money, and state worth
interrupting the user for. If the SDK carries Harvey, it carries dev modules.

### Why Harvey belongs in Forge

Harvey runs B2B outbound for one product per checkout. Of the projects in
`~/workspace/personal`, saludbot (dental clinics, Harvey is already trained on it),
recibido and propia (building administrators) and, less clearly, retro_ and qa-pilot sell
to businesses. Forge already knows these projects and is open all day; Harvey's own
dashboard is not. Forge's job is to tell the user when a prospect replies, let them
approve outgoing email and launch paid discovery from where they already work, and leave
deep campaign work to Harvey's dashboard.

## Goals

1. A documented, semver'd `@forge-dev/sdk` 1.0.0: `definePanel`, `defineAction`,
   `defineRoute`, `defineJob`, `defineDetector`, `onEvent`, `defineModule`, the server
   context (`ForgeContext`) and the console client (`PanelClient`).
2. A manifest schema (`forge-module.schema.json`) validated at load with clear errors, and
   a permission model the server enforces on every call through the context.
3. Runtime loading: server discovers, validates and mounts modules; console fetches the
   list and imports each view bundle with dynamic `import()`, sharing one Preact through
   an import map.
4. Actions with a declared effect; `external` effects need a server-checked confirmation.
5. Module notifications with two levels (`attention`, `badge`) delivered to the sidebar
   and, for `attention`, to the browser notification the console already has.
6. Generated settings forms, including lists of objects, and permissions templated from
   settings.
7. `forge module install | remove | list | dev | create`.
8. mod-harvey in its own repo, built with `forge module dev`, installed with
   `forge module install`, never imported by Forge source.

## Non-goals

- **No project slots.** v1 has one placement, a module `view` in the sidebar. A strip on
  the project card was considered and rejected by the user.
- **No process supervision.** Forge never starts, stops or keeps alive a module's
  long-running process. Harvey runs on its own (terminal, launchd); Forge observes it.
- **No real sandbox.** Module server code runs in Forge's process (see Approach).
- **No secret storage.** Settings never hold credentials; modules read them from where
  the tool keeps them, through a declared `fs:read`.
- Team mode features, a marketplace UI, and creating or training Harvey instances from
  Forge (that stays `harvey train` in a terminal).
- Migrating `pages/Qa.tsx` onto a module view, and the brief's steps 4 and 6 (mod-dev,
  mod-scaffold, moving the starter modules to `examples/`). Follow-ups after this lands;
  mod-qa keeps working through legacy loading.

## Anti-goals

- An approve or send that happens on one accidental click.
- Harvey's token reaching the browser, a log, or Forge's DB.
- One broken module blanking the dashboard or crashing the server.
- mod-harvey hardcoding saludbot, a port or a path.
- Opening Forge to other origins to talk to Harvey.

## Approach

Three options were weighed for where module server code runs:

1. **In Forge's process (chosen).** Forge `import()`s the module's `server.js`. Handlers
   receive a `ForgeContext` whose capabilities (`fetch`, `fs`, `shell`, `pty`) check the
   manifest's permissions on every call and throw `PermissionError` otherwise.
2. A child process per module under Node's permission model, talking RPC. Real enforcement
   for files; much more machinery. The natural next step: `ForgeContext` is designed so
   moving to it changes no module code.
3. Declarative only (manifest-described proxies and polls). Safest, but contradicts the
   brief's typed handlers.

Consequence of 1, stated in the docs and the install output: **permissions are a contract,
not a cage.** A module that imports `node:fs` directly bypasses them. Installing a module
is trusting it, as with editor extensions. The permission model still matters: it makes a
module's reach visible before install, stops honest mistakes, and is the interface option 2
will enforce.

## Package layout

```
forge-mod-harvey/
  package.json          "forge": { "manifest": "forge-module.json" }
  forge-module.json
  src/server.ts   →  dist/server.js     (Node ESM, default export defineModule(...))
  src/view.tsx    →  dist/view.js       (browser ESM, default export definePanel(...))
```

`forge module create` scaffolds this with an esbuild config that marks the shared
packages external (see Import map). A module may have only a server half, only a view, or
neither (legacy shell actions).

## Manifest (`forge-module.json`)

```jsonc
{
  "id": "harvey",                      // [a-z][a-z0-9-]{1,31}, unique, used in URLs
  "name": "@forge-dev/mod-harvey",     // npm name
  "version": "0.1.0",
  "sdk": "^1.0.0",                     // semver range against Forge's SDK version
  "displayName": "Harvey",
  "description": "Outbound sales agent: replies, outbox, pipeline",
  "icon": "mail",                      // glyph name the console knows; unknown → generic
  "color": "#e8a33d",
  "server": "./dist/server.js",        // optional
  "view": { "entry": "./dist/view.js", "title": "Harvey" },   // optional
  "permissions": {
    "network": ["http://localhost:{instances[].port}", "http://127.0.0.1:{instances[].port}"],
    "fs:read": ["{instances[].path}/data/dashboard-token"]
  },
  "settings": {
    "schema": {
      "instances": {
        "type": "list",
        "label": "Harvey instances",
        "item": {
          "name":     { "type": "string", "label": "Name", "required": true, "pattern": "^[a-z0-9-]+$" },
          "path":     { "type": "string", "label": "Checkout folder", "required": true, "format": "path" },
          "port":     { "type": "number", "label": "Dashboard port", "default": 5555 },
          "provider": { "type": "enum", "values": ["claude", "codex"], "default": "claude" },
          "project":  { "type": "string", "label": "CW project", "format": "cw-project" }
        }
      }
    }
  },
  "actions": [],                        // legacy shell actions only (see Legacy)
  "detectors": []
}
```

### Rules

- `id`, `name`, `version`, `sdk`, `displayName` are required in v1. `description`, `icon`,
  `color` default to empty, `generic`, the neutral token.
- `server` and `view.entry` are paths inside the module folder; a path that resolves
  (realpath) outside it is a validation error.
- Setting types: `string` (optional `pattern`, `format: "path" | "cw-project" | "url"`),
  `number` (optional `min`, `max`), `boolean`, `enum` (`values`), `list` (`item`: a map of
  scalar setting defs; lists do not nest). Every def may have `label`, `help`, `default`,
  `required`.
- Reserved first path segments under `/api/modules/<id>/`: `settings`, `actions`,
  `view.js`, `status`, `notifications`, `reload`. A route using one is a validation error.
- The JSON schema lives at `packages/sdk/forge-module.schema.json`, is exported by the
  package, and is what the loader validates against (validator choice left to the builder;
  a small hand-written one is fine if it reports the JSON path of each error).

### Legacy manifests

A manifest with no `sdk` and none of `server`, `view`, `permissions` loads in legacy mode:
exactly today's behavior (shell `actions` through `/api/actions`, params as
`FORGE_PARAM_*`). It is listed with a `legacy` tag. This keeps bundled mod-qa and the Qa
page working. A manifest that has any v1 field but no `sdk` is disabled with "declares v1
fields but no sdk range".

## Permissions

| Permission | Shape | Checked in |
|---|---|---|
| `network` | list of origins (`scheme://host:port`), templated | `ctx.fetch` — exact origin match, any path |
| `fs:read` | list of paths; a trailing `/` grants the folder, else the exact file | `ctx.fs.read`, `ctx.fs.list` |
| `fs:write` | same as `fs:read` | `ctx.fs.write` |
| `shell` | list of executables (absolute paths or names on PATH), templated | `ctx.shell.exec`, v1 shell actions |
| `pty` | `true` | `ctx.pty.spawn` |

- **Templates.** `{key}` expands a scalar setting; `{list[].field}` expands to one grant
  per list item. A grant whose template resolves to nothing (empty list, unset value) is
  dropped, never widened. Grants are recomputed when settings change.
- **Paths** are compared after `realpath` of both sides, so a symlink cannot escape a grant.
  `~` expands to the user's home.
- **Load-time checks** (module disabled with the reason): a `defineAction` with the shell
  executor and no `shell` permission; a permission name not in the table.
- **Run-time checks**: a call outside the grants throws `PermissionError` with the
  permission and the value asked for. The module's status records the last denial, and the
  console shows it as a warning on the module (not disabled: the module may be working
  with an incomplete setting).
- Module routes are under `/api`, so `origin-guard.ts` and team-mode bearer auth apply
  unchanged. Nothing a module does adds CORS headers or listeners.

## SDK surface (`@forge-dev/sdk` 1.0.0)

Exports types plus these identity-style helpers (they return their input, typed), and
`SDK_VERSION`.

```ts
export const SDK_VERSION: '1.0.0'

// server half: the default export of server.js
export function defineModule(def: ModuleServer): ModuleServer
export interface ModuleServer {
  routes?: RouteDef[]
  actions?: ActionDef[]
  jobs?: JobDef[]
  events?: EventSubscription[]
  detectors?: DetectorDef[]
}

export function defineRoute(def: RouteDef): RouteDef
export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string                                   // Hono-style, e.g. '/instances/:name/today'
  handler: (req: RouteRequest, ctx: ForgeContext) => Promise<unknown> | unknown   // JSON body
}
export interface RouteRequest {
  params: Record<string, string>
  query: Record<string, string>
  body: unknown                                  // parsed JSON or undefined
}

export type ActionEffect = 'read' | 'local' | 'external'
export function defineAction<I = unknown, O = unknown>(def: ActionDef<I, O>): ActionDef<I, O>
export interface ActionDef<I = unknown, O = unknown> {
  id: string
  label: string
  icon?: string
  effect: ActionEffect                           // required: no default
  input?: Record<string, SettingDef>             // validated before confirm/run
  confirm?: (input: I, ctx: ForgeContext) => Promise<Confirmation>   // required when effect is 'external'
  run: ((input: I, ctx: ActionContext) => Promise<O>) | ShellExecutor
}
export interface Confirmation {
  title: string                                  // "Send 3 emails"
  body?: string
  items?: Array<{ label: string; detail?: string }>   // recipients, subject + body preview
  confirmLabel: string                           // "Send", "Spend up to US$2.40"
  plan?: unknown                                 // JSON kept server-side, handed to run as ctx.confirmed
}
export interface ShellExecutor { kind: 'shell'; command: string; args: string[] }   // spawn, never sh -c
export function shell(command: string, args: string[]): ShellExecutor
export interface ActionContext extends ForgeContext {
  output: (chunk: string) => void                // streamed to the console when it asked for a stream
  signal: AbortSignal                            // the console cancelled or the module is unloading
  confirmed?: unknown                            // the plan from confirm(), external actions only
}

export function defineJob(def: JobDef): JobDef
export interface JobDef {
  id: string
  every: string                                  // '30s' minimum, '2m', '1h'
  enabled?: (settings: ModuleSettings) => boolean   // false → not scheduled
  run: (ctx: ForgeContext & { signal: AbortSignal }) => Promise<void>
}

export function onEvent<E extends ForgeEventName>(name: E, handler: (payload: ForgeEvents[E], ctx: ForgeContext) => void | Promise<void>): EventSubscription

export function defineDetector(def: DetectorDef): DetectorDef
export interface DetectorDef {
  tool: string
  files?: string[]
  packages?: string[]
  detect?: (projectDir: string, ctx: ForgeContext) => Promise<boolean>
  suggestion: string
}

// console half: the default export of view.js
export function definePanel(def: PanelConfig): PanelConfig
export interface PanelConfig { id: string; title: string; component: FunctionComponent<PanelProps> }
export interface PanelProps {
  moduleId: string
  projectId: string | null
  cwProject?: string | null                      // the task list's project filter, if any
  forge: PanelClient                             // new in v1
}
```

### `ForgeContext` (server)

```ts
export interface ForgeContext {
  module: { id: string; version: string }
  settings: ModuleSettings                      // validated, defaults applied, read at call time
  sessions: { list(): Promise<SessionInfo[]> }  // SessionInfo includes harness, provider, model
  projects: { list(): Promise<ProjectInfo[]>; dir(name: string): Promise<string | null> }
  accounts: { list(): Promise<AccountInfo[]> }
  git: { status(project: string, sessionDir: string): Promise<GitStatus> }
  storage: {                                    // module-scoped, JSON values, Forge DB
    get<T>(key: string): Promise<T | undefined>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    list(prefix?: string): Promise<string[]>
  }
  notify: {
    attention(n: { key: string; title: string; body?: string; version?: string }): Promise<void>
    badge(key: string, count: number, label?: string): Promise<void>   // 0 removes it
    clear(key: string): Promise<void>
  }
  fetch(url: string, init?: RequestInit): Promise<Response>           // network
  fs: { read(path: string): Promise<string>; list(dir: string): Promise<string[]>; write(path: string, data: string): Promise<void> }
  shell: { exec(command: string, args: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<ExecResult> }
  pty: { spawn(command: string, args: string[], opts: { cwd: string; name: string }): Promise<{ sessionId: string }> }
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void }
}

export class ModuleError extends Error {        // typed failures a route or action reports
  constructor(code: 'unreachable' | 'unauthorized' | 'bad_request' | 'not_found' | 'upstream', message: string)
}
export class PermissionError extends Error { permission: string; value: string }
```

`SessionInfo`, `ProjectInfo`, `AccountInfo`, `GitStatus` are the shapes `cw-reader.ts` and
the git routes already return, re-declared in the SDK (the SDK must not depend on core).
`shell.exec` reuses `ActionRunner`'s process-group kill on timeout and abort.

### `PanelClient` (console)

```ts
export interface PanelClient {
  route<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>   // /api/modules/<id><path>; throws ModuleRequestError { code, message }
  action<O>(id: string, input?: unknown, opts?: { onOutput?: (chunk: string) => void }): Promise<O | undefined>   // undefined = user cancelled the confirmation
  settings: ReadonlySignal<ModuleSettings>
  openSettings(): void
  status: ReadonlySignal<ModuleStatus>          // enabled, last job error, last permission denial
}
```

`action()` runs the whole effect protocol: for `external` it calls prepare, shows Forge's
confirmation dialog (ui `Modal`, destructive styling, the `Confirmation` items listed,
confirm button carries `confirmLabel`, Escape and backdrop cancel), then runs with the
token. Modules never build their own confirmation for `external`.

## Effect protocol

- `read` and `local` run directly: `POST /api/modules/<id>/actions/<action>` with
  `{ input }`. `local` means it changes state on this machine (Harvey's DB, a file) and
  nothing leaves it.
- `external` means a third party receives something or money is spent.
  1. `POST .../actions/<action>/prepare { input }` → validates input, calls `confirm()`,
     returns `{ confirmation, token }`. The server keeps the `Confirmation` (including its
     optional `plan`) under the token. The token is single-use, expires in 120 s, and is
     bound to module, action and a hash of the input.
  2. `POST .../actions/<action> { input, token }` → runs only with a valid token for the
     same input; otherwise `409 { code: 'confirmation_required' }`. `run` receives the
     stored `plan` as `ctx.confirmed`, so it acts on exactly what the user saw, never on a
     fresh reading.
- **What runs is what was shown.** `confirm` returns what the user approves as `plan`
  (for example the outbox ids with a hash of each subject and body). `run` must act only on
  `ctx.confirmed`; if the world changed in between, it fails with
  `ModuleError('upstream', 'changed since you confirmed')` instead of sending something
  else.
- The server enforces this; the CLI `forge run` gets the same 409 and prints the
  confirmation instead of running.
- Streaming: `POST .../actions/<action>/stream` returns SSE `start`, `output`, `done |
  error`, same event names as today's `/api/actions/*/stream`.
- Every v1 action run is written to `action_logs` (module, action, effect, input hash,
  exit or error), never the input itself.

## Events

| Event | Payload | Emitted when |
|---|---|---|
| `session.started` | `{ project, sessionDir, type, account, harness, provider?, model? }` | `POST /api/cw/start` spawned CW successfully |
| `session.ended` | same | a session's PTY exits or `/done` succeeds |
| `task.done` | same + `{ command: 'work' \| 'review' \| 'loop' }` | `POST /api/cw/done` succeeded |
| `project.registered` | `{ project, path }` | `register-project` succeeded |
| `harness.changed` | `{ account, harness, from, to }` (installed / logged in) | the shared `cw doctor` client sees a change |
| `module.settings.changed` | `{ moduleId }` (own module only) | settings saved |

Handlers run after the response, in order of registration, each with a 10 s timeout;
a throw is logged to the module's status and never reaches the emitter. Exact
emission points in `cw-routes.ts` and the PTY exit path: verify during implementation.

## Notifications

- `notify.attention({ key, title, body, version })` stores the item in
  `module_notifications` (module, key, title, body, version, created_at, seen_at). Same
  key and same `version` is a no-op, so a job can call it every poll; a new version updates
  the item and alerts again. `clear(key)` deletes it.
- `notify.badge(key, count, label)` stores a count; the module's sidebar entry shows the
  sum of its badges as a neutral count and the number of unseen attention items as a red
  count.
- Delivery: the console polls `GET /api/modules/notifications` every 5 s (15 s hidden),
  following `useSessionStates`. A new unseen attention item raises a browser notification
  through `state/notifications.ts` (`notify`, tag `module:<id>:<key>`, click opens the
  module view). The switch is the existing one; its label becomes "Notify me when a session
  or module needs me".
- Opening the module view marks its attention items seen (`POST .../notifications/seen`);
  seen items stay listed until the module clears them.

## Server loading sequence

1. **Discover**, in order, first `id` wins, later duplicates disabled ("duplicate id,
   already loaded from <path>"):
   1. bundled modules (`BUNDLED_MODULES` in `bundledModulesDir`), as today;
   2. dev modules registered by `forge module dev` (kept in `<dataDir>/dev-modules.json`);
   3. `~/.forge/modules/<dir>/forge-module.json` (today's layout);
   4. packages under `~/.forge/modules/node_modules/` whose `package.json` has a `forge`
      field or whose name matches `@forge-dev/mod-*` (where `npm install --prefix` puts them);
   5. `node_modules/@forge-dev/mod-*` next to Forge's own install.
2. **Validate** the manifest against the schema; check `sdk` with `semver.satisfies`
   against `SDK_VERSION` (an incompatible range disables: "needs SDK ^2.0.0, Forge has
   1.0.0"). A missing or unreadable manifest is skipped silently only when the folder has
   no `forge` field; otherwise disabled with the parse error.
3. **Import** `server` with `import(url + '?v=' + mtime)`; a throw or a default export that
   is not a `ModuleServer` disables the module with the message.
4. **Check** static permissions (above), duplicate action/route/job ids.
5. **Mount** routes under `/api/modules/<id>/`, register actions, schedule jobs whose
   `enabled(settings)` is true, subscribe events.
6. Record `ModuleStatus` for `GET /api/modules`:
   `{ id, name, version, source, state: 'enabled' | 'disabled' | 'legacy', reason?, settingsSchema?, view?: { url, title, icon, color, version }, lastJobError?, lastDenial? }`.

Routes are mounted once on a dispatcher (`/api/modules/:id/*`) that looks up the current
module table, so reloading or removing a module needs no Hono re-registration.

**Unload** (removed, disabled, or reloaded by `dev`): abort running jobs and streamed
actions through their `AbortSignal`, unsubscribe events, drop the table entry. Requests
in flight finish; new ones get `404 { code: 'module_removed' }`.

**Jobs**: one run at a time per job (a tick that finds the previous run still going is
skipped), timeout = the interval, errors recorded in `lastJobError` and logged once per
distinct message. Jobs do not run while the module is disabled or `enabled()` is false.

## Console loading

- **Import map.** The console's `index.html` declares an import map for `preact`,
  `preact/hooks`, `preact/jsx-runtime`, `@preact/signals`, `@forge-dev/ui`,
  `@forge-dev/sdk`, each pointing to an ESM file Forge serves (`/shared/<name>.js`), and
  the console itself loads those same files, so a module and the console share one Preact
  instance. How Vite produces this (externals plus a separate shared build, or
  `vite-plugin`-style rewriting) is left to the builder; the acceptance test is that a
  module view using `useState` and a `@forge-dev/ui` component renders and updates.
- **Styling.** UnoCSS generates classes at Forge's build time from Forge's own sources, so
  utility classes inside a module bundle are not generated. Module views style with
  inline `style` and the `theme.css` tokens (`var(--card)`, `var(--ink-2)`…) plus
  `@forge-dev/ui` components, whose classes Forge's build already includes. The scaffold
  and the docs say so.
- `GET /api/modules` feeds a shared store (`useModules`, 10 s poll plus refetch on
  focus). Each enabled module with a `view` adds an entry to a **Modules** group in the
  sidebar, below the built-in nav, with its icon, color and the two counts. Disabled
  modules show greyed in the same group with the reason as the tooltip; legacy ones are
  not listed (they have no view).
- `View` in `Sidebar.tsx` widens to `View | \`module:${string}\``; `app.tsx` renders
  `ModuleView` for it.
- `ModuleView` imports `view.url` (`/api/modules/<id>/view.js?v=<version>`) once per
  version, renders the panel inside an error boundary, and passes `PanelClient`. The
  header has the module's title and a gear that opens the settings drawer.
- **Settings drawer** (ui `Drawer`), generated from the schema: text, number, toggle,
  select, and for `list` a stack of item cards with Add / Remove. `format: "path"` offers
  the existing `DirectoryPicker`; `format: "cw-project"` a select of CW projects. Saving
  validates on the server (`PUT /api/modules/<id>/settings`, `400 { errors: [{ path,
  message }] }` shown inline). Settings are stored in `module_settings`, one row per
  top-level key, value as JSON.

## Failure modes

| Failure | What the user sees |
|---|---|
| Manifest invalid JSON or schema error | Module greyed in the sidebar group; tooltip and `forge module list` show the JSON path and message. Everything else works. |
| `sdk` missing (with v1 fields) or incompatible | Same, reason "needs SDK X, Forge has 1.0.0" or "declares v1 fields but no sdk range". |
| Undeclared static permission | Same, reason names the action and the permission. |
| Undeclared permission at run time | The call fails with `PermissionError`; the route returns `403 { code: 'permission', permission, value }`; the module gets a warning dot with the last denial. |
| `server.js` throws on import | Disabled with the message. |
| View throws on render | An error card in the module's area only ("Harvey's view crashed: <message>", Reload view). Sidebar and tabs keep working. |
| View bundle fails to import | The same card, reason from the import error. |
| Route handler throws `ModuleError` | `502` (or `400`/`404` by code) `{ code, message }`; `PanelClient.route` rethrows it typed. |
| Route handler throws anything else | `500 { code: 'module_error', message }`, logged with the module id; the server keeps running. |
| Job throws or times out | `lastJobError` on the module, shown as a warning; the next tick runs normally. |
| Module removed while its view is open | Next store poll drops it; the view is replaced by "Harvey was removed" with a link back to Tasks; its routes answer `404 module_removed` meanwhile. |
| `external` action without a valid token | `409 confirmation_required`; nothing runs. |

## CLI

`packages/cli` `forge module`:

- `install <npm-name | path | git-url>`: first reads the manifest without running any
  of the package's code (`npm pack <spec>` into a temp dir and extract
  `forge-module.json`; a path is read directly), validates it, prints its permissions and
  the trust note, and asks y/N (`--yes` skips the prompt for scripts). Then
  `npm install --ignore-scripts --prefix ~/.forge/modules <spec>` with `spawn` and an args
  array (the current `execSync` string goes), and asks the running server to rescan
  (`POST /api/modules/rescan`). `add` stays as an alias.
- `remove <id | name>`: `npm uninstall` or delete the copied folder, then rescan.
- `list`: id, version, source, state, reason.
- `dev <path>`: registers the path as a dev module, runs the module's `build --watch` if
  its package.json has one, watches `dist/` and asks the server to reload that module on
  change; the console picks up the new view version on its next poll. Ctrl-C unregisters.
- `create <name>`: scaffolds the layout above with a passing test, a view that renders,
  and the esbuild config; `forge module dev` on it works with no edits.

## mod-harvey

Repo `~/workspace/personal/forge-mod-harvey`, package `@forge-dev/mod-harvey`, manifest
as in the example above. It talks only to Harvey's HTTP API, never to its SQLite.

**Server half**

- `harveyFetch(ctx, instance, path, init)`: reads `<path>/data/dashboard-token` with
  `ctx.fs.read` on every call (never cached in storage), calls
  `http://localhost:<port><path>` with `Authorization: Bearer`. Connection refused or
  timeout (5 s) → `ModuleError('unreachable', 'Harvey is not running on :<port>')`; 401 →
  `unauthorized`; other non-2xx → `upstream` with Harvey's `message`.
- Routes (GET, read-only pass-through of Harvey's JSON): `/instances` (names, ports,
  projects from settings plus reachability), and
  `/instances/:name/{today,outbox,stats,usage,status,live-status,conversations,signals,runs,discover/providers}`
  mapping to the matching Harvey `GET /api/...` (`status` is `/api/harvey/status`). No
  generic proxy: only these paths.
- Actions:

  | id | effect | Harvey call | confirmation |
  |---|---|---|---|
  | `approve` `{ instance, id }` | external | `POST /api/outbox/{id}/approve` | recipient, subject, full body (fetched from `/api/outbox` in `confirm`) — "Send" |
  | `approve-all` `{ instance }` | external | one `POST /api/outbox/{id}/approve` per confirmed id (never Harvey's `approve-all`, which approves whatever is pending when it runs) | count and every recipient + subject — "Send N emails" |

  Both keep `{ id, hash(subject + body) }` per email as `plan`. `run` re-reads the
  outbox, skips any confirmed email that is no longer pending or whose hash changed, and
  reports what it skipped. A new draft Harvey wrote in the meantime is never sent.
  | `edit` `{ instance, id, subject?, body }` | local | `POST /api/outbox/{id}/edit` | — |
  | `reject` `{ instance, id }` | local | `POST /api/outbox/{id}/reject` | — |
  | `sending` `{ instance, state: 'pause' \| 'resume' }` | local | `POST /api/sending/{state}` | — |
  | `discover-estimate` `{ instance, provider, ...query }` | read | `POST /api/discover/estimate` | — |
  | `discover-run` `{ instance, provider, maxSpend, ...query }` | external | `POST /api/discover/run` with `max_spend` | "Spend up to US$<maxSpend> on <provider>", the estimate and query count — "Run discover" |
  | `discover-stop` `{ instance }` | local | `POST /api/discover/stop` | — |

- Job `watch`, every 2 min, enabled when `instances` is non-empty. Per instance it reads
  `/api/today` and `/api/harvey/status` and keeps the previous reading in storage:
  - `needs_human` count went up → `attention` key `needs-human:<instance>`, version = the
    count, title "<instance>: a reply needs you" (with Harvey's conversation summary when
    `/api/conversations` gives one). Count back to 0 → `clear`.
  - a `tone: "bad"` item whose `key` was not there before → `attention`
    `item:<instance>:<key>` with Harvey's title and detail; gone → `clear`.
  - Harvey was running (or reachable) at the last reading and is not now → `attention`
    `down:<instance>`, "Harvey stopped on :<port>"; back up → `clear`.
  - `outbox_pending` → `badge('outbox:<instance>', n, 'to approve')`.
  - Never notified: sent emails, prospecting progress, spend.

**View** (Preact, `@forge-dev/ui` only)

- Header: instance selector (hidden with one instance), status pill (running / stopped /
  unreachable, sending active / paused with a Pause|Resume button), "Open Harvey
  dashboard" linking to `http://localhost:<port>` in a new tab.
- Tabs: **Today** (Harvey's `/api/today` items and stats, needs-human first), **Outbox**
  (pending with Approve, Edit, Reject, Approve all; approved and sent lists read-only),
  **Pipeline** (prospect counts by status; discover form: provider, queries, Estimate, a
  max-spend field prefilled with the estimate rounded up to the next 0.10, Run, a progress
  line from `live-status`, Stop).
- No instance configured: an empty state that opens settings. Instance unreachable: "Harvey
  is not running on :5555" with `cd <path> && .venv/bin/harvey dashboard` (and `harvey run`
  for the loop) to copy.

Response field names beyond those confirmed here (`/api/today` → `items[].key|tone|title|detail`,
`stats.needs_human|outbox_pending`; outbox rows → `id, to_email, subject, body, status`;
`/api/discover/estimate` → `estimated_cost, query_count`; `/api/discover/run` → `max_spend`):
verify during implementation against `harvey/dashboard.py`.

## Testing

- Core (Vitest, temp dirs, never the real `~/.forge` or `~/.cw`): fixture modules under
  `packages/core/test/fixtures/modules/` for: valid v1, legacy, bad JSON, schema error,
  incompatible sdk, missing sdk with v1 fields, server that throws on import, shell action
  without permission, duplicate id. Cover discovery order, template expansion (lists,
  empty, realpath escape), `PermissionError` paths, the effect protocol (token single-use,
  expiry, input mismatch), notification dedupe by version, job no-overlap and timeout,
  route error mapping, unload aborting jobs, events with harness fields.
- Console: a test (or a scripted check in the plan) that a fixture module view using hooks
  and a ui component renders through the import map, and that a throwing view stays in its
  boundary.
- CLI: install from a path into a temp prefix, list, remove, create then build.
- mod-harvey: its own Vitest suite against a fake Harvey HTTP server: token read per
  call, unreachable mapping, each action's Harvey call, `confirm` contents, and the watch
  job's notify decisions across readings.

## Acceptance

1. `forge module install ~/workspace/personal/forge-mod-harvey` (and later the npm name)
   on a running Forge: after a page refresh, "Harvey" is in the sidebar Modules group, no
   rebuild.
2. With one saludbot instance configured and Harvey's dashboard running, Today, Outbox
   and Pipeline show Harvey's data; the token never appears in browser devtools or Forge's
   DB.
3. Approve, Approve all and Run discover each show the confirmation with recipients or
   spend; Escape cancels and nothing is sent; `curl` on the run endpoint without a token
   gets 409.
4. A conversation moving to `needs_human` raises one browser notification and a red count
   on the Harvey entry within ~2 min; it does not repeat on the next poll.
5. Stopping Harvey's dashboard: the view says it is not running, the `down` notification
   fires once, nothing else breaks.
6. Each failure-mode row is reproduced with a fixture and behaves as the table says.
7. `forge module dev ./forge-mod-harvey` reloads view and server changes without
   restarting Forge.
8. `pnpm test` passes; mod-qa and the Qa page behave as before (legacy mode).

## Packages and publishing

- `@forge-dev/sdk` goes to 1.0.0 and `@forge-dev/ui` to 1.0.0, both built to `dist` with
  `exports` and types, publishable to npm. The public API of `ui` is exactly what
  `src/index.ts` exports; removing or breaking one of those is a major bump.
- The import map serves the versions bundled with the running Forge; a module declares
  `sdk` and `ui` as peer dependencies with `^1.0.0`.
- Every `npm publish` (sdk, ui, mod-harvey) is prepared and left to the user to run.
  Until they are published, mod-harvey depends on them with `link:` to the Forge checkout,
  and acceptance uses the path install.

## Team mode

v1 modules with a `server` or `view` are disabled in team mode (`FORGE_DB_URL` set or
`localOnly` false) with the reason "modules run only in local mode": a remote user would
otherwise drive `ctx.fs` and `ctx.shell` on the host. Legacy modules keep today's
behavior. The new tables are created in `db.ts` only; `IForgeDB` gains the methods and
`db-postgres.ts` throws "not available in team mode" for them.

## Calls made in this document (not discussed with the user)

- `external` actions run on the confirmed plan, never a fresh reading; mod-harvey's
  Approve all approves each confirmed id instead of calling Harvey's `approve-all`.
- `forge module install` shows permissions and asks before any package code runs, and
  installs with `--ignore-scripts`.
- `sdk` and `ui` become 1.0.0 public packages; publishing is left to the user.
- Modules with server or view code do not load in team mode.

- Module `id` is an explicit manifest field rather than the folder name.
- Settings list items cannot nest; no `secret` setting type.
- Module routes mount through one dispatcher so reload needs no Hono re-registration.
- Poll intervals: notifications 5 s (15 s hidden), modules 10 s, Harvey watch 2 min.
- mod-harvey declares no `shell` permission: pause/resume go through Harvey's API.
- `edit` and `reject` are `local`, not `external`: nothing leaves the machine.
- Max spend is prefilled with the estimate rounded up to the next US$0.10.

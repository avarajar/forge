# Module Authoring Guide

A Forge module is an npm package that adds a page to Forge's sidebar and code to Forge's server. It installs into a
running Forge with no rebuild:

```bash
forge module install @yourorg/mod-yourname
```

This guide covers SDK v1 (`@forge-dev/sdk` 1.0.0). The full list of types is in [sdk-reference.md](sdk-reference.md);
the design and its reasons are in `docs/superpowers/specs/2026-10-26-module-sdk-v1-design.md`. A real module built
on it is mod-harvey (`@forge-dev/mod-harvey`), a page for the Harvey sales agent.

---

## 1. Start from the scaffold

```bash
forge module create mod-yourname
cd mod-yourname
npm install && npm test
forge module dev .
```

`forge module dev` loads the folder into the running Forge, rebuilds on change and reloads the module: edit
`src/view.tsx` or `src/server.ts` and the page updates on its own (within about 10 seconds) without restarting Forge.
Ctrl-C unloads it.

```
mod-yourname/
  package.json        "forge": { "manifest": "forge-module.json" }
  forge-module.json   what the module is and what it may touch
  build.mjs           esbuild: dist/server.js for Node, dist/view.js for the browser
  src/server.ts       default export defineModule({...})
  src/view.tsx        default export definePanel({...})
```

A module can have only a server half, only a view, or both. Its `package.json` needs `"type": "module"` (the scaffold has it): Forge refuses a `.js` server under a `package.json` that says CommonJS.

---

## 2. The manifest

```jsonc
{
  "id": "harvey",                      // [a-z][a-z0-9-]{1,31}, used in URLs; unique
  "name": "@forge-dev/mod-harvey",     // npm name
  "version": "0.1.0",
  "sdk": "^1.0.0",                     // semver range Forge checks against its SDK
  "displayName": "Harvey",
  "description": "Outbound sales agent",
  "icon": "mail",
  "color": "#e8a33d",
  "server": "./dist/server.js",
  "view": { "entry": "./dist/view.js", "title": "Harvey" },
  "permissions": {
    "network": ["http://localhost:{instances[].port}"],
    "fs:read": ["{instances[].path}/data/dashboard-token"]
  },
  "settings": {
    "schema": {
      "instances": {
        "type": "list",
        "label": "Harvey instances",
        "item": {
          "name": { "type": "string", "required": true, "pattern": "^[a-z0-9-]+$" },
          "path": { "type": "string", "required": true, "format": "path" },
          "port": { "type": "number", "default": 5555 }
        }
      }
    }
  }
}
```

The schema is `@forge-dev/sdk/forge-module.schema.json`. A manifest that fails it, whose `sdk` range does not match
Forge's SDK, or whose `server.js` throws when imported, is listed as disabled with the reason, in the sidebar and in
`forge module list`. Everything else keeps working.

**Settings** types: `string` (with `pattern`, `format: path | cw-project | url`), `number` (`min`, `max`), `boolean`,
`enum` (`values`), and `list` of objects made of those (lists do not nest). Forge builds the settings form from the
schema, validates on save and answers with the path of each error. Never put a secret in settings: read it from where
the tool keeps it, through `fs:read`.

---

## 3. Permissions

| Permission | Value | Checked by |
|---|---|---|
| `network` | origins, `scheme://host:port` | `ctx.fetch` (any path on that origin) |
| `fs:read` | a file, or a folder ending in `/` | `ctx.fs.read`, `ctx.fs.list` |
| `fs:write` | same | `ctx.fs.write` |
| `shell` | executables | `ctx.shell.exec`, shell actions |
| `pty` | `true` | `ctx.pty.spawn` |

`{key}` fills in a setting and `{list[].field}` gives one grant per list item. A grant whose setting is empty is
dropped, never widened, and a value that would change the literal part (`evil.com#` in a host, `..` in the middle
of a path) drops the grant too. Paths are compared after resolving symlinks. A call outside the grants throws
`PermissionError`, the route answers 403, and the module shows a warning with the last denial.

**Permissions are a contract, not a sandbox.** Module code runs inside Forge's process: code that imports `node:fs`
itself is not checked. `forge module install` prints the permissions and asks before installing, and installs with
`--ignore-scripts`, but installing a module is trusting it.

---

## 4. The server half

```ts
import { defineModule, defineRoute, defineAction, defineJob, onEvent, ModuleError } from '@forge-dev/sdk'

export default defineModule({
  routes: [
    defineRoute({ method: 'GET', path: '/instances/:name/today', handler: async (req, ctx) => {
      const res = await ctx.fetch(`http://localhost:5555/api/today`)
      if (!res.ok) throw new ModuleError('upstream', `Harvey answered ${res.status}`)
      return res.json()
    } }),
  ],
  actions: [ /* section 5 */ ],
  jobs: [
    defineJob({ id: 'watch', every: '2m', enabled: s => (s.instances as unknown[]).length > 0, run: async (ctx) => {
      await ctx.notify.badge('outbox', 3, 'to approve')
    } }),
  ],
  events: [
    onEvent('session.started', (s, ctx) => ctx.log.info(`${s.project} started on ${s.harness}`)),
  ],
})
```

- **Routes** are mounted at `/api/modules/<id>/<path>` and answer JSON. `settings`, `actions`, `view.js`, `status`,
  `notifications` and `reload` are reserved first segments. Throw `ModuleError(code, message)` for expected failures:
  `bad_request` → 400, `unauthorized` → 401, `not_found` → 404, `unreachable` and `upstream` → 502. Anything else
  becomes `500 { code: 'module_error' }` and never stops the server.
- **Jobs** run once at load and then every `every` (30 s minimum), one run at a time; a run still going at its next
  tick is aborted through `ctx.signal`. Failures show as a warning on the module.
- **Events**: `session.started`, `session.ended`, `task.done`, `project.registered`, `harness.changed`,
  `module.settings.changed`. Session payloads carry `harness`, `provider` and `model`. Handlers run after the event,
  with 10 s each.
- **`ctx`** gives `settings`, `sessions`, `projects`, `accounts`, `git.status`, `storage` (JSON, scoped to the module),
  `notify`, `fetch`, `fs`, `shell.exec(command, args)` (never a shell string), `pty` and `log`.

Bundle the SDK into `dist/server.js` (the scaffold does); Forge recognises its errors by name and code.

---

## 5. Actions and their effect

Every action declares what it does to the world:

| `effect` | Means | Forge does |
|---|---|---|
| `read` | changes nothing | runs it |
| `local` | changes state on this machine | runs it |
| `external` | a third party receives something, or money is spent | shows its confirmation first, always |

```ts
defineAction<{ instance: string }>({
  id: 'approve-all',
  label: 'Approve all',
  effect: 'external',
  input: { instance: { type: 'string', required: true } },
  confirm: async (input, ctx) => ({
    title: 'Send 3 emails',
    items: [{ label: 'To dra@clinic.co', detail: 'Subject: …' }],
    confirmLabel: 'Send 3 emails',
    plan: [{ id: 'a', hash: '…' }],   // kept by Forge, never sent to the browser
  }),
  run: async (input, ctx) => {
    // act only on ctx.confirmed: what the user saw, not a fresh reading
  },
})
```

For `external`, Forge calls `confirm`, shows its title, items and button in its own dialog, and runs only with a
single-use token bound to that input (two minutes). Without it the server answers `409 confirmation_required`, so a
script or a stray click cannot skip the step. `run` receives the `plan` as `ctx.confirmed`: act on that, and skip
anything that changed since, instead of sending something the user never saw.

Shell actions use `run: shell('tool', ['arg'])` and need the `shell` permission.

---

## 6. The view

```tsx
import { useEffect, useState } from 'preact/hooks'
import { ActionButton } from '@forge-dev/ui'
import { definePanel, type PanelProps } from '@forge-dev/sdk'

function View({ forge }: PanelProps) {
  const [today, setToday] = useState<unknown>(null)
  useEffect(() => { forge.route('/instances/saludbot/today').then(setToday) }, [forge])
  return (
    <div style={{ padding: '22px', color: 'var(--ink)' }}>
      <ActionButton label="Approve all" onClick={() => forge.action('approve-all', { instance: 'saludbot' })} />
    </div>
  )
}

export default definePanel({ id: 'main', title: 'Harvey', component: View })
```

- Each module with a view gets an entry in the sidebar's **Modules** group. The entry shows a red count of unseen
  attention notifications and a grey count of badges.
- `forge.route(path, init?)` calls your routes and throws `ModuleRequestError { code, message }`.
  `forge.action(id, input, { onOutput })` runs an action, going through the confirmation for `external` ones; it
  resolves `undefined` when the user cancels. `forge.settings` and `forge.status` are signals; `forge.openSettings()`
  opens the settings form.
- `preact`, `preact/hooks`, `preact/jsx-runtime`, `preact/compat`, `@preact/signals`, `@forge-dev/ui` and
  `@forge-dev/sdk` come from Forge through an import map: mark them external in your build (the scaffold does), so
  there is one Preact.
- **Styling:** Forge's UnoCSS generates classes from Forge's own sources only, so utility classes in your bundle do
  nothing. Use inline `style` with the theme tokens (`var(--card)`, `var(--ink-2)`, `var(--hair)`, `var(--red)`…) and
  `@forge-dev/ui` components.
- A view that throws shows an error card in its own area with **Reload view**; the rest of Forge keeps working.

Module views run only in the built console that Forge serves (port 3000), not under the Vite dev server.

---

## 7. Notifications

```ts
await ctx.notify.attention({ key: 'needs-human:saludbot', title: 'saludbot: a reply needs you', version: '1' })
await ctx.notify.badge('outbox:saludbot', 3, 'to approve')
await ctx.notify.clear('needs-human:saludbot')
```

`attention` raises a browser notification (when the user turned notifications on) and a red count. Calling it again
with the same key and `version` does nothing, so a job can call it on every run; a new version alerts again. Opening
the module's page marks its items seen. Keep `attention` for what costs something to wait on.

---

## 8. Install, list, remove, publish

```bash
forge module install <npm-name | folder | git-url> [--yes]
forge module list
forge module remove <id | package name>
```

Forge finds modules, first match by `id` wins: the modules it ships with, folders registered by `forge module dev`,
folders in `~/.forge/modules/<dir>`, packages in `~/.forge/modules/node_modules` with a `forge` field in
`package.json`, and `@forge-dev/mod-*` packages next to Forge itself.

To publish, set `@forge-dev/sdk` and `@forge-dev/ui` to `^1.0.0` (a scaffold made from a Forge checkout links the
local ones), then `npm run build && npm publish`.

### Legacy manifests

A manifest with no `sdk` and no `server`, `view` or `permissions` still loads as before: shell `actions` run through
`/api/actions`, with `params` reaching the command only as `FORGE_PARAM_<NAME>` environment variables. mod-qa works
this way. Modules with a server or a view do not load in team mode (`FORGE_DB_URL`).

# Harness-Aware Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Forge user pick the harness for a task, see which harness each session runs on, and connect each account to each harness without typing a command.

**Architecture:** Core reads `cw doctor --json` through one shared client and exposes it with a copied capability table at `GET /api/cw/harnesses`. New sessions carry the chosen harness into a pure `buildLaunch` that adds `--harness` only for new sessions and strips `CW_HARNESS` from every child env. The console keeps one shared harness store that feeds the New Task selector, badges, filter and a new Accounts screen; codex logins run in a hidden PTY owned by `LoginManager`.

**Tech Stack:** Hono, node-pty, Vitest (core), Preact + `@preact/signals` + UnoCSS (console), TypeScript strict, ESM.

**Spec:** `docs/specs/2026-09-11-harness-integration.md` (brief: `docs/plans/2026-09-11-harness-integration-brief.md`, mockup: `docs/specs/harness-picker.html`)

## Global Constraints

- CW 0.3.0 must be installed; when `cw doctor --json` is unavailable Forge behaves exactly as today.
- Forge never writes `harness`, `harness_session_id` or `provider` into `session.json`.
- Never pass `--harness` or set `CW_HARNESS` when resuming; only a new General session sets `CW_HARNESS`.
- Gate on capabilities, never on harness names.
- Spawn with args arrays; the existing `sh -c` command string in `pty-manager.ts` keeps `shellQuote` for every value.
- The API key never goes through a PTY, argv, logs, or storage.
- Poll `cw doctor --json` no faster than every 3 s.
- Tests never run the real `cw` and never touch `~/.cw` or `~/.forge`; they use temp dirs and fake `cw` scripts.
- Preact, not React; UnoCSS utilities; shared console config only in `config/types.ts`.
- Comments: one short line, only when the why is non-obvious; no task, branch or PR references.
- Commits: conventional style (`feat(core):`, `feat(console):`, `test:`, `docs:`), signed, no Claude attribution.
- Run core tests with `pnpm --filter @forge-dev/core exec vitest run <file>`; type-check the console with `pnpm --dir packages/console exec tsc --noEmit -p .`.

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/cw-types.ts` | CW JSON shapes (doctor, session, project) |
| `packages/core/src/harness-capabilities.ts` | Capability table and `supports()` |
| `packages/core/src/cw-doctor.ts` | Shared `cw doctor --json` client, env stripping, context token detection |
| `packages/core/src/cw-reader.ts` | Harness defaults on read |
| `packages/core/src/pty-manager.ts` | Pure `buildLaunch`, spawn with its env |
| `packages/core/src/pty-routes.ts` | New vs. resume decision |
| `packages/core/src/cw-routes.ts` | `/harnesses`, `/start` harness + login, accounts endpoints |
| `packages/core/src/login-manager.ts` | Hidden device-login PTYs and their parsed state |
| `packages/core/src/server.ts` | Owns `LoginManager`, disposes it on close |
| `packages/core/src/__fixtures__/cw-0.3.0/` | CW 0.3.0 JSON fixtures |
| `packages/console/src/config/types.ts` | `HARNESS_STYLES`, `harnessLabel`, `resolveHarness`, `CLAUDE_MODELS`, login style |
| `packages/console/src/styles/theme.css` | Harness color variables |
| `packages/console/src/hooks/useHarnesses.ts` | Shared harness store and polling |
| `packages/console/src/components/HarnessBadge.tsx` | Badge component |
| `packages/console/src/components/HarnessPicker.tsx` | Selector used by New Task |
| `packages/console/src/pages/NewTask.tsx` | Harness block, model, skip permissions, notice |
| `packages/console/src/pages/Accounts.tsx` | Matrix, Connect flows, add account |
| `packages/console/src/components/AccountCell.tsx` | One matrix cell |
| `packages/console/src/components/DeviceLoginPanel.tsx` | Codex device code + API key panel |

Console tasks have no Vitest setup (out of scope per spec §8). Their verification is `tsc --noEmit`, the console build, and a browser check against a worktree Forge on `FORGE_PORT=3100`.

---

### Task 1: Types, capability table and reader defaults

**Files:**
- Modify: `packages/core/src/cw-types.ts`
- Create: `packages/core/src/harness-capabilities.ts`
- Create: `packages/core/src/harness-capabilities.test.ts`
- Modify: `packages/core/src/cw-reader.ts:34-36,52-54`
- Modify: `packages/core/src/cw-reader.test.ts` (append a describe block)
- Create: `packages/core/src/__fixtures__/cw-0.3.0/doctor-two-accounts.json`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `Capability`, `HARNESS_CAPABILITIES`, `supports(harness: string | undefined, cap: Capability): boolean`; types `HarnessStatus`, `ProviderKind`, `CWDoctorHarness`, `CWLocalDetail`, `CWDoctorCell`, `CWDoctorAccount`, `CWDoctorFinding`, `CWDoctor`; `CWSession.harness/harness_session_id/provider`, `CWSession.type` includes `'login'`; `CWProject.harness`.

- [ ] **Step 1: Write the failing capability test**

`packages/core/src/harness-capabilities.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { HARNESS_CAPABILITIES, supports } from './harness-capabilities.js'

describe('harness capabilities', () => {
  it('matches the capability table in the brief', () => {
    expect(HARNESS_CAPABILITIES).toEqual({
      claude: ['skip_permissions', 'agent_teams', 'slash_commands', 'mcp', 'model_flag', 'resume_by_name', 'continue_last'],
      codex: ['headless_login', 'api_key_login', 'custom_provider', 'model_flag', 'continue_last'],
      pi: ['model_flag'],
      opencode: ['custom_provider', 'model_flag'],
    })
  })

  it('treats an undefined harness as claude', () => {
    expect(supports(undefined, 'agent_teams')).toBe(true)
  })

  it('reports nothing for an unknown harness', () => {
    expect(supports('echoagent', 'model_flag')).toBe(false)
  })

  it('answers per harness', () => {
    expect(supports('codex', 'headless_login')).toBe(true)
    expect(supports('codex', 'skip_permissions')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @forge-dev/core exec vitest run src/harness-capabilities.test.ts`
Expected: FAIL, cannot resolve `./harness-capabilities.js`.

- [ ] **Step 3: Implement the table**

`packages/core/src/harness-capabilities.ts`:

```ts
export type Capability =
  | 'skip_permissions' | 'agent_teams' | 'slash_commands' | 'mcp'
  | 'headless_login' | 'api_key_login' | 'custom_provider' | 'model_flag'
  | 'resume_by_name' | 'continue_last'

// Copied from the CW drivers because cw doctor --json does not expose capabilities
export const HARNESS_CAPABILITIES: Record<string, readonly Capability[]> = {
  claude: ['skip_permissions', 'agent_teams', 'slash_commands', 'mcp', 'model_flag', 'resume_by_name', 'continue_last'],
  codex: ['headless_login', 'api_key_login', 'custom_provider', 'model_flag', 'continue_last'],
  pi: ['model_flag'],
  opencode: ['custom_provider', 'model_flag'],
}

export function supports(harness: string | undefined, cap: Capability): boolean {
  return (HARNESS_CAPABILITIES[harness ?? 'claude'] ?? []).includes(cap)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @forge-dev/core exec vitest run src/harness-capabilities.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the CW types**

In `packages/core/src/cw-types.ts`, add `harness?: string` to `CWProject` after `type`. In `CWSession`, change the `type` line and add three fields after `account`:

```ts
  type: 'task' | 'review' | 'general' | 'create' | 'loop' | 'login'
  account: string
  harness?: string
  harness_session_id?: string
  provider?: string
```

Append after `CWConfig`:

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

- [ ] **Step 6: Add the captured doctor fixture**

Captured from CW 0.3.0 on 2026-09-12 against a scratch `CW_HOME` with `cw account add work` and `cw account add personal --harness codex`; paths scrubbed to `/tmp/cw-home`.

`packages/core/src/__fixtures__/cw-0.3.0/doctor-two-accounts.json`:

```json
{
  "schema": 1,
  "cw_version": "0.3.0",
  "cw_home": "/tmp/cw-home",
  "generated": "2026-09-12T21:27:41Z",
  "harnesses": [
    { "name": "claude", "installed": true, "path": "/usr/local/bin/claude", "version": "2.1.270 (Claude Code)", "source": "builtin" },
    { "name": "codex", "installed": true, "path": "/opt/homebrew/bin/codex", "version": "codex-cli 0.154.0", "source": "builtin" },
    { "name": "pi", "installed": false, "path": null, "version": null, "source": "builtin" },
    { "name": "opencode", "installed": false, "path": null, "version": null, "source": "builtin" }
  ],
  "accounts": [
    {
      "name": "personal",
      "root": "/tmp/cw-home/accounts/personal",
      "layout": "none",
      "default_harness": "codex",
      "harnesses": [
        { "harness": "claude", "status": "not_logged_in", "detail": null, "config_env": "CLAUDE_CONFIG_DIR", "config_dir": "/tmp/cw-home/accounts/personal", "provider": "native", "provider_kind": "native", "model": null, "unofficial": false, "has_api_key": false },
        { "harness": "codex", "status": "not_logged_in", "detail": null, "config_env": "CODEX_HOME", "config_dir": "/tmp/cw-home/accounts/personal/codex", "provider": "native", "provider_kind": "native", "model": null, "unofficial": false, "has_api_key": false },
        { "harness": "pi", "status": "not_installed", "detail": "pi not found on PATH", "config_env": "PI_CODING_AGENT_DIR", "config_dir": "/tmp/cw-home/accounts/personal/pi", "provider": "native", "provider_kind": "native", "model": null, "unofficial": false, "has_api_key": false },
        { "harness": "opencode", "status": "not_installed", "detail": "opencode not found on PATH", "config_env": "OPENCODE_DATA_DIR\nOPENCODE_CONFIG", "config_dir": "/tmp/cw-home/accounts/personal/opencode", "provider": "native", "provider_kind": "native", "model": null, "unofficial": false, "has_api_key": false }
      ]
    },
    {
      "name": "work",
      "root": "/tmp/cw-home/accounts/work",
      "layout": "none",
      "default_harness": "claude",
      "harnesses": [
        { "harness": "claude", "status": "not_logged_in", "detail": null, "config_env": "CLAUDE_CONFIG_DIR", "config_dir": "/tmp/cw-home/accounts/work", "provider": "native", "provider_kind": "native", "model": null, "unofficial": false, "has_api_key": false },
        { "harness": "codex", "status": "not_logged_in", "detail": null, "config_env": "CODEX_HOME", "config_dir": "/tmp/cw-home/accounts/work/codex", "provider": "native", "provider_kind": "native", "model": null, "unofficial": false, "has_api_key": false },
        { "harness": "pi", "status": "not_installed", "detail": "pi not found on PATH", "config_env": "PI_CODING_AGENT_DIR", "config_dir": "/tmp/cw-home/accounts/work/pi", "provider": "native", "provider_kind": "native", "model": null, "unofficial": false, "has_api_key": false },
        { "harness": "opencode", "status": "not_installed", "detail": "opencode not found on PATH", "config_env": "OPENCODE_DATA_DIR\nOPENCODE_CONFIG", "config_dir": "/tmp/cw-home/accounts/work/opencode", "provider": "native", "provider_kind": "native", "model": null, "unofficial": false, "has_api_key": false }
      ]
    }
  ],
  "issues": [],
  "warnings": [
    { "code": "no_projects", "message": "No projects — run cw project register" }
  ]
}
```

- [ ] **Step 7: Write the failing reader test**

Append to `packages/core/src/cw-reader.test.ts`:

```ts
describe('CWReader harness fields', () => {
  const DIR = join(import.meta.dirname, '../.test-cw-harness')

  beforeAll(() => {
    mkdirSync(join(DIR, 'sessions/app/task-legacy'), { recursive: true })
    mkdirSync(join(DIR, 'sessions/app/task-codex'), { recursive: true })
    writeFileSync(join(DIR, 'sessions/app/task-legacy/session.json'), JSON.stringify({
      project: 'app', task: 'legacy', type: 'task', account: 'work', worktree: '', notes: '',
      status: 'active', created: '2026-07-02T21:33:18Z', last_opened: '2026-07-03T20:40:54Z', opens: 2,
    }))
    writeFileSync(join(DIR, 'sessions/app/task-codex/session.json'), JSON.stringify({
      project: 'app', task: 'codex', type: 'task', account: 'glm', harness: 'opencode',
      harness_session_id: 'ses_123', provider: 'zai', model: 'glm-5.1', worktree: '', notes: '',
      status: 'active', created: '2026-09-11T18:25:59Z', last_opened: '2026-09-11T18:25:59Z', opens: 1,
    }))
  })

  afterAll(() => rmSync(DIR, { recursive: true, force: true }))

  it('reads a pre-0.3.0 session as claude on the native provider', () => {
    const session = new CWReader(DIR).getSession('app', 'task-legacy')
    expect(session?.harness).toBe('claude')
    expect(session?.provider).toBe('native')
  })

  it('keeps the harness fields CW recorded', () => {
    const spaces = new CWReader(DIR).getSpaces('app')
    const codex = spaces.find(s => s.task === 'codex')
    expect(codex).toMatchObject({ harness: 'opencode', harness_session_id: 'ses_123', provider: 'zai', model: 'glm-5.1' })
    expect(spaces.find(s => s.task === 'legacy')?.harness).toBe('claude')
  })
})
```

- [ ] **Step 8: Run it to verify it fails**

Run: `pnpm --filter @forge-dev/core exec vitest run src/cw-reader.test.ts`
Expected: FAIL, `expected undefined to be 'claude'`.

- [ ] **Step 9: Fill the defaults in the reader**

In `packages/core/src/cw-reader.ts`, add above `export class CWReader`:

```ts
const withHarnessDefaults = (session: CWSession): CWSession =>
  ({ ...session, harness: session.harness ?? 'claude', provider: session.provider ?? 'native' })
```

In `getSpaces`, replace `sessions.push(data)` with `sessions.push(withHarnessDefaults(data))`. In `getSession`, replace `return data` with `return withHarnessDefaults(data)`.

- [ ] **Step 10: Export the new types**

In `packages/core/src/index.ts`, replace the `CWProject` export line with:

```ts
export type { CWProject, CWSession, CWConfig, StackDetection } from './cw-types.js'
export type { HarnessStatus, ProviderKind, CWDoctor, CWDoctorHarness, CWDoctorAccount, CWDoctorCell, CWDoctorFinding, CWLocalDetail } from './cw-types.js'
export { HARNESS_CAPABILITIES, supports } from './harness-capabilities.js'
export type { Capability } from './harness-capabilities.js'
```

- [ ] **Step 11: Run the core suite and build**

Run: `pnpm --filter @forge-dev/core test && pnpm --filter @forge-dev/core build`
Expected: all tests PASS, `tsc` exits 0.

- [ ] **Step 12: Commit**

```bash
git add packages/core/src/cw-types.ts packages/core/src/harness-capabilities.ts packages/core/src/harness-capabilities.test.ts packages/core/src/cw-reader.ts packages/core/src/cw-reader.test.ts packages/core/src/__fixtures__ packages/core/src/index.ts
git commit -m "feat(core): read harness fields and add the harness capability table"
```

---

### Task 2: Doctor client and `GET /api/cw/harnesses`

**Files:**
- Create: `packages/core/src/cw-doctor.ts`
- Create: `packages/core/src/cw-doctor.test.ts`
- Modify: `packages/core/src/cw-routes.ts` (imports, a client next to `cwBin`, one route)
- Modify: `packages/core/src/cw-routes.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `CWDoctor` (Task 1), `HARNESS_CAPABILITIES` (Task 1).
- Produces: `envWithoutHarness(env?: NodeJS.ProcessEnv): Record<string, string>`; `createDoctorClient(cwBin: string): { get(fresh?: boolean): Promise<DoctorResult> }`; `type DoctorResult = { available: true; doctor: CWDoctor } | { available: false; reason: string }`; `readContextTokens(cwHome: string, env?: NodeJS.ProcessEnv): { linear: boolean; notion: boolean }`; route `GET /api/cw/harnesses[?fresh=1]` returning `{ available: true, doctor, capabilities: Record<string, Capability[]>, contextTokens }` or `{ available: false, reason }`.

- [ ] **Step 1: Write the failing doctor client tests**

`packages/core/src/cw-doctor.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { createDoctorClient, envWithoutHarness, readContextTokens } from './cw-doctor.js'

const DIR = join(import.meta.dirname, '../.test-cw-doctor')
const FIXTURE = join(import.meta.dirname, '__fixtures__/cw-0.3.0/doctor-two-accounts.json')
const COUNT = join(DIR, 'count')

const fakeCw = (name: string, body: string): string => {
  const path = join(DIR, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

const runs = () => existsSync(COUNT) ? readFileSync(COUNT, 'utf-8').trim().split('\n').length : 0

describe('cw doctor client', () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })
  })

  afterAll(() => rmSync(DIR, { recursive: true, force: true }))

  it('parses the captured CW 0.3.0 output', async () => {
    const result = await createDoctorClient(fakeCw('cw', `cat '${FIXTURE}'`)).get()
    expect(result.available).toBe(true)
    if (result.available) expect(result.doctor.accounts.map(a => a.default_harness)).toEqual(['codex', 'claude'])
  })

  it('is unavailable for an unknown schema', async () => {
    const result = await createDoctorClient(fakeCw('cw', `echo '{"schema":2}'`)).get()
    expect(result).toEqual({ available: false, reason: 'unsupported doctor schema 2' })
  })

  it('is unavailable when cw exits non-zero', async () => {
    const result = await createDoctorClient(fakeCw('cw', 'echo usage >&2; exit 1')).get()
    expect(result.available).toBe(false)
  })

  it('is unavailable when cw prints something other than JSON', async () => {
    const result = await createDoctorClient(fakeCw('cw', 'echo "Unknown command: doctor --json"')).get()
    expect(result).toEqual({ available: false, reason: 'cw doctor --json did not print JSON' })
  })

  it('is unavailable when the cw binary is missing', async () => {
    const result = await createDoctorClient(join(DIR, 'missing-cw')).get()
    expect(result.available).toBe(false)
  })

  it('runs one process for concurrent callers', async () => {
    const client = createDoctorClient(fakeCw('cw', `echo run >> '${COUNT}'; sleep 0.2; cat '${FIXTURE}'`))
    await Promise.all([client.get(), client.get(), client.get()])
    expect(runs()).toBe(1)
  })

  it('reuses a result for 2 s unless fresh is asked for', async () => {
    const client = createDoctorClient(fakeCw('cw', `echo run >> '${COUNT}'; cat '${FIXTURE}'`))
    await client.get()
    await client.get()
    expect(runs()).toBe(1)
    await client.get(true)
    expect(runs()).toBe(2)
  })

  it('never passes CW_HARNESS to cw', async () => {
    const previous = process.env.CW_HARNESS
    process.env.CW_HARNESS = 'codex'
    try {
      const client = createDoctorClient(fakeCw('cw', `[ -z "$CW_HARNESS" ] && cat '${FIXTURE}' || echo '{"schema":9}'`))
      expect((await client.get()).available).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.CW_HARNESS
      else process.env.CW_HARNESS = previous
    }
  })
})

describe('envWithoutHarness', () => {
  it('drops CW_HARNESS and undefined values only', () => {
    expect(envWithoutHarness({ PATH: '/bin', CW_HARNESS: 'pi', EMPTY: undefined })).toEqual({ PATH: '/bin' })
  })
})

describe('readContextTokens', () => {
  const HOME = join(import.meta.dirname, '../.test-cw-tokens')

  beforeEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    mkdirSync(HOME, { recursive: true })
  })

  afterAll(() => rmSync(HOME, { recursive: true, force: true }))

  it('reads tokens from the environment', () => {
    expect(readContextTokens(HOME, { LINEAR_API_KEY: 'lin_x' })).toEqual({ linear: true, notion: false })
  })

  it('reads tokens from tokens.env, with or without export', () => {
    writeFileSync(join(HOME, 'tokens.env'), 'export NOTION_TOKEN=secret\n# LINEAR_API_KEY=commented\n')
    expect(readContextTokens(HOME, {})).toEqual({ linear: false, notion: true })
  })

  it('ignores empty values', () => {
    writeFileSync(join(HOME, 'tokens.env'), 'LINEAR_API_KEY=\n')
    expect(readContextTokens(HOME, { NOTION_TOKEN: '  ' })).toEqual({ linear: false, notion: false })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @forge-dev/core exec vitest run src/cw-doctor.test.ts`
Expected: FAIL, cannot resolve `./cw-doctor.js`.

- [ ] **Step 3: Implement the client**

`packages/core/src/cw-doctor.ts`:

```ts
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CWDoctor } from './cw-types.js'

export type DoctorResult = { available: true; doctor: CWDoctor } | { available: false; reason: string }

const CACHE_MS = 2000
const TIMEOUT_MS = 15000

export function envWithoutHarness(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && key !== 'CW_HARNESS') out[key] = value
  }
  return out
}

function runDoctor(cwBin: string): Promise<DoctorResult> {
  return new Promise((resolve) => {
    execFile(cwBin, ['doctor', '--json'], { timeout: TIMEOUT_MS, env: envWithoutHarness(), maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ available: false, reason: err.message })
      let parsed: { schema?: unknown }
      try {
        parsed = JSON.parse(stdout) as { schema?: unknown }
      } catch {
        return resolve({ available: false, reason: 'cw doctor --json did not print JSON' })
      }
      if (parsed.schema !== 1) return resolve({ available: false, reason: `unsupported doctor schema ${String(parsed.schema)}` })
      resolve({ available: true, doctor: parsed as CWDoctor })
    })
  })
}

export function createDoctorClient(cwBin: string) {
  let inFlight: Promise<DoctorResult> | null = null
  let cached: { at: number; result: DoctorResult } | null = null

  return {
    get(fresh = false): Promise<DoctorResult> {
      if (inFlight) return inFlight
      if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.result)
      inFlight = runDoctor(cwBin).then((result) => {
        cached = { at: Date.now(), result }
        inFlight = null
        return result
      })
      return inFlight
    },
  }
}

export function readContextTokens(cwHome: string, env: NodeJS.ProcessEnv = process.env): { linear: boolean; notion: boolean } {
  const file = join(cwHome, 'tokens.env')
  const text = existsSync(file) ? readFileSync(file, 'utf-8') : ''
  const has = (name: string) =>
    Boolean(env[name]?.trim()) || new RegExp(`^\\s*(export\\s+)?${name}\\s*=\\s*\\S`, 'm').test(text)
  return { linear: has('LINEAR_API_KEY'), notion: has('NOTION_TOKEN') }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @forge-dev/core exec vitest run src/cw-doctor.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Write the failing route test**

Append to `packages/core/src/cw-routes.test.ts` (the imports at the top already include `mkdirSync`, `writeFileSync`, `rmSync`, `join`; add `chmodSync` to the `node:fs` import and `beforeAll`/`afterAll` are already imported):

```ts
describe('GET /api/cw/harnesses', () => {
  const DIR = join(import.meta.dirname, '../.test-cw-harnesses')
  const FIXTURE = join(import.meta.dirname, '__fixtures__/cw-0.3.0/doctor-two-accounts.json')
  let app: Hono
  let previousLinear: string | undefined

  beforeAll(() => {
    previousLinear = process.env.LINEAR_API_KEY
    delete process.env.LINEAR_API_KEY
    mkdirSync(join(DIR, 'bin'), { recursive: true })
    writeFileSync(join(DIR, 'bin/cw'), `#!/bin/sh\ncat '${FIXTURE}'\n`)
    chmodSync(join(DIR, 'bin/cw'), 0o755)
    writeFileSync(join(DIR, 'tokens.env'), 'NOTION_TOKEN=secret-notion\n')
    app = new Hono()
    app.route('/api/cw', cwRoutes(new CWReader(DIR)))
  })

  afterAll(() => {
    if (previousLinear !== undefined) process.env.LINEAR_API_KEY = previousLinear
    rmSync(DIR, { recursive: true, force: true })
  })

  it('returns doctor, capabilities per harness and token presence only', async () => {
    const res = await app.request('/api/cw/harnesses')
    const text = await res.text()
    const body = JSON.parse(text) as { available: boolean; capabilities: Record<string, string[]>; contextTokens: unknown; doctor: { accounts: unknown[] } }
    expect(body.available).toBe(true)
    expect(body.doctor.accounts).toHaveLength(2)
    expect(body.capabilities.codex).toContain('headless_login')
    expect(body.capabilities.pi).toEqual(['model_flag'])
    expect(body.contextTokens).toEqual({ linear: false, notion: true })
    expect(text).not.toContain('secret-notion')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @forge-dev/core exec vitest run src/cw-routes.test.ts -t harnesses`
Expected: FAIL with status 404 / JSON parse error.

- [ ] **Step 7: Add the route**

In `packages/core/src/cw-routes.ts` add imports:

```ts
import { createDoctorClient, readContextTokens } from './cw-doctor.js'
import { HARNESS_CAPABILITIES } from './harness-capabilities.js'
```

Right after the `cwBin` IIFE add:

```ts
  const doctor = createDoctorClient(cwBin)

  app.get('/harnesses', async (c) => {
    const result = await doctor.get(c.req.query('fresh') === '1')
    if (!result.available) return c.json(result)
    const capabilities = Object.fromEntries(
      result.doctor.harnesses.map(h => [h.name, [...(HARNESS_CAPABILITIES[h.name] ?? [])]])
    )
    return c.json({ ...result, capabilities, contextTokens: readContextTokens(reader.cwHome) })
  })
```

- [ ] **Step 8: Run the core suite**

Run: `pnpm --filter @forge-dev/core test`
Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/cw-doctor.ts packages/core/src/cw-doctor.test.ts packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts
git commit -m "feat(core): expose cw doctor, capabilities and context tokens at /api/cw/harnesses"
```

---

### Task 3: Launch rules and new-vs-resume

**Files:**
- Modify: `packages/core/src/pty-manager.ts:56-126` (replace private `buildCommand`, pass env and options)
- Create: `packages/core/src/pty-launch.test.ts`
- Modify: `packages/core/src/pty-routes.ts:41-75`
- Modify: `packages/core/src/pty-routes.test.ts` (append tests)

**Interfaces:**
- Consumes: `envWithoutHarness` (Task 2), `supports` (Task 1), `CWSession.harness` and `'login'` type (Task 1).
- Produces: `export interface Launch { command: string; env: Record<string, string> }`; `export function buildLaunch(session: CWSession, isNew: boolean): Launch`; `PTYManager.getOrCreate(project, sessionDir, session, options?: { isNew?: boolean })`; `export function takeSession(reader: CWReader, project: string, sessionDir: string): { session: CWSession; isNew: boolean } | null`.

- [ ] **Step 1: Write the failing launch tests**

`packages/core/src/pty-launch.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { buildLaunch } from './pty-manager.js'
import type { CWSession } from './cw-types.js'

const session = (overrides: Partial<CWSession>): CWSession => ({
  project: 'app', task: 'fix', type: 'task', account: 'work', worktree: '', notes: '',
  status: 'active', created: '', last_opened: '', opens: 0, ...overrides,
})

describe('buildLaunch', () => {
  const previous = process.env.CW_HARNESS
  afterEach(() => {
    if (previous === undefined) delete process.env.CW_HARNESS
    else process.env.CW_HARNESS = previous
  })

  it('adds --harness to a new task', () => {
    expect(buildLaunch(session({ harness: 'codex' }), true).command)
      .toBe("cw work 'app' 'fix' --account 'work' --harness 'codex'")
  })

  it('never adds --harness when resuming', () => {
    expect(buildLaunch(session({ harness: 'codex' }), false).command).not.toContain('--harness')
  })

  it('adds nothing when no harness was chosen', () => {
    expect(buildLaunch(session({}), true).command).toBe("cw work 'app' 'fix' --account 'work'")
  })

  it('adds --harness to a new review', () => {
    expect(buildLaunch(session({ type: 'review', task: undefined, pr: '42', harness: 'codex' }), true).command)
      .toBe("cw review 'app' '42' --account 'work' --harness 'codex'")
  })

  it('adds --harness to a new loop', () => {
    const loop = session({ type: 'loop', task: 'watch', sessionDir: 'loop-watch', loop_prompt: 'run tests', harness: 'claude' })
    expect(buildLaunch(loop, true).command).toBe("cw loop 'app' 'run tests' --name 'watch' --account 'work' --harness 'claude'")
  })

  it('passes --team to create only when the harness has agent teams', () => {
    const create = { type: 'create' as const, project: '__creating', task: 'saas', notes: 'A SaaS' }
    expect(buildLaunch(session({ ...create, harness: 'claude' }), true).command).toContain('--team')
    const codex = buildLaunch(session({ ...create, harness: 'codex' }), true).command
    expect(codex).not.toContain('--team')
    expect(codex).toContain("--harness 'codex'")
  })

  it('launches General on codex through CW_HARNESS without Claude-only flags', () => {
    const launch = buildLaunch(session({ type: 'general', harness: 'codex', model: 'gpt-5-codex', skipPermissions: true }), true)
    expect(launch.command).toBe("cw launch 'work'")
    expect(launch.env.CW_HARNESS).toBe('codex')
  })

  it('keeps Claude flags for General on claude', () => {
    const launch = buildLaunch(session({ type: 'general', harness: 'claude', model: 'opus', skipPermissions: true }), true)
    expect(launch.command).toBe("cw launch 'work' --model 'opus' --dangerously-skip-permissions")
    expect(launch.env.CW_HARNESS).toBe('claude')
  })

  it('drops an inherited CW_HARNESS from every launch', () => {
    process.env.CW_HARNESS = 'pi'
    expect(buildLaunch(session({}), false).env.CW_HARNESS).toBeUndefined()
    expect(buildLaunch(session({ type: 'general' }), true).env.CW_HARNESS).toBeUndefined()
  })

  it('builds the account login command', () => {
    const login = session({ type: 'login', project: '__accounts', task: undefined, harness: 'opencode' })
    expect(buildLaunch(login, true).command).toBe("cw account login 'work' --harness 'opencode'")
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @forge-dev/core exec vitest run src/pty-launch.test.ts`
Expected: FAIL, `buildLaunch` is not exported.

- [ ] **Step 3: Replace `buildCommand` with `buildLaunch`**

In `packages/core/src/pty-manager.ts` add imports:

```ts
import { envWithoutHarness } from './cw-doctor.js'
import { supports } from './harness-capabilities.js'
```

Delete the private `buildCommand` method and add this exported function above `export class PTYManager`:

```ts
export interface Launch {
  command: string
  env: Record<string, string>
}

export function buildLaunch(session: CWSession, isNew: boolean): Launch {
  const env = envWithoutHarness()
  const harness = session.harness ?? 'claude'
  const harnessFlag = isNew && session.harness ? ` --harness ${shellQuote(harness)}` : ''
  const prefix = session.skipPermissions ? 'cw --skip-permissions' : 'cw'

  if (session.type === 'general') {
    // cw launch forwards extra args verbatim to the harness binary
    let cmd = 'cw launch'
    if (session.account) cmd += ` ${shellQuote(session.account)}`
    if (harness === 'claude') {
      if (session.model) cmd += ` --model ${shellQuote(session.model)}`
      if (session.skipPermissions) cmd += ' --dangerously-skip-permissions'
    }
    if (isNew && session.harness) env.CW_HARNESS = harness
    return { command: cmd, env }
  }
  if (session.type === 'login') {
    return { command: `cw account login ${shellQuote(session.account)} --harness ${shellQuote(harness)}`, env }
  }
  if (session.type === 'create') {
    const desc = session.notes || session.task || 'New project'
    let cmd = `cw create ${shellQuote(desc)}`
    if (supports(harness, 'agent_teams')) cmd += ' --team'
    if (session.task) cmd += ` --name ${shellQuote(session.task)}`
    if (session.account) cmd += ` --account ${shellQuote(session.account)}`
    if (session.model) cmd += ` --model ${shellQuote(session.model)}`
    if (session.worktree) cmd += ` --dir ${shellQuote(session.worktree)}`
    return { command: cmd + harnessFlag, env }
  }
  if (session.type === 'review') {
    const prArg = session.source_url || session.pr
    let cmd = `${prefix} review ${shellQuote(session.project)} ${shellQuote(String(prArg ?? ''))}`
    if (session.account) cmd += ` --account ${shellQuote(session.account)}`
    if (session.model) cmd += ` --model ${shellQuote(session.model)}`
    return { command: cmd + harnessFlag, env }
  }
  if (session.type === 'loop') {
    const prompt = session.loop_prompt ?? ''
    const slug = session.sessionDir?.replace(/^loop-/, '') ?? session.task ?? ''
    let cmd = `${prefix} loop ${shellQuote(session.project)} ${shellQuote(prompt)} --name ${shellQuote(slug)}`
    if (session.loop_interval) cmd += ` --every ${shellQuote(session.loop_interval)}`
    if (session.account) cmd += ` --account ${shellQuote(session.account)}`
    if (session.model) cmd += ` --model ${shellQuote(session.model)}`
    return { command: cmd + harnessFlag, env }
  }
  // CW's URL-aware init prompt needs the source URL for linear, github and notion tasks
  const taskArg = session.source_url || session.task
  let cmd = `${prefix} work ${shellQuote(session.project)} ${shellQuote(taskArg ?? '')}`
  if (session.account) cmd += ` --account ${shellQuote(session.account)}`
  if (session.workflow) cmd += ` --workflow ${shellQuote(session.workflow)}`
  if (session.model) cmd += ` --model ${shellQuote(session.model)}`
  return { command: cmd + harnessFlag, env }
}
```

Change `getOrCreate`:

```ts
  getOrCreate(project: string, sessionDir: string, session: CWSession, options: { isNew?: boolean } = {}): PTYSession | null {
    const key = this.makeKey(project, sessionDir)
    const existing = this.sessions.get(key)
    if (existing) return existing

    const shell = process.env.SHELL || '/bin/zsh'
    const { command, env } = buildLaunch(session, options.isNew ?? false)
    const cwd = session.worktree && existsSync(session.worktree)
      ? session.worktree
      : (session.type === 'general' || session.type === 'create' || session.type === 'login')
        ? (process.env.HOME ?? process.cwd())
        : process.cwd()
```

and in `pty.spawn(...)` replace `env: { ...process.env } as Record<string, string>` with `env`.

- [ ] **Step 4: Run the launch and existing PTY tests**

Run: `pnpm --filter @forge-dev/core exec vitest run src/pty-launch.test.ts src/pty-manager.test.ts src/pty-routes.test.ts`
Expected: PASS. The existing `buildCommand` assertions still hold because sessions without `harness` produce today's commands.

- [ ] **Step 5: Write the failing `takeSession` tests**

Append to `packages/core/src/pty-routes.test.ts` (change the import to `import { parseTerminalUpgradeUrl, takeSession } from './pty-routes.js'` and add `import { pendingSessions } from './cw-routes.js'`):

```ts
describe('takeSession', () => {
  it('treats a pending session as new and consumes it', () => {
    const reader = new CWReader(TEST_CW)
    const pending = { ...reader.getSession('testproj', 'task-mytask')!, harness: 'codex' }
    pendingSessions.set('testproj::task-mytask', pending)
    expect(takeSession(reader, 'testproj', 'task-mytask')).toEqual({ session: pending, isNew: true })
    expect(pendingSessions.has('testproj::task-mytask')).toBe(false)
  })

  it('treats a session read from disk as a resume', () => {
    const taken = takeSession(new CWReader(TEST_CW), 'testproj', 'task-mytask')
    expect(taken?.isNew).toBe(false)
    expect(taken?.session.harness).toBe('claude')
  })

  it('returns null when the session exists nowhere', () => {
    expect(takeSession(new CWReader(TEST_CW), 'testproj', 'task-missing')).toBeNull()
  })
})
```

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm --filter @forge-dev/core exec vitest run src/pty-routes.test.ts -t takeSession`
Expected: FAIL, `takeSession` is not exported.

- [ ] **Step 7: Implement `takeSession` and use it**

In `packages/core/src/pty-routes.ts` add `import type { CWSession } from './cw-types.js'` and this export above `createTerminalWss`:

```ts
// A session still in pendingSessions was just created by /start; anything else is a resume
export function takeSession(reader: CWReader, project: string, sessionDir: string): { session: CWSession; isNew: boolean } | null {
  const sessionId = `${project}::${sessionDir}`
  const pending = pendingSessions.get(sessionId)
  if (pending) {
    pendingSessions.delete(sessionId)
    return { session: pending, isNew: true }
  }
  const session = reader.getSession(project, sessionDir)
  return session ? { session, isNew: false } : null
}
```

In the `connection` handler replace the block from `const session = pendingSessions.get(sessionId) ?? ...` through `const ptySession = manager.getOrCreate(project, sessionDir, session)` with:

```ts
    const taken = takeSession(reader, project, sessionDir)

    if (!taken) {
      console.log(`[pty-ws] Session not found: ${project}/${sessionDir}`)
      ws.send(JSON.stringify({ type: 'error', message: `Session not found: ${project}/${sessionDir}` }))
      ws.close()
      return
    }

    const ptySession = manager.getOrCreate(project, sessionDir, taken.session, { isNew: taken.isNew })
```

- [ ] **Step 8: Run the core suite and build**

Run: `pnpm --filter @forge-dev/core test && pnpm --filter @forge-dev/core build`
Expected: all tests PASS, `tsc` exits 0.

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/pty-manager.ts packages/core/src/pty-launch.test.ts packages/core/src/pty-routes.ts packages/core/src/pty-routes.test.ts
git commit -m "feat(core): pass --harness only to new sessions and strip CW_HARNESS from cw"
```

---

### Task 4: `harness` and `login` in `POST /api/cw/start`

**Files:**
- Modify: `packages/core/src/cw-types.ts` (add `HARNESS_NAME_RE`)
- Modify: `packages/core/src/cw-routes.ts:13-15,184-414`
- Modify: `packages/core/src/cw-routes.test.ts` (append inside the main `describe('CW Routes')`)
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `CWSession.harness`, `'login'` type (Task 1); `takeSession` treats these pending sessions as new (Task 3).
- Produces: `export const HARNESS_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/`; `POST /api/cw/start` accepts `harness?: string` for every type and `type: 'login'` with `{ account, harness }`, returning `{ ok: true, session }` where `session.project === '__accounts'` and `session.sessionDir === 'login-<account>-<harness>'`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('CW Routes', ...)` in `packages/core/src/cw-routes.test.ts`:

```ts
  const start = (body: Record<string, unknown>) => app.request('/api/cw/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  it('POST /api/cw/start stores the harness on a task and in the command', async () => {
    const res = await start({ type: 'dev', project: 'testproj', task: 'harness-task', account: 'default', harness: 'codex' })
    const body = await res.json() as { ok: boolean; session: { harness?: string }; command: string }
    expect(body.ok).toBe(true)
    expect(body.session.harness).toBe('codex')
    expect(body.command).toContain('--harness codex')
  })

  it('POST /api/cw/start stores the harness on a general session', async () => {
    const res = await start({ type: 'general', account: 'default', harness: 'codex' })
    const body = await res.json() as { session: { harness?: string } }
    expect(body.session.harness).toBe('codex')
  })

  it('POST /api/cw/start rejects an invalid harness', async () => {
    const res = await start({ type: 'dev', project: 'testproj', task: 'bad-harness', harness: 'Codex!' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('Invalid harness')
  })

  it('POST /api/cw/start rejects a loop on a harness other than claude', async () => {
    const res = await start({ type: 'loop', project: 'testproj', loopPrompt: 'run tests', name: 'harness-loop', harness: 'codex' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('Loop runs on Claude Code only')
  })

  it('POST /api/cw/start accepts a loop on claude', async () => {
    const res = await start({ type: 'loop', project: 'testproj', loopPrompt: 'run tests', name: 'harness-loop', harness: 'claude' })
    const body = await res.json() as { ok: boolean; session: { harness?: string } }
    expect(body.ok).toBe(true)
    expect(body.session.harness).toBe('claude')
  })

  it('POST /api/cw/start type=login returns an account login session', async () => {
    const res = await start({ type: 'login', account: 'default', harness: 'opencode' })
    const body = await res.json() as { ok: boolean; session: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.session).toMatchObject({
      project: '__accounts', type: 'login', account: 'default', harness: 'opencode', sessionDir: 'login-default-opencode',
    })
  })

  it('POST /api/cw/start type=login rejects an unknown account', async () => {
    const res = await start({ type: 'login', account: 'nobody', harness: 'codex' })
    expect(res.status).toBe(400)
  })

  it('POST /api/cw/start type=login requires a harness', async () => {
    const res = await start({ type: 'login', account: 'default' })
    expect(res.status).toBe(400)
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @forge-dev/core exec vitest run src/cw-routes.test.ts -t "POST /api/cw/start"`
Expected: the new tests FAIL (harness undefined, login falls through to "Project and task are required").

- [ ] **Step 3: Add the harness name pattern**

In `packages/core/src/cw-types.ts`, below `ACCOUNT_NAME_RE`:

```ts
export const HARNESS_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/
```

In `packages/core/src/index.ts`, change `export { ACCOUNT_NAME_RE } from './cw-types.js'` to `export { ACCOUNT_NAME_RE, HARNESS_NAME_RE } from './cw-types.js'`.

- [ ] **Step 4: Handle `harness` and `login` in `/start`**

In `packages/core/src/cw-routes.ts`:

1. Change the import to `import { ACCOUNT_NAME_RE, HARNESS_NAME_RE, type CWSession } from './cw-types.js'`.
2. Below `const CREATING_PROJECT = '__creating'` add `const ACCOUNTS_PROJECT = '__accounts'`.
3. Add `harness` to the destructured body and its type (`harness?: string`).
4. Right after the destructuring add:

```ts
    if (harness !== undefined && !HARNESS_NAME_RE.test(harness)) {
      return c.json({ ok: false, error: 'Invalid harness' }, 400)
    }

    if (type === 'login') {
      if (!account || !ACCOUNT_NAME_RE.test(account) || !reader.getAccounts().includes(account)) {
        return c.json({ ok: false, error: 'Unknown account' }, 400)
      }
      if (!harness) return c.json({ ok: false, error: 'Harness is required' }, 400)
      const sessionDirName = `login-${account}-${harness}`
      const now = new Date().toISOString()
      const sessionData: CWSession = {
        project: ACCOUNTS_PROJECT,
        type: 'login',
        account,
        harness,
        workflow: '',
        worktree: '',
        notes: '',
        status: 'active',
        created: now,
        last_opened: now,
        opens: 0,
        sessionDir: sessionDirName,
      }
      pendingSessions.set(`${ACCOUNTS_PROJECT}::${sessionDirName}`, sessionData)
      return c.json({ ok: true, session: sessionData })
    }
```

5. Add `harness: harness || undefined,` after the `account` line of each of the four existing `sessionData` objects (general, create, loop, task/review).
6. In the loop branch, right after `if (!project) return ...`, add:

```ts
      if (harness && harness !== 'claude') {
        return c.json({ ok: false, error: 'Loop runs on Claude Code only' }, 400)
      }
```

7. In the task/review argument building, after the `if/else` that fills `args`, add `if (harness) args.push('--harness', harness)`.

- [ ] **Step 5: Run the route tests**

Run: `pnpm --filter @forge-dev/core exec vitest run src/cw-routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the core suite and build**

Run: `pnpm --filter @forge-dev/core test && pnpm --filter @forge-dev/core build`
Expected: all tests PASS, `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/cw-types.ts packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts packages/core/src/index.ts
git commit -m "feat(core): accept a harness in /start and add account login sessions"
```

---

### Task 5: Console harness config and shared store

**Files:**
- Modify: `packages/console/src/styles/theme.css` (both variable blocks)
- Modify: `packages/console/src/config/types.ts`
- Create: `packages/console/src/hooks/useHarnesses.ts`

**Interfaces:**
- Consumes: `CWDoctor`, `CWDoctorCell`, `Capability` types (Task 1); `GET /api/cw/harnesses` (Task 2).
- Produces (config/types.ts): `interface HarnessStyle { label: string; color: string; bg: string }`, `HARNESS_STYLES`, `getHarnessStyle(harness?: string): HarnessStyle`, `harnessLabel(s: Pick<CWSession, 'harness' | 'provider' | 'model'>): string`, `CLAUDE_MODELS`, `resolveHarness(project: string | undefined, account: string, projects: Record<string, { harness?: string }>, doctor: CWDoctor): string`, `findCell(doctor: CWDoctor, account: string, harness: string): CWDoctorCell | undefined`, `TYPE_STYLES.login`.
- Produces (hooks/useHarnesses.ts): `type HarnessesResponse`, `harnesses` signal, `loadHarnesses(fresh?: boolean): Promise<HarnessesResponse>`, `watchUntil(check: (doctor: CWDoctor) => boolean, opts?: { timeoutMs?: number; onDone?: (matched: boolean) => void }): () => void`, `supportsIn(response: HarnessesResponse | null, harness: string, cap: Capability): boolean`.

- [ ] **Step 1: Add the harness color variables**

In `packages/console/src/styles/theme.css`, replace the closing of the default (dark) block:

```css
  --forge-tint-accent-border: rgba(99,102,241,0.3);
}
```

with:

```css
  --forge-tint-accent-border: rgba(99,102,241,0.3);
  /* Harness colors */
  --forge-harness-claude: #e08a68;
  --forge-harness-claude-bg: rgba(224,138,104,0.16);
  --forge-harness-codex: #2fbf97;
  --forge-harness-codex-bg: rgba(47,191,151,0.16);
  --forge-harness-pi: #6b9bff;
  --forge-harness-pi-bg: rgba(107,155,255,0.16);
  --forge-harness-opencode: #e8b44a;
  --forge-harness-opencode-bg: rgba(232,180,74,0.16);
}
```

and the closing of `[data-theme="light"]`:

```css
  --forge-tint-accent-border: rgba(99,102,241,0.25);
}
```

with:

```css
  --forge-tint-accent-border: rgba(99,102,241,0.25);
  --forge-harness-claude: #c9633f;
  --forge-harness-claude-bg: rgba(201,99,63,0.12);
  --forge-harness-codex: #0f8f6f;
  --forge-harness-codex-bg: rgba(15,143,111,0.12);
  --forge-harness-pi: #2f6fe0;
  --forge-harness-pi-bg: rgba(47,111,224,0.12);
  --forge-harness-opencode: #c98a12;
  --forge-harness-opencode-bg: rgba(201,138,18,0.14);
}
```

- [ ] **Step 2: Add the harness config**

In `packages/console/src/config/types.ts`, change the import to:

```ts
import type { CWDoctor, CWDoctorCell, CWSession } from '@forge-dev/core'
```

Add a `login` entry to `TYPE_STYLES` after `loop`:

```ts
  login: {
    label: 'LOGIN',
    color: '#64748b',
    bg: 'rgba(100,116,139,0.10)',
    border: 'rgba(100,116,139,0.25)',
    dotClass: 'bg-slate-500',
    bgVar: 'var(--forge-ghost-bg)',
    borderVar: 'var(--forge-ghost-border)',
  },
```

Add a login case to `sessionLabel`, before the final fallback:

```ts
  : s.type === 'login' ? `Login: ${s.account} · ${getHarnessStyle(s.harness).label}`
```

Append at the end of the file:

```ts
/* ── Harness visual config ── */

export interface HarnessStyle {
  label: string
  color: string
  bg: string
}

export const HARNESS_STYLES: Record<string, HarnessStyle> = {
  claude: { label: 'Claude Code', color: 'var(--forge-harness-claude)', bg: 'var(--forge-harness-claude-bg)' },
  codex: { label: 'Codex', color: 'var(--forge-harness-codex)', bg: 'var(--forge-harness-codex-bg)' },
  pi: { label: 'Pi', color: 'var(--forge-harness-pi)', bg: 'var(--forge-harness-pi-bg)' },
  opencode: { label: 'OpenCode', color: 'var(--forge-harness-opencode)', bg: 'var(--forge-harness-opencode-bg)' },
}

export const getHarnessStyle = (harness?: string): HarnessStyle =>
  HARNESS_STYLES[harness ?? 'claude'] ?? { label: harness ?? 'claude', color: 'var(--forge-muted)', bg: 'var(--forge-ghost-bg)' }

export const harnessLabel = (s: Pick<CWSession, 'harness' | 'provider' | 'model'>): string => {
  const label = getHarnessStyle(s.harness).label
  return s.provider && s.provider !== 'native' ? `${label} · ${s.model || s.provider}` : label
}

export const CLAUDE_MODELS = [
  { id: '', label: 'Default', description: 'Recommended model' },
  { id: 'haiku', label: 'Haiku', description: 'Fast, simple tasks' },
  { id: 'sonnet', label: 'Sonnet', description: 'Daily coding' },
  { id: 'opus', label: 'Opus', description: 'Complex reasoning' },
]

// Same order CW uses for a new session: project, then account, then claude
export const resolveHarness = (
  project: string | undefined,
  account: string,
  projects: Record<string, { harness?: string }>,
  doctor: CWDoctor,
): string =>
  (project ? projects[project]?.harness : undefined)
  ?? doctor.accounts.find(a => a.name === account)?.default_harness
  ?? 'claude'

export const findCell = (doctor: CWDoctor, account: string, harness: string): CWDoctorCell | undefined =>
  doctor.accounts.find(a => a.name === account)?.harnesses.find(h => h.harness === harness)
```

- [ ] **Step 3: Create the shared store**

`packages/console/src/hooks/useHarnesses.ts`:

```ts
import { signal } from '@preact/signals'
import type { Capability, CWDoctor } from '@forge-dev/core'

export type HarnessesResponse =
  | {
      available: true
      doctor: CWDoctor
      capabilities: Record<string, Capability[]>
      contextTokens: { linear: boolean; notion: boolean }
    }
  | { available: false; reason: string }

export const harnesses = signal<HarnessesResponse | null>(null)

// cw doctor --json is slow, so polling never runs faster than this
const POLL_MS = 3000

let inFlight: Promise<HarnessesResponse> | null = null

export function loadHarnesses(fresh = false): Promise<HarnessesResponse> {
  if (inFlight) return inFlight
  inFlight = fetch(`/api/cw/harnesses${fresh ? '?fresh=1' : ''}`)
    .then(r => r.json() as Promise<HarnessesResponse>)
    .catch((): HarnessesResponse => ({ available: false, reason: 'Could not reach the Forge server' }))
    .then((result) => {
      harnesses.value = result
      inFlight = null
      return result
    })
  return inFlight
}

interface Watcher {
  check: (doctor: CWDoctor) => boolean
  deadline: number
  onDone: (matched: boolean) => void
}

const watchers = new Set<Watcher>()
let timer: ReturnType<typeof setInterval> | null = null

const stopTimerIfIdle = () => {
  if (watchers.size === 0 && timer) {
    clearInterval(timer)
    timer = null
  }
}

const tick = async () => {
  const result = await loadHarnesses(true)
  const now = Date.now()
  for (const watcher of watchers) {
    const matched = result.available && watcher.check(result.doctor)
    if (matched || now > watcher.deadline) {
      watchers.delete(watcher)
      watcher.onDone(matched)
    }
  }
  stopTimerIfIdle()
}

export function watchUntil(
  check: (doctor: CWDoctor) => boolean,
  { timeoutMs = 600_000, onDone = () => {} }: { timeoutMs?: number; onDone?: (matched: boolean) => void } = {},
): () => void {
  const watcher: Watcher = { check, deadline: Date.now() + timeoutMs, onDone }
  watchers.add(watcher)
  if (!timer) timer = setInterval(tick, POLL_MS)
  return () => {
    watchers.delete(watcher)
    stopTimerIfIdle()
  }
}

export const supportsIn = (response: HarnessesResponse | null, harness: string, cap: Capability): boolean =>
  Boolean(response?.available && response.capabilities[harness]?.includes(cap))
```

- [ ] **Step 4: Build core, then type-check and build the console**

Run: `pnpm --filter @forge-dev/core build && pnpm --dir packages/console exec tsc --noEmit -p . && pnpm --filter @forge-dev/console build`
Expected: all three exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/console/src/styles/theme.css packages/console/src/config/types.ts packages/console/src/hooks/useHarnesses.ts
git commit -m "feat(console): add harness styles, resolution and a shared harness store"
```

---

### Task 6: Harness selector in New Task (review checkpoint)

**Files:**
- Create: `packages/console/src/components/HarnessPicker.tsx`
- Modify: `packages/console/src/pages/NewTask.tsx`

**Interfaces:**
- Consumes: `harnesses`, `loadHarnesses`, `supportsIn` (Task 5); `CLAUDE_MODELS`, `findCell`, `getHarnessStyle`, `resolveHarness` (Task 5); `harness` in `POST /api/cw/start` (Task 4).
- Produces: `harnessUnavailableReason(harness: string, cell: CWDoctorCell | undefined, isLoop: boolean): string | null`; `HarnessPicker` props `{ doctor: CWDoctor; account: string; value: string; defaultHarness: string; isLoop: boolean; onChange: (harness: string) => void; onOpenAccounts?: () => void }`; `NewTask` gains optional prop `onOpenAccounts?: () => void` (wired in Task 11).

- [ ] **Step 1: Create the picker**

`packages/console/src/components/HarnessPicker.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import type { CWDoctor, CWDoctorCell } from '@forge-dev/core'
import { findCell, getHarnessStyle } from '../config/types.js'

export const harnessUnavailableReason = (harness: string, cell: CWDoctorCell | undefined, isLoop: boolean): string | null => {
  if (isLoop && harness !== 'claude') return "Loop uses Claude Code's /loop"
  if (cell?.status === 'not_installed') return typeof cell.detail === 'string' ? cell.detail : 'Not installed'
  return null
}

interface HarnessPickerProps {
  doctor: CWDoctor
  account: string
  value: string
  defaultHarness: string
  isLoop: boolean
  onChange: (harness: string) => void
  onOpenAccounts?: () => void
}

export const HarnessPicker: FunctionComponent<HarnessPickerProps> = ({
  doctor, account, value, defaultHarness, isLoop, onChange, onOpenAccounts,
}) => (
  <div class="mb-4">
    <label class="block text-sm font-medium mb-1">
      Harness <span class="font-normal text-forge-muted">who runs the session</span>
    </label>
    <div class="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
      {doctor.harnesses.map(h => {
        const cell = findCell(doctor, account, h.name)
        const reason = harnessUnavailableReason(h.name, cell, isLoop)
        const style = getHarnessStyle(h.name)
        const selected = value === h.name
        const notLoggedIn = cell?.status === 'not_logged_in'
        const detail = reason
          ?? (notLoggedIn ? 'not logged in' : null)
          ?? (cell?.status === 'error' && typeof cell.detail === 'string' ? cell.detail : null)
          ?? (h.name === defaultHarness ? 'account default' : h.version ?? '')
        return (
          <div
            key={h.name}
            role="button"
            tabIndex={reason ? -1 : 0}
            aria-disabled={Boolean(reason)}
            class={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
              selected ? '' : 'border-forge-border bg-forge-surface'
            } ${reason ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            style={selected ? { backgroundColor: 'var(--forge-tint-accent-bg)', borderColor: 'var(--forge-accent)' } : undefined}
            onClick={() => { if (!reason) onChange(h.name) }}
            onKeyDown={(e: KeyboardEvent) => { if (!reason && (e.key === 'Enter' || e.key === ' ')) onChange(h.name) }}
          >
            <span class="flex items-center gap-1.5 font-semibold text-forge-text">
              <span class="w-2 h-2 rounded-full" style={{ backgroundColor: style.color }} />
              {style.label}
            </span>
            <span class="text-[11px] text-forge-muted truncate max-w-full" title={detail}>{detail}</span>
            {notLoggedIn && onOpenAccounts && (
              <button
                type="button"
                class="text-[11px] text-forge-accent underline"
                onClick={(e: Event) => { e.stopPropagation(); onOpenAccounts() }}
              >
                Connect
              </button>
            )}
          </div>
        )
      })}
    </div>
    <div class="text-xs text-forge-muted mt-1">
      For this task only. An account's default harness is set when the account is created.
    </div>
  </div>
)
```

- [ ] **Step 2: Wire the harness state into New Task**

In `packages/console/src/pages/NewTask.tsx`:

1. Imports — add:

```ts
import { CLAUDE_MODELS, findCell, getHarnessStyle, resolveHarness } from '../config/types.js'
import { harnesses, loadHarnesses, supportsIn } from '../hooks/useHarnesses.js'
import { HarnessPicker, harnessUnavailableReason } from '../components/HarnessPicker.js'
```

2. Props — change `projects` to `Record<string, { path: string; account: string; harness?: string }>` and add `onOpenAccounts?: () => void` to `NewTaskProps` and to the destructuring.
3. Delete the local `MODELS` constant; the model pills map over `CLAUDE_MODELS`.
4. After the existing `useState` calls add:

```ts
  const [harness, setHarness] = useState('claude')

  useEffect(() => { loadHarnesses() }, [])

  const response = harnesses.value
  const doctor = response?.available ? response.doctor : null
```

5. After the existing `useEffect` that fetches stack detection add:

```ts
  useEffect(() => {
    if (!doctor || !selectedAccount) return
    setHarness(isLoop ? 'claude' : resolveHarness(project || undefined, selectedAccount, projects, doctor))
  }, [response?.available, selectedAccount, project, isLoop])

  const cell = doctor ? findCell(doctor, selectedAccount, harness) : undefined
  const canSkipPermissions = !doctor || supportsIn(response, harness, 'skip_permissions')
  const usesClaudeModels = !doctor || harness === 'claude'
  const showModel = !(isGeneral && !usesClaudeModels)
  const harnessBlocked = doctor ? harnessUnavailableReason(harness, cell, isLoop) : null
  const harnessName = getHarnessStyle(harness).label

  useEffect(() => {
    if (!canSkipPermissions) setSkipPermissions(false)
    setModel(usesClaudeModels ? '' : (cell?.model ?? ''))
  }, [harness, selectedAccount])

  const ticketSource = /linear\.app/.test(task) ? 'linear' : /notion\.(so|site)/.test(task) ? 'notion' : null
  const missingTicketToken = Boolean(
    response?.available && ticketSource && !supportsIn(response, harness, 'mcp') && !response.contextTokens[ticketSource]
  )
```

6. In `handleStart`, add `if (harnessBlocked) return` as the first line, add `if (doctor) body.harness = harness` after the `body` object is created, and replace `body.model = model || undefined` with `body.model = showModel ? (model || undefined) : undefined`.
7. Render the picker right after the Account selector block:

```tsx
        {doctor && (
          <HarnessPicker
            doctor={doctor}
            account={selectedAccount}
            value={harness}
            defaultHarness={resolveHarness(project || undefined, selectedAccount, projects, doctor)}
            isLoop={isLoop}
            onChange={setHarness}
            onOpenAccounts={onOpenAccounts}
          />
        )}
```

8. Wrap the "Bypass permissions" `<label>` in `{canSkipPermissions && ( ... )}`.
9. Replace the whole Model block with:

```tsx
        {showModel && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">
              Model{' '}
              <span class="text-forge-muted font-normal">
                {usesClaudeModels ? '(claude default if not set)' : "(the account's model if empty)"}
              </span>
            </label>
            {usesClaudeModels ? (
              <div class="flex flex-wrap gap-2">
                {CLAUDE_MODELS.map(m => (
                  <button
                    key={m.id}
                    class={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      model === m.id ? 'text-forge-accent' : 'border-forge-border bg-forge-surface text-forge-muted'
                    }`}
                    style={model === m.id ? { backgroundColor: 'rgba(99,102,241,0.1)', borderColor: 'var(--forge-accent)' } : undefined}
                    onClick={() => setModel(m.id)}
                    title={m.description}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={model}
                onInput={(e) => setModel((e.target as HTMLInputElement).value)}
                placeholder="the model configured on the account"
                class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              />
            )}
          </div>
        )}
```

10. Right above the Start `ActionButton` add:

```tsx
        {missingTicketToken && (
          <div
            class="text-xs rounded-lg px-3 py-2 mb-4 text-forge-text"
            style={{ backgroundColor: 'var(--forge-tint-amber-bg)', border: '1px solid var(--forge-tint-amber-border)' }}
          >
            {harnessName} has no MCP and CW has no {ticketSource === 'linear' ? 'LINEAR_API_KEY' : 'NOTION_TOKEN'}, so
            the ticket will not reach TASK_NOTES.md. The task still starts, without the ticket.
          </div>
        )}
```

11. Add `|| Boolean(harnessBlocked)` to the Start button's `disabled` expression, and right after the button render `{harnessBlocked && <div class="text-xs mt-2" style={{ color: 'var(--forge-error)' }}>{harnessBlocked}</div>}`.
12. In the footer text replace `Opens Claude in "${project}"` with `` `Opens ${harnessName} in "${project}"` ``, `Opens Claude for account` with `` `Opens ${harnessName} for account` ``, and `` `Opens a CW session in your terminal for ${project}` `` with `` `Opens a CW session on ${harnessName} for ${project}` ``.

- [ ] **Step 3: Type-check and build**

Run: `pnpm --filter @forge-dev/core build && pnpm --dir packages/console exec tsc --noEmit -p . && pnpm --filter @forge-dev/console build`
Expected: all exit 0.

- [ ] **Step 4: Browser check, end to end with codex**

1. `pnpm build && FORGE_PORT=3100 node packages/platform/dist/index.js` (port 3000 may already be in use by another Forge; do not stop it).
2. Open `http://localhost:3100`, click "+ New Task". Expected: a Harness block below Account with one pill per harness from `cw doctor --json`; uninstalled ones greyed with their reason; the account default preselected.
3. Select Loop. Expected: only Claude Code enabled; others show "Loop uses Claude Code's /loop".
4. Back to Dev, select Codex. Expected: Bypass permissions disappears; Model becomes a text input.
5. Type a `linear.app` URL with no `LINEAR_API_KEY` configured. Expected: the amber notice appears; Start stays enabled.
6. Replace it with a plain task name on a throwaway registered project and click Start. Expected: a tab opens, and `pgrep -fl "cw work"` shows `--harness codex`; `~/.cw/sessions/<project>/task-<name>/session.json` has `"harness": "codex"`.
7. Close the tab and reopen the task from the list. Expected: `pgrep -fl "cw work"` shows no `--harness`, and codex resumes.
8. Stop only the port 3100 server: `kill $(lsof -tiTCP:3100 -sTCP:LISTEN)`. Mark the throwaway task done from Forge.

- [ ] **Step 5: Commit**

```bash
git add packages/console/src/components/HarnessPicker.tsx packages/console/src/pages/NewTask.tsx
git commit -m "feat(console): pick the harness for a new task"
```

- [ ] **Step 6: Stop for review**

The brief asks for a review once New Task works end to end with codex. Report steps 2–7 with their observed output and wait for approval before Task 7.

---

### Task 7: Harness badges and filter

**Files:**
- Create: `packages/console/src/components/HarnessBadge.tsx`
- Modify: `packages/console/src/components/TaskCard.tsx`
- Modify: `packages/console/src/pages/TaskDetail.tsx`
- Modify: `packages/console/src/hooks/useTaskFilters.ts`
- Modify: `packages/console/src/pages/TaskList.tsx`
- Modify: `packages/console/src/app.tsx`

**Interfaces:**
- Consumes: `getHarnessStyle`, `harnessLabel` (Task 5); `CWSession.harness` filled by the reader (Task 1).
- Produces: `HarnessBadge` props `{ session: Pick<CWSession, 'harness' | 'provider' | 'model'>; muted?: boolean }`; `useTaskFilters` returns `filterHarness: string | null`, `setFilterHarness: (h: string | null) => void`, `harnessNames: string[]`; `TaskList` props `harnessNames`, `filterHarness`, `onFilterHarness`.

- [ ] **Step 1: Create the badge**

`packages/console/src/components/HarnessBadge.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import type { CWSession } from '@forge-dev/core'
import { getHarnessStyle, harnessLabel } from '../config/types.js'

export const HarnessBadge: FunctionComponent<{
  session: Pick<CWSession, 'harness' | 'provider' | 'model'>
  muted?: boolean
}> = ({ session, muted }) => {
  const style = getHarnessStyle(session.harness)
  return (
    <span
      class={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap${muted ? ' opacity-60' : ''}`}
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      <span class="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.color }} />
      {harnessLabel(session)}
    </span>
  )
}
```

- [ ] **Step 2: Show it on cards and the detail bar**

1. `packages/console/src/components/TaskCard.tsx`: add `import { HarnessBadge } from './HarnessBadge.js'`. In `TaskCard`, insert `<HarnessBadge session={session} />` as the first child of the `shrink-0 flex items-center gap-4` div, before the time span. In `DoneTaskRow`, insert `<HarnessBadge session={session} muted />` as the first child of the `shrink-0 flex items-center gap-3` div.
2. `packages/console/src/pages/TaskDetail.tsx`: add `import { HarnessBadge } from '../components/HarnessBadge.js'` and render `<HarnessBadge session={session} />` right after the type badge `<span>` in the status bar.

- [ ] **Step 3: Add the harness filter state**

In `packages/console/src/hooks/useTaskFilters.ts`:

```ts
  const [filterHarness, setFilterHarness] = useState<string | null>(null)

  const harnessNames = useMemo(
    () => Array.from(new Set(spaces.map(s => s.harness ?? 'claude'))).sort(),
    [spaces]
  )
```

In `filteredSpaces`, add `if (filterHarness && (s.harness ?? 'claude') !== filterHarness) return false` after the project check, and add `filterHarness` to the dependency array. Add `filterHarness`, `setFilterHarness` and `harnessNames` to the returned object.

- [ ] **Step 4: Render the pills in the task list**

In `packages/console/src/pages/TaskList.tsx`:

1. Change the config import to `import { TYPE_STYLES, QUICK_TYPES, sessionKey, getHarnessStyle, type TypeStyle } from '../config/types.js'`.
2. Add to `TaskListProps` and the destructuring: `harnessNames: string[]`, `filterHarness: string | null`, `onFilterHarness: (h: string | null) => void`.
3. Change `hasActiveFilters` to `filterAccount !== null || filterProject !== null || filterType !== null || filterHarness !== null`.
4. In both "Clear filters" buttons, add `onFilterHarness(null)` to the handler.
5. Right after the type `FilterPill` group add:

```tsx
        {harnessNames.length > 1 && (
          <div class="flex items-center gap-1.5 ml-1">
            {harnessNames.map(h => {
              const style = getHarnessStyle(h)
              const active = filterHarness === h
              return (
                <button
                  key={h}
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all"
                  style={active
                    ? { backgroundColor: style.bg, borderColor: style.color, color: style.color }
                    : { backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)', color: 'var(--forge-muted)' }
                  }
                  onClick={() => onFilterHarness(active ? null : h)}
                >
                  <span class="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.color }} />
                  {style.label}
                </button>
              )
            })}
          </div>
        )}
```

6. In `packages/console/src/app.tsx`, pass to `<TaskList>`: `harnessNames={filters.harnessNames}`, `filterHarness={filters.filterHarness}`, `onFilterHarness={filters.setFilterHarness}`.

- [ ] **Step 5: Type-check and build**

Run: `pnpm --dir packages/console exec tsc --noEmit -p . && pnpm --filter @forge-dev/console build`
Expected: both exit 0.

- [ ] **Step 6: Browser check**

With a worktree Forge on `FORGE_PORT=3100` (see Task 6 step 4): every existing card shows a "Claude Code" badge; a done row shows it muted; opening a task shows the badge after the type badge. With the codex session from Task 6 still listed (Show done if it is done), the harness pills appear and "Codex" filters the list to it; Clear filters resets it. With a single harness in the list, no harness pills render. Stop only the port 3100 server afterwards.

- [ ] **Step 7: Commit**

```bash
git add packages/console/src/components/HarnessBadge.tsx packages/console/src/components/TaskCard.tsx packages/console/src/pages/TaskDetail.tsx packages/console/src/hooks/useTaskFilters.ts packages/console/src/pages/TaskList.tsx packages/console/src/app.tsx
git commit -m "feat(console): show the harness on sessions and filter by it"
```

---

### Task 8: Create accounts with a harness, provider and model

**Files:**
- Modify: `packages/core/src/cw-types.ts` (add `PROVIDER_NAME_RE`, `MODEL_NAME_RE`)
- Modify: `packages/core/src/cw-routes.ts:60-83` (`POST /accounts`)
- Modify: `packages/core/src/cw-routes.test.ts` (append a describe block)
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `HARNESS_NAME_RE` (Task 4), `supports` (Task 1), `envWithoutHarness` (Task 2).
- Produces: `PROVIDER_NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/`, `MODEL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/`; `POST /api/cw/accounts` accepts `{ name: string; harness?: string; provider?: string; model?: string }` and returns `{ ok: true, name }` or `{ ok: false, error }` (400 validation, 409 duplicate, 500 with cw's first stderr line).

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/cw-routes.test.ts` (`chmodSync` and `readFileSync` are already imported after Task 2):

```ts
describe('POST /api/cw/accounts with a harness', () => {
  const DIR = join(import.meta.dirname, '../.test-cw-accounts')
  const ARGS = join(DIR, 'args.txt')
  let app: Hono

  const add = (body: Record<string, unknown>) => app.request('/api/cw/accounts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const recordedArgs = () => readFileSync(ARGS, 'utf-8').trim().split('\n')

  beforeAll(() => {
    mkdirSync(join(DIR, 'bin'), { recursive: true })
    mkdirSync(join(DIR, 'accounts'), { recursive: true })
    writeFileSync(join(DIR, 'bin/cw'), [
      '#!/bin/sh',
      '[ -n "$CW_HARNESS" ] && exit 3',
      'if [ "$3" = "fail" ]; then echo "Account \'fail\' already exists" >&2; echo "second line" >&2; exit 1; fi',
      `printf '%s\\n' "$@" > '${ARGS}'`,
      '',
    ].join('\n'))
    chmodSync(join(DIR, 'bin/cw'), 0o755)
    app = new Hono()
    app.route('/api/cw', cwRoutes(new CWReader(DIR)))
  })

  afterAll(() => rmSync(DIR, { recursive: true, force: true }))

  it('passes harness, provider and model to cw account add', async () => {
    const res = await add({ name: 'glm', harness: 'opencode', provider: 'zai', model: 'glm-5.1' })
    expect(res.status).toBe(200)
    expect(recordedArgs()).toEqual(['account', 'add', 'glm', '--harness', 'opencode', '--provider', 'zai', '--model', 'glm-5.1'])
  })

  it('keeps today\'s arguments for a name alone', async () => {
    await add({ name: 'plain' })
    expect(recordedArgs()).toEqual(['account', 'add', 'plain'])
  })

  it('treats empty optional fields as absent', async () => {
    await add({ name: 'empty-fields', harness: '', provider: '', model: '' })
    expect(recordedArgs()).toEqual(['account', 'add', 'empty-fields'])
  })

  it('rejects a provider on a harness without custom providers', async () => {
    const res = await add({ name: 'nope', provider: 'zai' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('claude cannot use a provider')
  })

  it('rejects an invalid harness', async () => {
    const res = await add({ name: 'nope', harness: 'Open Code' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('Invalid harness')
  })

  it('rejects an invalid model', async () => {
    const res = await add({ name: 'nope', harness: 'codex', model: 'bad model' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('Invalid model')
  })

  it('reports the first line cw printed on failure', async () => {
    const res = await add({ name: 'fail' })
    expect(res.status).toBe(500)
    const { error } = await res.json() as { error: string }
    expect(error).toBe("Failed to create account: Account 'fail' already exists")
  })

  it('never passes CW_HARNESS to cw', async () => {
    const previous = process.env.CW_HARNESS
    process.env.CW_HARNESS = 'pi'
    try {
      expect((await add({ name: 'no-env' })).status).toBe(200)
    } finally {
      if (previous === undefined) delete process.env.CW_HARNESS
      else process.env.CW_HARNESS = previous
    }
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @forge-dev/core exec vitest run src/cw-routes.test.ts -t "with a harness"`
Expected: FAIL (arguments recorded without `--harness`, validation tests get 200).

- [ ] **Step 3: Add the patterns**

In `packages/core/src/cw-types.ts`, below `HARNESS_NAME_RE`:

```ts
export const PROVIDER_NAME_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/
export const MODEL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/
```

In `packages/core/src/index.ts`, export them next to `HARNESS_NAME_RE`.

- [ ] **Step 4: Rewrite `POST /accounts`**

In `packages/core/src/cw-routes.ts`, extend the imports:

```ts
import { ACCOUNT_NAME_RE, HARNESS_NAME_RE, PROVIDER_NAME_RE, MODEL_NAME_RE, type CWSession } from './cw-types.js'
import { createDoctorClient, envWithoutHarness, readContextTokens } from './cw-doctor.js'
import { HARNESS_CAPABILITIES, supports } from './harness-capabilities.js'
```

Replace the `app.post('/accounts', ...)` handler with:

```ts
  app.post('/accounts', async (c) => {
    const body = await c.req.json<{ name: string; harness?: string; provider?: string; model?: string }>()
    const harness = body.harness || undefined
    const provider = body.provider || undefined
    const model = body.model || undefined

    if (!body.name || !body.name.trim()) {
      return c.json({ ok: false, error: 'Account name is required' }, 400)
    }

    const trimmed = body.name.trim()
    if (!ACCOUNT_NAME_RE.test(trimmed)) {
      return c.json({ ok: false, error: 'Name must start with a letter or number and contain only letters, numbers, hyphens, and underscores (max 64 chars)' }, 400)
    }
    if (harness && !HARNESS_NAME_RE.test(harness)) {
      return c.json({ ok: false, error: 'Invalid harness' }, 400)
    }
    if (provider && !PROVIDER_NAME_RE.test(provider)) {
      return c.json({ ok: false, error: 'Invalid provider' }, 400)
    }
    if (provider && !supports(harness, 'custom_provider')) {
      return c.json({ ok: false, error: `${harness ?? 'claude'} cannot use a provider` }, 400)
    }
    if (model && !MODEL_NAME_RE.test(model)) {
      return c.json({ ok: false, error: 'Invalid model' }, 400)
    }

    if (reader.getAccounts().includes(trimmed)) {
      return c.json({ ok: false, error: `Account "${trimmed}" already exists` }, 409)
    }

    const args = ['account', 'add', trimmed]
    if (harness) args.push('--harness', harness)
    if (provider) args.push('--provider', provider)
    if (model) args.push('--model', model)

    try {
      await execFileAsync(cwBin, args, { encoding: 'utf-8', timeout: 10000, env: envWithoutHarness() })
      return c.json({ ok: true, name: trimmed })
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr?.trim().split('\n')[0]
      const message = stderr || (err instanceof Error ? err.message : 'Unknown error')
      return c.json({ ok: false, error: `Failed to create account: ${message}` }, 500)
    }
  })
```

- [ ] **Step 5: Run the core suite and build**

Run: `pnpm --filter @forge-dev/core test && pnpm --filter @forge-dev/core build`
Expected: all tests PASS (the existing account validation tests still return 400/409 before cw runs), `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/cw-types.ts packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts packages/core/src/index.ts
git commit -m "feat(core): create accounts with a harness, provider and model"
```

---

### Task 9: `LoginManager` for headless logins

**Files:**
- Create: `packages/core/src/login-manager.ts`
- Create: `packages/core/src/login-manager.test.ts`

**Interfaces:**
- Consumes: `envWithoutHarness` (Task 2).
- Produces:
  - `interface LoginState { account: string; harness: string; status: 'running' | 'exited'; url: string | null; code: string | null; exitCode: number | null; output: string[]; startedAt: string }`
  - `type LoginProcess = Pick<IPty, 'onData' | 'onExit' | 'kill'>`
  - `type SpawnLogin = (file: string, args: string[], options: { cwd: string; env: Record<string, string> }) => LoginProcess`
  - `class LoginManager { constructor(cwBin: string, spawn?: SpawnLogin); start(account: string, harness: string): LoginState; get(account: string, harness: string): LoginState | undefined; stop(account: string, harness: string): void; dispose(): void }`

- [ ] **Step 1: Write the failing tests**

`packages/core/src/login-manager.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { LoginManager, type SpawnLogin } from './login-manager.js'

const fakeProcess = () => {
  let onData: (data: string) => void = () => {}
  let onExit: (e: { exitCode: number; signal?: number }) => void = () => {}
  return {
    onData: (cb: (data: string) => void) => { onData = cb; return { dispose() {} } },
    onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => { onExit = cb; return { dispose() {} } },
    kill: vi.fn(),
    emit: (data: string) => onData(data),
    exit: (exitCode: number) => onExit({ exitCode }),
  }
}

const setup = () => {
  const proc = fakeProcess()
  const spawn = vi.fn(() => proc) as unknown as SpawnLogin & ReturnType<typeof vi.fn>
  const manager = new LoginManager('/fake/cw', spawn)
  return { proc, spawn, manager }
}

describe('LoginManager', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs cw account login with --no-browser and without CW_HARNESS', () => {
    const previous = process.env.CW_HARNESS
    process.env.CW_HARNESS = 'pi'
    try {
      const { spawn, manager } = setup()
      manager.start('work', 'codex')
      const [file, args, options] = spawn.mock.calls[0] as Parameters<SpawnLogin>
      expect(file).toBe('/fake/cw')
      expect(args).toEqual(['account', 'login', 'work', '--harness', 'codex', '--no-browser'])
      expect(options.env.CW_HARNESS).toBeUndefined()
      manager.dispose()
    } finally {
      if (previous === undefined) delete process.env.CW_HARNESS
      else process.env.CW_HARNESS = previous
    }
  })

  it('parses the login URL and code from coloured output split across chunks', () => {
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    proc.emit('Starting device login\r\n\x1b[1mCW_LOGIN_UR')
    proc.emit('L=https://auth.openai.com/codex/device\x1b[0m\r\nCW_LOGIN_CODE=WXYZ-4821\r\n')
    const state = manager.get('work', 'codex')!
    expect(state.url).toBe('https://auth.openai.com/codex/device')
    expect(state.code).toBe('WXYZ-4821')
    expect(state.output).toContain('Starting device login')
    manager.dispose()
  })

  it('ignores a login URL that is not http or https', () => {
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    proc.emit('CW_LOGIN_URL=javascript:alert(1)\n')
    expect(manager.get('work', 'codex')!.url).toBeNull()
    manager.dispose()
  })

  it('keeps only the last 50 output lines', () => {
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    proc.emit(Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n') + '\n')
    const { output } = manager.get('work', 'codex')!
    expect(output).toHaveLength(50)
    expect(output[0]).toBe('line 10')
    manager.dispose()
  })

  it('returns the running login instead of starting a second one', () => {
    const { spawn, manager } = setup()
    const first = manager.start('work', 'codex')
    expect(manager.start('work', 'codex')).toBe(first)
    expect(spawn).toHaveBeenCalledTimes(1)
    manager.dispose()
  })

  it('records the exit and drops the state 5 minutes later', () => {
    vi.useFakeTimers()
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    proc.exit(0)
    expect(manager.get('work', 'codex')).toMatchObject({ status: 'exited', exitCode: 0 })
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(manager.get('work', 'codex')).toBeUndefined()
  })

  it('kills a login still running after 15 minutes', () => {
    vi.useFakeTimers()
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    vi.advanceTimersByTime(15 * 60 * 1000 + 1)
    expect(proc.kill).toHaveBeenCalled()
    expect(manager.get('work', 'codex')).toMatchObject({ status: 'exited', exitCode: null })
    manager.dispose()
  })

  it('stop kills the process and dispose kills everything', () => {
    const { proc, manager } = setup()
    manager.start('work', 'codex')
    manager.stop('work', 'codex')
    expect(proc.kill).toHaveBeenCalledTimes(1)
    expect(manager.get('work', 'codex')?.status).toBe('exited')
    manager.dispose()
    expect(manager.get('work', 'codex')).toBeUndefined()
  })
})

describe('LoginManager with a real PTY', () => {
  const DIR = join(import.meta.dirname, '../.test-login-manager')

  afterEach(() => rmSync(DIR, { recursive: true, force: true }))

  it('reads the URL and code a fake cw prints', async () => {
    mkdirSync(DIR, { recursive: true })
    const cw = join(DIR, 'cw')
    writeFileSync(cw, "#!/bin/sh\nprintf 'Visit the page\\n\\033[1mCW_LOGIN_URL=https://auth.openai.com/codex/device\\033[0m\\nCW_LOGIN_CODE=WXYZ-4821\\n'\n")
    chmodSync(cw, 0o755)
    const manager = new LoginManager(cw)
    manager.start('work', 'codex')
    await vi.waitFor(() => expect(manager.get('work', 'codex')?.status).toBe('exited'), { timeout: 5000 })
    expect(manager.get('work', 'codex')).toMatchObject({
      url: 'https://auth.openai.com/codex/device', code: 'WXYZ-4821', exitCode: 0,
    })
    manager.dispose()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @forge-dev/core exec vitest run src/login-manager.test.ts`
Expected: FAIL, cannot resolve `./login-manager.js`.

- [ ] **Step 3: Implement the manager**

`packages/core/src/login-manager.ts`:

```ts
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import { envWithoutHarness } from './cw-doctor.js'

export interface LoginState {
  account: string
  harness: string
  status: 'running' | 'exited'
  url: string | null
  code: string | null
  exitCode: number | null
  output: string[]
  startedAt: string
}

export type LoginProcess = Pick<IPty, 'onData' | 'onExit' | 'kill'>
export type SpawnLogin = (file: string, args: string[], options: { cwd: string; env: Record<string, string> }) => LoginProcess

interface Entry {
  state: LoginState
  proc: LoginProcess
  partial: string
  timer: ReturnType<typeof setTimeout> | null
}

const OUTPUT_LINES = 50
const MAX_RUNNING_MS = 15 * 60 * 1000
const KEEP_EXITED_MS = 5 * 60 * 1000
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g
const URL_RE = /^CW_LOGIN_URL=(https?:\/\/\S+)$/
const CODE_RE = /^CW_LOGIN_CODE=([A-Za-z0-9-]{4,64})$/

// A PTY rather than pipes, in case cw or the harness checks for a terminal
const spawnInPty: SpawnLogin = (file, args, options) =>
  pty.spawn(file, args, { name: 'xterm-256color', cols: 120, rows: 40, cwd: options.cwd, env: options.env })

export class LoginManager {
  private entries = new Map<string, Entry>()

  constructor(private cwBin: string, private spawn: SpawnLogin = spawnInPty) {}

  start(account: string, harness: string): LoginState {
    const key = `${account}::${harness}`
    const existing = this.entries.get(key)
    if (existing?.state.status === 'running') return existing.state
    if (existing) this.drop(key)

    const state: LoginState = {
      account, harness, status: 'running', url: null, code: null, exitCode: null, output: [],
      startedAt: new Date().toISOString(),
    }
    const proc = this.spawn(this.cwBin, ['account', 'login', account, '--harness', harness, '--no-browser'], {
      cwd: process.env.HOME ?? process.cwd(),
      env: envWithoutHarness(),
    })
    const entry: Entry = { state, proc, partial: '', timer: null }
    this.entries.set(key, entry)
    proc.onData((data) => this.ingest(entry, data))
    proc.onExit(({ exitCode }) => this.finish(key, entry, exitCode))
    entry.timer = setTimeout(() => this.stop(account, harness), MAX_RUNNING_MS)
    return state
  }

  get(account: string, harness: string): LoginState | undefined {
    return this.entries.get(`${account}::${harness}`)?.state
  }

  stop(account: string, harness: string): void {
    const key = `${account}::${harness}`
    const entry = this.entries.get(key)
    if (!entry || entry.state.status !== 'running') return
    try { entry.proc.kill() } catch {}
    this.finish(key, entry, null)
  }

  dispose(): void {
    for (const [key, entry] of this.entries) {
      if (entry.state.status === 'running') {
        try { entry.proc.kill() } catch {}
      }
      this.drop(key)
    }
  }

  private ingest(entry: Entry, data: string): void {
    const lines = (entry.partial + data).split('\n')
    entry.partial = lines.pop() ?? ''
    for (const raw of lines) this.addLine(entry.state, raw)
  }

  private addLine(state: LoginState, raw: string): void {
    const line = raw.replace(ANSI_RE, '').replace(/\r/g, '').trim()
    if (!line) return
    state.output.push(line)
    if (state.output.length > OUTPUT_LINES) state.output.splice(0, state.output.length - OUTPUT_LINES)
    state.url ??= URL_RE.exec(line)?.[1] ?? null
    state.code ??= CODE_RE.exec(line)?.[1] ?? null
  }

  private finish(key: string, entry: Entry, exitCode: number | null): void {
    if (entry.state.status === 'exited') return
    if (entry.partial) this.addLine(entry.state, entry.partial)
    entry.partial = ''
    entry.state.status = 'exited'
    entry.state.exitCode = exitCode
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
    }, KEEP_EXITED_MS)
  }

  private drop(key: string): void {
    const entry = this.entries.get(key)
    if (entry?.timer) clearTimeout(entry.timer)
    this.entries.delete(key)
  }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @forge-dev/core exec vitest run src/login-manager.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the core suite and build**

Run: `pnpm --filter @forge-dev/core test && pnpm --filter @forge-dev/core build`
Expected: all tests PASS, `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/login-manager.ts packages/core/src/login-manager.test.ts
git commit -m "feat(core): run headless harness logins in a hidden PTY"
```

---

### Task 10: Login and API key routes

**Files:**
- Create: `packages/core/src/api-key-login.ts`
- Modify: `packages/core/src/cw-routes.ts` (export `resolveCwBin`, accept a `LoginManager`, four routes)
- Modify: `packages/core/src/cw-routes.test.ts` (append a describe block)
- Modify: `packages/core/src/server.ts:13,46-47,260`

**Interfaces:**
- Consumes: `LoginManager` (Task 9), `supports` (Task 1), `envWithoutHarness` (Task 2), `HARNESS_NAME_RE` (Task 4).
- Produces:
  - `resolveCwBin(cwHome: string): string`
  - `cwRoutes(reader: CWReader, options?: { loginManager?: LoginManager }): Hono`
  - `importApiKey(cwBin: string, account: string, harness: string, apiKey: string): Promise<{ ok: true } | { ok: false; error: string }>`
  - `POST /api/cw/accounts/:name/login` body `{ harness }` → `{ ok: true, login: LoginState }` (404 unknown account, 400 bad harness or no `headless_login`)
  - `GET /api/cw/accounts/:name/login/:harness` → `{ ok: true, login: LoginState }` or 404
  - `DELETE /api/cw/accounts/:name/login/:harness` → `{ ok: true }`
  - `POST /api/cw/accounts/:name/api-key` body `{ harness, apiKey }` → `{ ok: true }`, or 400/404, or 500 `{ ok: false, error }` with the key redacted

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/cw-routes.test.ts` (add `vi` to the `vitest` import and `import { LoginManager } from './login-manager.js'`):

```ts
describe('account login routes', () => {
  const DIR = join(import.meta.dirname, '../.test-cw-logins')
  let app: Hono
  let logins: LoginManager

  const post = (path: string, body: Record<string, unknown>) => app.request(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })

  beforeAll(() => {
    mkdirSync(join(DIR, 'bin'), { recursive: true })
    mkdirSync(join(DIR, 'accounts/work'), { recursive: true })
    writeFileSync(join(DIR, 'bin/cw'), [
      '#!/bin/sh',
      'case "$*" in',
      "  *--no-browser*) printf 'CW_LOGIN_URL=https://auth.openai.com/codex/device\\nCW_LOGIN_CODE=WXYZ-4821\\n'; sleep 30 ;;",
      '  *--with-api-key*)',
      '    read key',
      `    printf '%s\\n' "$@" > '${join(DIR, 'args.txt')}'`,
      `    printf '%s' "$key" > '${join(DIR, 'stdin.txt')}'`,
      '    if [ "$key" = "sk-bad" ]; then echo "rejected key $key" >&2; exit 1; fi',
      '    exit 0 ;;',
      'esac',
      '',
    ].join('\n'))
    chmodSync(join(DIR, 'bin/cw'), 0o755)
    logins = new LoginManager(join(DIR, 'bin/cw'))
    app = new Hono()
    app.route('/api/cw', cwRoutes(new CWReader(DIR), { loginManager: logins }))
  })

  afterAll(() => {
    logins.dispose()
    rmSync(DIR, { recursive: true, force: true })
  })

  it('starts a codex device login and exposes its URL and code', async () => {
    const res = await post('/api/cw/accounts/work/login', { harness: 'codex' })
    expect((await res.json() as { login: { status: string } }).login.status).toBe('running')

    await vi.waitFor(async () => {
      const state = await (await app.request('/api/cw/accounts/work/login/codex')).json() as { login: { url: string | null; code: string | null } }
      expect(state.login).toMatchObject({ url: 'https://auth.openai.com/codex/device', code: 'WXYZ-4821' })
    }, { timeout: 5000 })

    const stopped = await app.request('/api/cw/accounts/work/login/codex', { method: 'DELETE' })
    expect(stopped.status).toBe(200)
    const after = await (await app.request('/api/cw/accounts/work/login/codex')).json() as { login: { status: string } }
    expect(after.login.status).toBe('exited')
  })

  it('refuses a device login on a harness without one', async () => {
    const res = await post('/api/cw/accounts/work/login', { harness: 'claude' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown account', async () => {
    const res = await post('/api/cw/accounts/nobody/login', { harness: 'codex' })
    expect(res.status).toBe(404)
  })

  it('returns 404 when no login is in progress', async () => {
    const res = await app.request('/api/cw/accounts/work/login/opencode')
    expect(res.status).toBe(404)
  })

  it('sends the API key on stdin only', async () => {
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'codex', apiKey: 'sk-good' })
    expect(res.status).toBe(200)
    expect(readFileSync(join(DIR, 'stdin.txt'), 'utf-8')).toBe('sk-good')
    const args = readFileSync(join(DIR, 'args.txt'), 'utf-8').trim().split('\n')
    expect(args).toEqual(['account', 'login', 'work', '--harness', 'codex', '--with-api-key', '-'])
  })

  it('redacts the key when cw rejects it', async () => {
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'codex', apiKey: 'sk-bad' })
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('rejected key ***')
    expect(text).not.toContain('sk-bad')
  })

  it('refuses an API key on a harness without an API key login', async () => {
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'opencode', apiKey: 'sk-good' })
    expect(res.status).toBe(400)
  })

  it('refuses a key with a newline', async () => {
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'codex', apiKey: 'sk-a\nsk-b' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @forge-dev/core exec vitest run src/cw-routes.test.ts -t "account login routes"`
Expected: FAIL (routes return 404 for everything).

- [ ] **Step 3: Implement the API key import**

`packages/core/src/api-key-login.ts`:

```ts
import { spawn } from 'node:child_process'
import { envWithoutHarness } from './cw-doctor.js'

const TIMEOUT_MS = 60000

// Pipes, not a PTY: a PTY would echo the key into its output
export function importApiKey(
  cwBin: string, account: string, harness: string, apiKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const redact = (text: string) => text.split(apiKey).join('***').trim()
    const child = spawn(cwBin, ['account', 'login', account, '--harness', harness, '--with-api-key', '-'], {
      env: envWithoutHarness(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    const collect = (chunk: Buffer) => { output += chunk.toString() }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.stdin.on('error', () => {})
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, error: redact(err.message) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 ? { ok: true } : { ok: false, error: redact(output) || `cw exited with ${String(code)}` })
    })
    child.stdin.end(`${apiKey}\n`)
  })
}
```

- [ ] **Step 4: Add the routes**

In `packages/core/src/cw-routes.ts`:

1. Add imports:

```ts
import { LoginManager } from './login-manager.js'
import { importApiKey } from './api-key-login.js'
```

2. Replace the `cwBin` IIFE and its comment with an exported helper above `cwRoutes`:

```ts
// An absolute path, because Forge is often started where ~/.cw/bin is not on PATH
export function resolveCwBin(cwHome: string): string {
  const candidate = join(cwHome, 'bin', 'cw')
  return existsSync(candidate) ? candidate : 'cw'
}
```

3. Change the signature and the top of `cwRoutes`:

```ts
export function cwRoutes(reader: CWReader, options: { loginManager?: LoginManager } = {}): Hono {
  const app = new Hono()
  const cwBin = resolveCwBin(reader.cwHome)
  const logins = options.loginManager ?? new LoginManager(cwBin)
  const knownAccount = (name: string) => ACCOUNT_NAME_RE.test(name) && reader.getAccounts().includes(name)
```

4. After the `app.delete('/accounts/:name', ...)` handler add:

```ts
  app.post('/accounts/:name/login', async (c) => {
    const name = c.req.param('name')
    const { harness } = await c.req.json<{ harness?: string }>()
    if (!knownAccount(name)) return c.json({ ok: false, error: 'Unknown account' }, 404)
    if (!harness || !HARNESS_NAME_RE.test(harness)) return c.json({ ok: false, error: 'Invalid harness' }, 400)
    if (!supports(harness, 'headless_login')) {
      return c.json({ ok: false, error: `${harness} has no headless login` }, 400)
    }
    return c.json({ ok: true, login: logins.start(name, harness) })
  })

  app.get('/accounts/:name/login/:harness', (c) => {
    const login = logins.get(c.req.param('name'), c.req.param('harness'))
    return login ? c.json({ ok: true, login }) : c.json({ ok: false, error: 'No login in progress' }, 404)
  })

  app.delete('/accounts/:name/login/:harness', (c) => {
    logins.stop(c.req.param('name'), c.req.param('harness'))
    return c.json({ ok: true })
  })

  app.post('/accounts/:name/api-key', async (c) => {
    const name = c.req.param('name')
    const { harness, apiKey } = await c.req.json<{ harness?: string; apiKey?: string }>()
    if (!knownAccount(name)) return c.json({ ok: false, error: 'Unknown account' }, 404)
    if (!harness || !HARNESS_NAME_RE.test(harness)) return c.json({ ok: false, error: 'Invalid harness' }, 400)
    if (!supports(harness, 'api_key_login')) {
      return c.json({ ok: false, error: `${harness} has no API key login` }, 400)
    }
    if (!apiKey || /[\r\n]/.test(apiKey) || apiKey.length > 4096) {
      return c.json({ ok: false, error: 'Invalid API key' }, 400)
    }
    const result = await importApiKey(cwBin, name, harness, apiKey)
    return result.ok ? c.json({ ok: true }) : c.json({ ok: false, error: result.error }, 500)
  })
```

- [ ] **Step 5: Own and dispose the manager in the server**

In `packages/core/src/server.ts`:

1. Change the import to `import { cwRoutes, resolveCwBin } from './cw-routes.js'` and add `import { LoginManager } from './login-manager.js'`.
2. Replace `app.route('/api/cw', cwRoutes(cwReader))` with:

```ts
  const loginManager = new LoginManager(resolveCwBin(cwReader.cwHome))
  app.route('/api/cw', cwRoutes(cwReader, { loginManager }))
```

3. Change `close` to `close: () => { ptyManager.dispose(); loginManager.dispose(); sandboxManager.dispose(); db.close() }`.

- [ ] **Step 6: Run the core suite and build**

Run: `pnpm --filter @forge-dev/core test && pnpm --filter @forge-dev/core build`
Expected: all tests PASS, `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/api-key-login.ts packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts packages/core/src/server.ts
git commit -m "feat(core): add device login and API key routes for accounts"
```

---

### Task 11: Matrix cell and device login panel

**Files:**
- Create: `packages/console/src/components/AccountCell.tsx`
- Create: `packages/console/src/components/DeviceLoginPanel.tsx`

**Interfaces:**
- Consumes: `CWDoctorCell` (Task 1); `findCell`, `getHarnessStyle` (Task 5); `loadHarnesses`, `watchUntil` (Task 5); login and API key routes (Task 10).
- Produces:
  - `type CellView` and `cellView(cell: CWDoctorCell, connecting: boolean): CellView`
  - `AccountCell` props `{ cell: CWDoctorCell; connecting: boolean; onConnect: () => void; onCancel: () => void }`
  - `DeviceLoginPanel` props `{ account: string; harness: string; canUseApiKey: boolean; onConnected: () => void; onClose: () => void }`

- [ ] **Step 1: Create the cell**

`packages/console/src/components/AccountCell.tsx`:

```tsx
import { type FunctionComponent, type ComponentChildren } from 'preact'
import type { CWDoctorCell } from '@forge-dev/core'

export type CellView =
  | { kind: 'connecting' }
  | { kind: 'not_installed'; detail: string }
  | { kind: 'error'; detail: string }
  | { kind: 'local'; providerModel: string; reachable: boolean | null; pulled: boolean | null }
  | { kind: 'api_key'; providerModel: string | null }
  | { kind: 'connected' }
  | { kind: 'connect' }

export const cellView = (cell: CWDoctorCell, connecting: boolean): CellView => {
  if (connecting) return { kind: 'connecting' }
  const detail = typeof cell.detail === 'string' ? cell.detail : ''
  const providerModel = [cell.provider, cell.model].filter(Boolean).join(' · ')
  if (cell.status === 'not_installed') return { kind: 'not_installed', detail }
  if (cell.status === 'error') return { kind: 'error', detail }
  if (cell.status === 'local') {
    const local = cell.detail && typeof cell.detail === 'object' ? cell.detail : null
    return { kind: 'local', providerModel, reachable: local?.reachable ?? null, pulled: local?.model_pulled ?? null }
  }
  if (cell.status === 'connected' && (cell.provider_kind === 'api' || cell.has_api_key)) {
    return { kind: 'api_key', providerModel: cell.provider !== 'native' ? providerModel : null }
  }
  if (cell.status === 'connected') return { kind: 'connected' }
  return { kind: 'connect' }
}

const Status: FunctionComponent<{ color: string; label: string }> = ({ color, label }) => (
  <span class="inline-flex items-center gap-1.5 font-semibold" style={{ color }}>
    <span class="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </span>
)

const Sub: FunctionComponent<{ children: ComponentChildren }> = ({ children }) => (
  <span class="text-[11px] text-forge-muted">{children}</span>
)

export const AccountCell: FunctionComponent<{
  cell: CWDoctorCell
  connecting: boolean
  onConnect: () => void
  onCancel: () => void
}> = ({ cell, connecting, onConnect, onCancel }) => {
  const view = cellView(cell, connecting)
  return (
    <div class="grid gap-0.5 justify-items-start text-xs">
      {view.kind === 'connecting' && (
        <>
          <Status color="var(--forge-accent)" label="Connecting…" />
          <button class="text-[11px] text-forge-muted underline" onClick={onCancel}>Cancel</button>
        </>
      )}
      {view.kind === 'not_installed' && (
        <>
          <span class="text-forge-muted">Not installed</span>
          {view.detail && <Sub>{view.detail}</Sub>}
        </>
      )}
      {view.kind === 'error' && (
        <>
          <Status color="var(--forge-error)" label="Error" />
          {view.detail && <Sub>{view.detail}</Sub>}
        </>
      )}
      {view.kind === 'local' && (
        <>
          <Status color="var(--forge-warning)" label="Local" />
          <Sub>{view.providerModel}</Sub>
          {view.reachable !== null && (
            <Sub>
              {view.reachable ? 'reachable ✓' : 'unreachable ✗'}
              {view.pulled !== null && ` · ${view.pulled ? 'model pulled ✓' : 'model not pulled ✗'}`}
            </Sub>
          )}
        </>
      )}
      {view.kind === 'api_key' && (
        <>
          <Status color="var(--forge-success)" label="API key" />
          {view.providerModel && <Sub>{view.providerModel}</Sub>}
        </>
      )}
      {view.kind === 'connected' && <Status color="var(--forge-success)" label="Connected" />}
      {view.kind === 'connect' && (
        <>
          <button
            class="px-2.5 py-1 rounded-lg text-xs font-semibold border text-forge-accent"
            style={{ backgroundColor: 'var(--forge-tint-accent-bg)', borderColor: 'var(--forge-accent)' }}
            onClick={onConnect}
          >
            Connect
          </button>
          <Sub>not logged in</Sub>
        </>
      )}
      {cell.unofficial && (
        <span class="text-[10px] px-1.5 rounded" style={{ color: 'var(--forge-warning)', border: '1px solid currentColor' }}>
          unofficial
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the device login panel**

`packages/console/src/components/DeviceLoginPanel.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import { findCell, getHarnessStyle } from '../config/types.js'
import { loadHarnesses, watchUntil } from '../hooks/useHarnesses.js'

interface LoginState {
  status: 'running' | 'exited'
  url: string | null
  code: string | null
  exitCode: number | null
  output: string[]
}

interface DeviceLoginPanelProps {
  account: string
  harness: string
  canUseApiKey: boolean
  onConnected: () => void
  onClose: () => void
}

const POLL_MS = 3000

export const DeviceLoginPanel: FunctionComponent<DeviceLoginPanelProps> = ({
  account, harness, canUseApiKey, onConnected, onClose,
}) => {
  const [login, setLogin] = useState<LoginState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)

  const label = getHarnessStyle(harness).label
  const accountUrl = `/api/cw/accounts/${encodeURIComponent(account)}`
  const stateUrl = `${accountUrl}/login/${encodeURIComponent(harness)}`

  useEffect(() => {
    let cancelled = false
    let poll: ReturnType<typeof setInterval> | null = null
    setLogin(null)

    const read = async () => {
      const res = await fetch(stateUrl).catch(() => null)
      if (!res?.ok || cancelled) return
      const { login: next } = await res.json() as { login: LoginState }
      setLogin(next)
      if (next.status === 'exited' && poll) {
        clearInterval(poll)
        poll = null
      }
    }

    fetch(`${accountUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ harness }),
    })
      .then(r => r.json() as Promise<{ ok: boolean; error?: string; login?: LoginState }>)
      .then((result) => {
        if (cancelled) return
        if (!result.ok || !result.login) {
          showToast(result.error ?? 'Could not start the login', 'error')
          return
        }
        setLogin(result.login)
        poll = setInterval(read, POLL_MS)
      })
      .catch(() => showToast('Could not start the login', 'error'))

    const stopWatching = watchUntil(
      doctor => findCell(doctor, account, harness)?.status === 'connected',
      {
        onDone: (matched) => {
          if (!matched) return
          fetch(stateUrl, { method: 'DELETE' }).catch(() => {})
          showToast(`${account} is connected to ${label}`, 'success')
          onConnected()
        },
      },
    )

    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      stopWatching()
    }
  }, [account, harness, attempt])

  const cancel = () => {
    fetch(stateUrl, { method: 'DELETE' }).catch(() => {})
    onClose()
  }

  const saveKey = async () => {
    const key = apiKey.trim()
    if (!key) return
    setSavingKey(true)
    try {
      const res = await fetch(`${accountUrl}/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harness, apiKey: key }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        setApiKey('')
        showToast('API key saved', 'success')
        loadHarnesses(true)
      } else {
        showToast(result.error ?? 'Could not save the API key', 'error')
      }
    } catch {
      showToast('Could not save the API key', 'error')
    } finally {
      setSavingKey(false)
    }
  }

  const exited = login?.status === 'exited'

  return (
    <div class="rounded-xl p-4 grid gap-3" style={{ border: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-forge-text">Connect {account} on {label}</h3>
        <button class="text-xs text-forge-muted hover:text-forge-text" onClick={cancel}>Cancel</button>
      </div>

      {!login && <p class="text-xs text-forge-muted">Starting the login…</p>}

      {login && !exited && (
        <>
          <div class="flex flex-wrap items-center gap-3">
            {login.url && (
              <a
                href={login.url}
                target="_blank"
                rel="noopener noreferrer"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--forge-accent)' }}
              >
                Open login ↗
              </a>
            )}
            {login.code && (
              <>
                <span class="font-mono text-lg tracking-widest text-forge-text">{login.code}</span>
                <button
                  class="px-2 py-1 text-xs rounded border border-forge-border text-forge-muted hover:text-forge-text"
                  onClick={() => { navigator.clipboard.writeText(login.code ?? ''); showToast('Code copied', 'info') }}
                >
                  Copy
                </button>
              </>
            )}
          </div>
          <p class="text-xs text-forge-muted">
            {login.url || login.code ? 'Checks every 3 s. The cell turns Connected on its own.' : 'Waiting for the login URL…'}
          </p>
        </>
      )}

      {exited && (
        <div class="flex items-center gap-3 text-xs">
          <span style={{ color: 'var(--forge-error)' }}>The login ended before connecting.</span>
          <button class="underline text-forge-text" onClick={() => setAttempt(n => n + 1)}>Retry</button>
        </div>
      )}

      {login && login.output.length > 0 && (
        <details class="text-xs">
          <summary class="cursor-pointer text-forge-muted">Output</summary>
          <pre class="mt-2 p-2 rounded overflow-x-auto text-[11px] text-forge-text" style={{ backgroundColor: 'var(--forge-bg)' }}>
            {login.output.join('\n')}
          </pre>
        </details>
      )}

      {canUseApiKey && (
        <div class="grid gap-2 pt-3" style={{ borderTop: '1px solid var(--forge-ghost-border)' }}>
          <span class="text-[11px] uppercase tracking-wider text-forge-muted">or with an API key</span>
          <div class="flex gap-2 items-center">
            <input
              type="password"
              autocomplete="off"
              value={apiKey}
              onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
              placeholder="sk-…"
              class="flex-1 px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            />
            <ActionButton label="Save" variant="secondary" loading={savingKey} disabled={!apiKey.trim()} onClick={saveKey} />
          </div>
          <p class="text-[11px] text-forge-muted">Sent to cw over stdin. Forge never stores or shows it.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check and build**

Run: `pnpm --filter @forge-dev/core build && pnpm --dir packages/console exec tsc --noEmit -p . && pnpm --filter @forge-dev/console build`
Expected: all exit 0. Both components are rendered by Task 12, where the browser check happens.

- [ ] **Step 4: Commit**

```bash
git add packages/console/src/components/AccountCell.tsx packages/console/src/components/DeviceLoginPanel.tsx
git commit -m "feat(console): add the account matrix cell and device login panel"
```

---

### Task 12: Accounts screen, add account and wiring

**Files:**
- Modify: `packages/console/src/config/types.ts` (add `ACCOUNT_NAME_RE`)
- Create: `packages/console/src/components/AddAccountForm.tsx`
- Create: `packages/console/src/pages/Accounts.tsx`
- Delete: `packages/console/src/pages/CreateAccountModal.tsx`
- Modify: `packages/console/src/app.tsx`
- Modify: `packages/console/src/pages/TaskList.tsx` (button and prop rename)
- Modify: `packages/console/src/pages/TaskDetail.tsx` (login sessions)

**Interfaces:**
- Consumes: `AccountCell`, `DeviceLoginPanel` (Task 11); `HarnessBadge` (Task 7); `HarnessesResponse`, `harnesses`, `loadHarnesses`, `supportsIn` (Task 5); `NewTask` prop `onOpenAccounts` (Task 6); `POST /api/cw/accounts` (Task 8); `type: 'login'` in `/start` (Task 4).
- Produces: `Accounts` props `{ onBack: () => void; onOpenSession: (session: CWSession) => void; onAccountsChanged: () => void }`; `AddAccountForm` props `{ response: HarnessesResponse | null; onCancel: () => void; onCreated: () => void }`; `TaskList` prop `onOpenAccounts` replaces `onCreateAccount`; `listView` gains `'accounts'`.

Design note: opening a login tab switches Forge to the tabs view, which unmounts the Accounts screen. Returning to it runs a fresh `cw doctor --json`, so the terminal Connect path needs no background watcher.

- [ ] **Step 1: Share the account name pattern**

Append to `packages/console/src/config/types.ts`:

```ts
// Mirrors ACCOUNT_NAME_RE in @forge-dev/core, which the console does not import at runtime
export const ACCOUNT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
```

- [ ] **Step 2: Create the add account form**

`packages/console/src/components/AddAccountForm.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import { ACCOUNT_NAME_RE, getHarnessStyle } from '../config/types.js'
import { supportsIn, type HarnessesResponse } from '../hooks/useHarnesses.js'

interface AddAccountFormProps {
  response: HarnessesResponse | null
  onCancel: () => void
  onCreated: () => void
}

const inputClass = 'w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none'

export const AddAccountForm: FunctionComponent<AddAccountFormProps> = ({ response, onCancel, onCreated }) => {
  const [name, setName] = useState('')
  const [harness, setHarness] = useState('')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [creating, setCreating] = useState(false)

  const trimmed = name.trim()
  const valid = ACCOUNT_NAME_RE.test(trimmed)
  const harnessNames = response?.available ? response.doctor.harnesses.map(h => h.name) : []
  const acceptsProvider = Boolean(harness) && supportsIn(response, harness, 'custom_provider')

  const create = async () => {
    if (!valid || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/cw/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          harness: harness || undefined,
          provider: acceptsProvider ? provider.trim() || undefined : undefined,
          model: acceptsProvider ? model.trim() || undefined : undefined,
        }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast(`Account "${trimmed}" created`, 'success')
        onCreated()
      } else {
        showToast(result.error ?? 'Failed to create account', 'error')
      }
    } catch {
      showToast('Failed to create account', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div class="rounded-xl p-4 mb-4 grid gap-3 max-w-lg" style={{ border: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
      <div>
        <label class="block text-sm font-medium mb-1">Account name</label>
        <input
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create() }}
          placeholder="my-account"
          class={inputClass}
          autoFocus
        />
        {trimmed && !valid && (
          <p class="text-xs mt-1" style={{ color: 'var(--forge-error)' }}>
            Must start with a letter or number. Only letters, numbers, hyphens, and underscores allowed.
          </p>
        )}
      </div>

      {harnessNames.length > 0 && (
        <div>
          <label class="block text-sm font-medium mb-1">Default harness</label>
          <div class="flex flex-wrap gap-2">
            {['', ...harnessNames].map(h => (
              <button
                key={h || 'default'}
                class={`px-3 py-1.5 text-xs rounded-lg border ${harness === h ? 'text-forge-accent' : 'border-forge-border bg-forge-surface text-forge-muted'}`}
                style={harness === h ? { backgroundColor: 'var(--forge-tint-accent-bg)', borderColor: 'var(--forge-accent)' } : undefined}
                onClick={() => setHarness(h)}
              >
                {h ? getHarnessStyle(h).label : 'Claude Code (default)'}
              </button>
            ))}
          </div>
          <p class="text-xs text-forge-muted mt-1">The default harness cannot be changed later.</p>
        </div>
      )}

      {acceptsProvider && (
        <div class="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label class="block text-sm font-medium mb-1">Provider <span class="font-normal text-forge-muted">(optional)</span></label>
            <input type="text" value={provider} onInput={(e) => setProvider((e.target as HTMLInputElement).value)} placeholder="zai, ollama, openrouter" class={inputClass} />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Model <span class="font-normal text-forge-muted">(optional)</span></label>
            <input type="text" value={model} onInput={(e) => setModel((e.target as HTMLInputElement).value)} placeholder="glm-5.1" class={inputClass} />
          </div>
        </div>
      )}

      <div class="flex gap-2">
        <ActionButton label={creating ? 'Creating...' : 'Add account'} variant="primary" loading={creating} disabled={!valid} onClick={create} />
        <ActionButton label="Cancel" variant="secondary" onClick={onCancel} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create the Accounts page**

`packages/console/src/pages/Accounts.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { findCell, getHarnessStyle } from '../config/types.js'
import { harnesses, loadHarnesses, supportsIn } from '../hooks/useHarnesses.js'
import { AccountCell } from '../components/AccountCell.js'
import { DeviceLoginPanel } from '../components/DeviceLoginPanel.js'
import { AddAccountForm } from '../components/AddAccountForm.js'
import { HarnessBadge } from '../components/HarnessBadge.js'

interface AccountsProps {
  onBack: () => void
  onOpenSession: (session: CWSession) => void
  onAccountsChanged: () => void
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export const Accounts: FunctionComponent<AccountsProps> = ({ onBack, onOpenSession, onAccountsChanged }) => {
  const [deviceLogin, setDeviceLogin] = useState<{ account: string; harness: string } | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => { loadHarnesses(true) }, [])

  const response = harnesses.value
  const remote = !LOCAL_HOSTS.has(window.location.hostname)

  const cancelDeviceLogin = () => {
    if (!deviceLogin) return
    fetch(`/api/cw/accounts/${encodeURIComponent(deviceLogin.account)}/login/${encodeURIComponent(deviceLogin.harness)}`, { method: 'DELETE' })
      .catch(() => {})
    setDeviceLogin(null)
  }

  const connect = async (account: string, harness: string) => {
    if (supportsIn(response, harness, 'headless_login')) {
      setDeviceLogin({ account, harness })
      return
    }
    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'login', account, harness }),
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok && result.session) onOpenSession(result.session)
      else showToast(result.error ?? 'Could not open the login', 'error')
    } catch {
      showToast('Could not open the login', 'error')
    }
  }

  return (
    <div>
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
        style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
        onClick={onBack}
      >
        ← Back to tasks
      </button>

      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">Accounts</h2>
        <div class="flex gap-2">
          <ActionButton label="Refresh" variant="secondary" onClick={() => { loadHarnesses(true) }} />
          <ActionButton label="+ Add account" variant="primary" onClick={() => setAdding(true)} />
        </div>
      </div>

      {adding && (
        <AddAccountForm
          response={response}
          onCancel={() => setAdding(false)}
          onCreated={() => { setAdding(false); loadHarnesses(true); onAccountsChanged() }}
        />
      )}

      {!response && <p class="text-sm text-forge-muted">Reading cw doctor…</p>}

      {response && !response.available && (
        <div class="rounded-xl p-4 text-sm" style={{ border: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
          <p class="mb-1 text-forge-text">Harness status is unavailable: {response.reason}</p>
          <p class="text-xs text-forge-muted mb-3">The account matrix needs CW 0.3.0 or newer. You can still add an account by name.</p>
          <ActionButton label="Retry" variant="secondary" onClick={() => { loadHarnesses(true) }} />
        </div>
      )}

      {response?.available && (
        <>
          {remote && (
            <div class="rounded-lg px-3 py-2 mb-4 text-xs text-forge-text" style={{ backgroundColor: 'var(--forge-tint-amber-bg)', border: '1px solid var(--forge-tint-amber-border)' }}>
              Forge is not opened on localhost. Browser logins redirect to localhost on the machine running the harness, so only Codex's device code works from here.
            </div>
          )}

          {[...response.doctor.issues, ...response.doctor.warnings].length > 0 && (
            <ul class="mb-4 grid gap-1 text-xs">
              {response.doctor.issues.map(f => <li key={f.code} style={{ color: 'var(--forge-error)' }}>{f.message}</li>)}
              {response.doctor.warnings.map(f => <li key={f.code} class="text-forge-muted">{f.message}</li>)}
            </ul>
          )}

          <div class="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class="text-left p-3 text-xs font-semibold text-forge-muted">Account</th>
                  {response.doctor.harnesses.map(h => (
                    <th key={h.name} class="text-left p-3" style={{ minWidth: '150px' }}>
                      <HarnessBadge session={{ harness: h.name }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {response.doctor.accounts.map(account => {
                  const defaultCell = findCell(response.doctor, account.name, account.default_harness)
                  return (
                    <tr key={account.name} style={{ borderTop: '1px solid var(--forge-ghost-border)' }}>
                      <td class="p-3 align-top">
                        <div class="font-semibold text-forge-text">{account.name}</div>
                        <div class="text-xs text-forge-muted">
                          default: {getHarnessStyle(account.default_harness).label}
                          {defaultCell && defaultCell.provider !== 'native' ? ` · ${defaultCell.provider}` : ''}
                        </div>
                      </td>
                      {response.doctor.harnesses.map(h => {
                        const cell = findCell(response.doctor, account.name, h.name)
                        return (
                          <td key={h.name} class="p-3 align-top">
                            {cell ? (
                              <AccountCell
                                cell={cell}
                                connecting={deviceLogin?.account === account.name && deviceLogin.harness === h.name}
                                onConnect={() => { connect(account.name, h.name) }}
                                onCancel={cancelDeviceLogin}
                              />
                            ) : <span class="text-xs text-forge-muted">—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {deviceLogin && (
            <div class="mt-4 max-w-lg">
              <DeviceLoginPanel
                key={`${deviceLogin.account}::${deviceLogin.harness}`}
                account={deviceLogin.account}
                harness={deviceLogin.harness}
                canUseApiKey={supportsIn(response, deviceLogin.harness, 'api_key_login')}
                onConnected={() => setDeviceLogin(null)}
                onClose={() => setDeviceLogin(null)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire it into the app and remove the modal**

1. `git rm packages/console/src/pages/CreateAccountModal.tsx`
2. `packages/console/src/app.tsx`:
   - Remove the `CreateAccountModal` import, the `showCreateAccount` state, and the `<CreateAccountModal ... />` element.
   - Add `import { Accounts } from './pages/Accounts.js'`.
   - Change the `listView` state type to `'list' | 'new-task' | 'skills' | 'accounts'`.
   - On `<TaskList>`, replace `onCreateAccount={() => setShowCreateAccount(true)}` with `onOpenAccounts={() => setListView('accounts')}`.
   - On `<NewTask>`, add `onOpenAccounts={() => setListView('accounts')}`.
   - Before the `listView === 'skills'` branch add:

```tsx
        ) : listView === 'accounts' ? (
          <Accounts
            onBack={() => setListView('list')}
            onOpenSession={tabs.openTab}
            onAccountsChanged={() => { fetchData() }}
          />
```

3. `packages/console/src/pages/TaskList.tsx`: rename the prop `onCreateAccount` to `onOpenAccounts` in `TaskListProps` and the destructuring, and change the header button to call `onOpenAccounts` with the label `Accounts` instead of `+ Account`.
4. `packages/console/src/pages/TaskDetail.tsx`: add `const isLogin = session.type === 'login'` after `typeCfg`; change the data effect to `useEffect(() => { if (!isLogin) fetchData() }, [session])`; change the Done condition to `session.status === 'active' && !isLogin`.

- [ ] **Step 5: Type-check and build**

Run: `pnpm build && pnpm --dir packages/console exec tsc --noEmit -p .`
Expected: both exit 0; `grep -rn CreateAccountModal packages/console/src` prints nothing.

- [ ] **Step 6: Browser check**

With `FORGE_PORT=3100 node packages/platform/dist/index.js` running (do not stop a Forge on port 3000):

1. Click "Accounts". Expected: one row per account and one column per harness, matching `~/.cw/bin/cw doctor --json | python3 -m json.tool` cell by cell (status, provider, model, detail).
2. Click "+ Add account", enter `forge-tmp-codex`, pick Codex. Expected: provider and model inputs appear; create succeeds; the row appears with "default: Codex". Pick Claude Code instead on a second try and confirm provider and model are hidden.
3. On `forge-tmp-codex`, click Connect in the Codex column. Expected: the cell reads "Connecting…"; the panel shows "Open login ↗" and a device code within a few seconds; `pgrep -fl "account login"` shows `--no-browser`. Ask the user to finish the login in the browser; the cell turns "Connected" and the panel closes. If the user declines, click Cancel and confirm `pgrep -fl "account login"` prints nothing.
4. Click Connect in the Claude Code column of `forge-tmp-codex`. Expected: a "Login: forge-tmp-codex · Claude Code" tab opens running `cw account login forge-tmp-codex --harness claude`, with no Done button. Close the tab, open Accounts again, and confirm it reloads.
5. In New Task, pick an account whose Codex cell is not logged in. Expected: the Codex pill shows "not logged in" with a Connect link that opens Accounts.
6. Remove `forge-tmp-codex` with the account banner's "Remove account" in the task list. Stop only the port 3100 server.

- [ ] **Step 7: Commit**

```bash
git add packages/console/src/config/types.ts packages/console/src/components/AddAccountForm.tsx packages/console/src/pages/Accounts.tsx packages/console/src/app.tsx packages/console/src/pages/TaskList.tsx packages/console/src/pages/TaskDetail.tsx
git commit -m "feat(console): replace the add account modal with an account by harness matrix"
```

---

### Task 13: Review, docs and close

**Files:**
- Modify: `CLAUDE.md` (API endpoints, key files, test count)
- Modify: `README.md` (What It Does)
- Create: `CHANGELOG.md`
- Modify: `docs/specs/2026-09-11-harness-integration.md` (§9 results)

**Interfaces:**
- Consumes: everything above.
- Produces: documentation only.

- [ ] **Step 1: Simplify pass**

Run `/simplify` over `git diff origin/main...HEAD -- packages`. Fix what it finds, then run `pnpm test && pnpm build && pnpm --dir packages/console exec tsc --noEmit -p .`. Expected: all pass. Commit any fixes as `refactor: <what changed>`.

- [ ] **Step 2: Update `CLAUDE.md`**

Under "API Endpoints", after the `POST /api/cw/start` line, add:

```markdown
- `GET /api/cw/harnesses` — `cw doctor --json`, per-harness capabilities, Linear/Notion token presence
- `POST /api/cw/accounts` — Create an account (optional harness, provider, model)
- `POST /api/cw/accounts/:name/login`, `GET|DELETE /api/cw/accounts/:name/login/:harness` — Headless device login (codex)
- `POST /api/cw/accounts/:name/api-key` — Import an API key over stdin (codex)
```

Under "Key Files → Core" add:

```markdown
- `packages/core/src/cw-doctor.ts` — Shared `cw doctor --json` client, `CW_HARNESS` stripping, context tokens
- `packages/core/src/harness-capabilities.ts` — Capability table (CW does not expose it)
- `packages/core/src/login-manager.ts` — Hidden PTYs for headless logins
```

Under "Key Files → Console" add:

```markdown
- `packages/console/src/hooks/useHarnesses.ts` — Shared harness store, 3 s polling
- `packages/console/src/pages/Accounts.tsx` — Account × harness matrix and Connect flows
```

In the Stack table, replace the test count with the number `pnpm test` reports.

- [ ] **Step 3: Update `README.md`**

In "What It Does", after the Task list bullet, add:

```markdown
- **Any harness** — run a task on Claude Code, Codex, Pi or OpenCode and see which one each session uses (needs CW 0.3.0)
- **Accounts** — an account × harness matrix with one-click Connect; Codex logs in with a device code, no terminal
```

- [ ] **Step 4: Create `CHANGELOG.md`**

```markdown
# Changelog

## Unreleased

### Added

- Harness selector in New Task, preselecting the project's or the account's default harness from `cw doctor --json`.
- Harness badge on task cards, done rows and the task detail bar, and a harness filter in the task list.
- Accounts screen: an account × harness matrix, Codex device login and API key import, and a terminal login for Claude Code, Pi and OpenCode.
- `GET /api/cw/harnesses` and the account login and API key endpoints.

### Changed

- Forge removes `CW_HARNESS` from the environment of every `cw` command it runs, except a new General session.
- New sessions pass `--harness`; resumed sessions never do.
- The task list's "+ Account" button is now "Accounts"; creating an account no longer opens a terminal.

### Removed

- The Plan task type, which launched `cw work`.
- Design from New Task, the quick buttons and the filters.

### Known limits

- Browser OAuth redirects to localhost on the machine running the harness. From a remote host only Codex's device code works.
```

- [ ] **Step 5: Walk the acceptance criteria**

With a worktree Forge on `FORGE_PORT=3100`, check each criterion from the brief and keep the exact commands and outputs for the pull request description:

1. No harness chosen: start a Dev task on Claude Code and confirm `pgrep -fl "cw work"` matches today's command plus `--harness claude`, and existing sessions show "Claude Code".
2. Dev task on Codex: tab runs codex in the worktree; `session.json` records `"harness": "codex"`.
3. Reopen it: `pgrep -fl "cw work"` shows no `--harness`.
4. Loop offers only Claude Code; General on Codex runs `cw launch <account>` with `CW_HARNESS=codex` (`ps eww -p <pid> | tr ' ' '\n' | grep CW_HARNESS`) and no `--model`.
5. Accounts matrix equals `cw doctor --json` for every account and harness.
6. Codex Connect completes without typing a command (the user finishes the browser step).
7. Claude, Pi or OpenCode Connect opens the visible terminal on `cw account login`.
8. A local Ollama account shows "Local" with reachability and pull status (skip and say so if none exists).
9. An API-provider session shows a badge like "OpenCode · glm-5.1" (skip and say so if none exists).
10. `pnpm test` passes and no test touched `~/.cw` or `~/.forge` (`git status` clean, no new files under either).

- [ ] **Step 6: Record the verification results**

In `docs/specs/2026-09-11-harness-integration.md` §9, append to each bullet what was observed (for example "verified: codex prints both lines through a PTY" or "not verified: no Ollama account"). Correct any part of the spec the results contradict.

- [ ] **Step 7: Draft the CW gap issues**

Write one issue per gap (brief gaps 1–7 plus spec gap 8), each with the observed behaviour and the command that shows it. Show the drafts to the user and run `gh issue create -R avarajar/cw` only after they approve.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md README.md CHANGELOG.md docs/specs/2026-09-11-harness-integration.md
git commit -m "docs: document harness-aware sessions and the Accounts screen"
```

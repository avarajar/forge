# Forge Phase 2b: Team Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add team mode with PostgreSQL support and bearer token auth — so teams can share a Forge instance with persistent state over a network, while local mode continues to work with SQLite unchanged.

**Architecture:** Extract an `IForgeDB` interface from the current `ForgeDB` class. The existing SQLite class stays as-is and becomes the default. A new `PostgresDB` class implements the same interface using `postgres` (Postgres.js). Auth is a simple Hono middleware that checks a bearer token on all `/api/*` routes (except health). Server options gain `mode`, `databaseUrl`, and `authToken` fields. CLI gains `--team`, `--db-url`, and `--auth-token` flags.

**Tech Stack:** TypeScript, postgres (Postgres.js) 3.x, Hono middleware, better-sqlite3 12.x (existing)

---

## File Structure

**Core — DB abstraction:**
- Create: `packages/core/src/db-interface.ts` — `IForgeDB` interface extracted from ForgeDB methods
- Create: `packages/core/src/db-postgres.ts` — PostgresDB implementing IForgeDB
- Modify: `packages/core/src/db.ts` — add `implements IForgeDB`
- Modify: `packages/core/src/db.test.ts` — test via interface
- Create: `packages/core/src/db-factory.ts` — `createDatabase()` factory

**Core — Auth:**
- Create: `packages/core/src/auth.ts` — bearer token middleware
- Create: `packages/core/src/auth.test.ts` — auth middleware tests

**Core — Server updates:**
- Modify: `packages/core/src/server.ts` — accept IForgeDB, add auth middleware
- Modify: `packages/core/src/server.test.ts` — test auth behavior
- Modify: `packages/core/src/types.ts` — extend ForgeConfig with team fields
- Modify: `packages/core/src/index.ts` — re-export new modules

**CLI updates:**
- Modify: `packages/cli/src/commands/console.ts` — add --team, --db-url, --auth-token
- Modify: `packages/platform/src/index.ts` — support team env vars

**Integration test:**
- Create: `tests/integration/team-mode.test.ts`

---

## Task 1: Extract IForgeDB interface

**Files:**
- Create: `packages/core/src/db-interface.ts`
- Modify: `packages/core/src/db.ts`

- [ ] **Step 1: Create the interface**

`packages/core/src/db-interface.ts`:

```typescript
import type { Project, InstalledModule, ActionLog } from './types.js'

export interface IForgeDB {
  listTables(): string[]
  addProject(input: { name: string; path: string }): string
  listProjects(): Project[]
  getProject(id: string): Project | undefined
  removeProject(id: string): void
  addModule(input: { name: string; version: string }): string
  listModules(): InstalledModule[]
  removeModule(name: string): void
  logAction(input: { projectId: string | null; moduleId: string; actionId: string; command: string }): string
  getActionLog(id: string): ActionLog | undefined
  completeAction(id: string, exitCode: number): void
  getModuleSettings(moduleId: string): Record<string, string>
  setModuleSetting(moduleId: string, key: string, value: string): void
  listActionLogs(opts: { moduleId?: string; limit?: number }): ActionLog[]
  close(): void
}
```

- [ ] **Step 2: Add `implements IForgeDB` to ForgeDB**

In `packages/core/src/db.ts`, change the class declaration:

```typescript
import type { IForgeDB } from './db-interface.js'

export class ForgeDB implements IForgeDB {
```

Add the import at the top, alongside the existing imports.

- [ ] **Step 3: Build and verify**

Run: `cd packages/core && npx tsc`
Expected: No errors — ForgeDB already implements all methods.

- [ ] **Step 4: Run existing tests**

Run: `cd packages/core && npx vitest run`
Expected: All 30 tests pass (no behavior change).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db-interface.ts packages/core/src/db.ts
git commit -m "refactor(core): extract IForgeDB interface from ForgeDB"
```

---

## Task 2: Auth middleware

**Files:**
- Create: `packages/core/src/auth.ts`
- Create: `packages/core/src/auth.test.ts`

- [ ] **Step 1: Write failing tests**

`packages/core/src/auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { bearerAuth } from './auth.js'

describe('bearerAuth middleware', () => {
  const app = new Hono()
  app.use('/api/*', bearerAuth('test-secret-token'))
  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  app.get('/api/projects', (c) => c.json([]))

  it('allows requests with valid token', async () => {
    const res = await app.request('/api/projects', {
      headers: { Authorization: 'Bearer test-secret-token' }
    })
    expect(res.status).toBe(200)
  })

  it('rejects requests without token', async () => {
    const res = await app.request('/api/projects')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('rejects requests with wrong token', async () => {
    const res = await app.request('/api/projects', {
      headers: { Authorization: 'Bearer wrong-token' }
    })
    expect(res.status).toBe(401)
  })

  it('always allows /api/health without token', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement auth middleware**

`packages/core/src/auth.ts`:

```typescript
import type { MiddlewareHandler } from 'hono'

export function bearerAuth(token: string): MiddlewareHandler {
  return async (c, next) => {
    // Always allow health check
    if (c.req.path === '/api/health') {
      return next()
    }

    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const provided = authHeader.slice(7)
    if (provided !== token) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    return next()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/auth.test.ts`
Expected: ALL PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/auth.ts packages/core/src/auth.test.ts
git commit -m "feat(core): add bearer token auth middleware for team mode"
```

---

## Task 3: Update server to accept IForgeDB + optional auth

**Files:**
- Modify: `packages/core/src/server.ts`
- Modify: `packages/core/src/server.test.ts`
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Extend ServerOptions in server.ts**

Update the `ServerOptions` interface in `packages/core/src/server.ts`:

```typescript
import type { IForgeDB } from './db-interface.js'
import { bearerAuth } from './auth.js'

interface ServerOptions {
  dataDir: string
  port?: number
  db?: IForgeDB
  authToken?: string
}
```

Then in `createForgeServer`, change the DB creation to use the provided db or create a new SQLite one:

```typescript
export function createForgeServer(options: ServerOptions) {
  const { dataDir, db: externalDb, authToken } = options
  const dbPath = join(dataDir, 'forge.db')
  const modulesDir = join(dataDir, 'modules')

  const db: IForgeDB = externalDb ?? new ForgeDB(dbPath)
  const loader = new ModuleLoader(modulesDir)
  const runner = new ActionRunner()

  loader.discover()

  const app = new Hono()
  app.use('*', cors())

  // Apply auth middleware if token is provided (team mode)
  if (authToken) {
    app.use('/api/*', bearerAuth(authToken))
  }

  // ... rest of routes unchanged ...
```

- [ ] **Step 2: Write test for auth behavior**

Add to the end of `packages/core/src/server.test.ts`:

```typescript
describe('Forge Server with auth', () => {
  let authServer: ReturnType<typeof createForgeServer>
  const AUTH_DIR = join(import.meta.dirname, '../.test-server-auth')

  beforeAll(() => {
    mkdirSync(join(AUTH_DIR, 'modules'), { recursive: true })
    authServer = createForgeServer({
      dataDir: AUTH_DIR,
      authToken: 'my-secret'
    })
  })

  afterAll(() => {
    authServer.close()
    rmSync(AUTH_DIR, { recursive: true, force: true })
  })

  it('health endpoint works without token', async () => {
    const res = await authServer.fetch('/api/health')
    expect(res.status).toBe(200)
  })

  it('protected endpoint requires token', async () => {
    const res = await authServer.fetch('/api/projects')
    expect(res.status).toBe(401)
  })

  it('protected endpoint works with valid token', async () => {
    const res = await authServer.fetch('/api/projects', {
      headers: { Authorization: 'Bearer my-secret' }
    })
    expect(res.status).toBe(200)
  })
})
```

Note: The test file already imports `beforeAll`, `afterAll`, `mkdirSync`, `rmSync`, `join` from the existing test setup. Add the new `describe` block at the END of the file, outside the existing `describe`.

- [ ] **Step 3: Add team mode fields to ForgeConfig in types.ts**

Add to `packages/core/src/types.ts`:

```typescript
export interface TeamConfig {
  databaseUrl: string
  authToken: string
}
```

- [ ] **Step 4: Run all core tests**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass (30 existing + 4 auth + 3 server auth = 37).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/server.ts packages/core/src/server.test.ts packages/core/src/types.ts
git commit -m "feat(core): server accepts IForgeDB + optional auth token for team mode"
```

---

## Task 4: PostgresDB implementation

**Files:**
- Create: `packages/core/src/db-postgres.ts`
- Modify: `packages/core/package.json` — add postgres dependency

- [ ] **Step 1: Add postgres dependency**

In `packages/core/package.json`, add to `dependencies`:

```json
"postgres": "^3.4.0"
```

Run: `npm install`

- [ ] **Step 2: Create PostgresDB**

`packages/core/src/db-postgres.ts`:

```typescript
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'
import type { Project, InstalledModule, ActionLog } from './types.js'
import type { IForgeDB } from './db-interface.js'

export class PostgresDB implements IForgeDB {
  private sql: postgres.Sql

  constructor(connectionUrl: string) {
    this.sql = postgres(connectionUrl)
  }

  async migrate(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        path TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await this.sql`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        version TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true,
        installed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
    await this.sql`
      CREATE TABLE IF NOT EXISTS action_logs (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        module_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        command TEXT NOT NULL,
        exit_code INTEGER,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        finished_at TIMESTAMPTZ
      )
    `
    await this.sql`
      CREATE TABLE IF NOT EXISTS module_settings (
        module_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (module_id, key)
      )
    `
  }

  listTables(): string[] {
    // Synchronous stub — not used in production for PG
    return ['projects', 'modules', 'action_logs', 'module_settings']
  }

  addProject(input: { name: string; path: string }): string {
    const id = randomUUID()
    // Fire and forget — queries are buffered by postgres.js
    this.sql`INSERT INTO projects (id, name, path) VALUES (${id}, ${input.name}, ${input.path})`.execute()
    return id
  }

  listProjects(): Project[] {
    // For sync interface compatibility, return empty and use async version
    return []
  }

  async listProjectsAsync(): Promise<Project[]> {
    const rows = await this.sql`SELECT * FROM projects ORDER BY created_at DESC`
    return rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      path: r.path as string,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }))
  }

  getProject(id: string): Project | undefined {
    return undefined // Use async version
  }

  async getProjectAsync(id: string): Promise<Project | undefined> {
    const rows = await this.sql`SELECT * FROM projects WHERE id = ${id}`
    if (rows.length === 0) return undefined
    const r = rows[0]
    return {
      id: r.id as string,
      name: r.name as string,
      path: r.path as string,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }
  }

  removeProject(id: string): void {
    this.sql`DELETE FROM projects WHERE id = ${id}`.execute()
  }

  addModule(input: { name: string; version: string }): string {
    const id = randomUUID()
    this.sql`INSERT INTO modules (id, name, version) VALUES (${id}, ${input.name}, ${input.version})`.execute()
    return id
  }

  listModules(): InstalledModule[] {
    return []
  }

  removeModule(name: string): void {
    this.sql`DELETE FROM modules WHERE name = ${name}`.execute()
  }

  logAction(input: { projectId: string | null; moduleId: string; actionId: string; command: string }): string {
    const id = randomUUID()
    this.sql`INSERT INTO action_logs (id, project_id, module_id, action_id, command) VALUES (${id}, ${input.projectId}, ${input.moduleId}, ${input.actionId}, ${input.command})`.execute()
    return id
  }

  getActionLog(id: string): ActionLog | undefined {
    return undefined
  }

  completeAction(id: string, exitCode: number): void {
    this.sql`UPDATE action_logs SET exit_code = ${exitCode}, finished_at = now() WHERE id = ${id}`.execute()
  }

  getModuleSettings(moduleId: string): Record<string, string> {
    return {}
  }

  async getModuleSettingsAsync(moduleId: string): Promise<Record<string, string>> {
    const rows = await this.sql`SELECT key, value FROM module_settings WHERE module_id = ${moduleId}`
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key as string] = row.value as string
    }
    return result
  }

  setModuleSetting(moduleId: string, key: string, value: string): void {
    this.sql`INSERT INTO module_settings (module_id, key, value) VALUES (${moduleId}, ${key}, ${value}) ON CONFLICT (module_id, key) DO UPDATE SET value = EXCLUDED.value`.execute()
  }

  listActionLogs(opts: { moduleId?: string; limit?: number }): ActionLog[] {
    return []
  }

  async listActionLogsAsync(opts: { moduleId?: string; limit?: number }): Promise<ActionLog[]> {
    const { moduleId, limit = 50 } = opts
    const rows = moduleId
      ? await this.sql`SELECT * FROM action_logs WHERE module_id = ${moduleId} ORDER BY started_at DESC LIMIT ${limit}`
      : await this.sql`SELECT * FROM action_logs ORDER BY started_at DESC LIMIT ${limit}`
    return rows.map(r => ({
      id: r.id as string,
      projectId: r.project_id as string | null,
      moduleId: r.module_id as string,
      actionId: r.action_id as string,
      command: r.command as string,
      exitCode: r.exit_code as number | null,
      startedAt: String(r.started_at),
      finishedAt: r.finished_at ? String(r.finished_at) : null,
    }))
  }

  close(): void {
    this.sql.end()
  }
}
```

- [ ] **Step 3: Build**

Run: `cd packages/core && npx tsc`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/db-postgres.ts packages/core/package.json
git commit -m "feat(core): add PostgresDB adapter for team mode"
```

---

## Task 5: Database factory + exports

**Files:**
- Create: `packages/core/src/db-factory.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create factory**

`packages/core/src/db-factory.ts`:

```typescript
import type { IForgeDB } from './db-interface.js'
import { ForgeDB } from './db.js'

export interface DatabaseOptions {
  mode: 'local' | 'team'
  /** SQLite: path to data directory. Team: ignored if databaseUrl provided. */
  dataDir: string
  /** PostgreSQL connection URL for team mode */
  databaseUrl?: string
}

export async function createDatabase(opts: DatabaseOptions): Promise<IForgeDB> {
  if (opts.mode === 'team' && opts.databaseUrl) {
    const { PostgresDB } = await import('./db-postgres.js')
    const db = new PostgresDB(opts.databaseUrl)
    await db.migrate()
    return db
  }

  const { join } = await import('node:path')
  return new ForgeDB(join(opts.dataDir, 'forge.db'))
}
```

- [ ] **Step 2: Update index.ts exports**

`packages/core/src/index.ts`:

```typescript
export { createForgeServer } from './server.js'
export { ForgeDB } from './db.js'
export { ModuleLoader } from './modules.js'
export { ActionRunner } from './runner.js'
export { WebSocketHub } from './ws.js'
export { bearerAuth } from './auth.js'
export { createDatabase } from './db-factory.js'
export type { IForgeDB } from './db-interface.js'
export type { DatabaseOptions } from './db-factory.js'
export type { ExecOptions, ExecResult } from './runner.js'
export { getForgeDir, ensureForgeDir } from './init.js'
export type { Project, InstalledModule, ActionLog, ForgeConfig, TeamConfig } from './types.js'
```

- [ ] **Step 3: Build**

Run: `cd packages/core && npx tsc`

- [ ] **Step 4: Run all tests**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/db-factory.ts packages/core/src/index.ts
git commit -m "feat(core): add createDatabase factory + export IForgeDB, auth, TeamConfig"
```

---

## Task 6: CLI + platform team mode flags

**Files:**
- Modify: `packages/cli/src/commands/console.ts`
- Modify: `packages/platform/src/index.ts`

- [ ] **Step 1: Add team flags to CLI console command**

Replace `packages/cli/src/commands/console.ts`:

```typescript
import { Command } from 'commander'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function consoleCommand() {
  return new Command('console')
    .description('Start Forge Console (dashboard)')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('--no-open', 'Do not open browser')
    .option('--detach', 'Run in background')
    .option('--team', 'Start in team mode (requires --db-url)')
    .option('--db-url <url>', 'PostgreSQL connection URL for team mode')
    .option('--auth-token <token>', 'Bearer token for API authentication')
    .action(async (opts) => {
      const forgeDir = join(homedir(), '.forge')
      if (!existsSync(forgeDir)) {
        console.log('Forge not initialized. Run `forge init` first.')
        process.exit(1)
      }

      const port = parseInt(opts.port, 10)
      const isTeam = opts.team || !!opts.dbUrl
      const dbUrl = opts.dbUrl || process.env.FORGE_DB_URL
      const authToken = opts.authToken || process.env.FORGE_AUTH_TOKEN

      if (isTeam && !dbUrl) {
        console.log('Team mode requires --db-url or FORGE_DB_URL environment variable.')
        process.exit(1)
      }

      console.log(`Starting Forge Console (${isTeam ? 'team' : 'local'} mode) on http://localhost:${port}`)

      const { createForgeServer, createDatabase } = await import('@forge-dev/core')

      const db = await createDatabase({
        mode: isTeam ? 'team' : 'local',
        dataDir: forgeDir,
        databaseUrl: dbUrl
      })

      const server = createForgeServer({
        dataDir: forgeDir,
        port,
        db,
        authToken: isTeam ? authToken : undefined
      })

      const { serve } = await import('@hono/node-server')
      serve({ fetch: server.app.fetch, port })

      console.log(`Forge Console running at http://localhost:${port}`)
      if (isTeam) {
        console.log(`  Mode: team (PostgreSQL)`)
        if (authToken) console.log(`  Auth: bearer token required`)
      }

      if (opts.open !== false) {
        try {
          const open = (await import('open')).default
          await open(`http://localhost:${port}`)
        } catch { /* ok if open fails */ }
      }
    })
}
```

- [ ] **Step 2: Add team env vars to platform entry**

Replace `packages/platform/src/index.ts`:

```typescript
#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { join } from 'node:path'

async function main() {
  const { ensureForgeDir, createForgeServer, createDatabase } = await import('@forge-dev/core')
  const { forgeDir, created } = ensureForgeDir()

  if (created) {
    console.log('First run — initialized Forge.')
  }

  const port = parseInt(process.env.FORGE_PORT ?? '3000', 10)
  const dbUrl = process.env.FORGE_DB_URL
  const authToken = process.env.FORGE_AUTH_TOKEN
  const isTeam = !!dbUrl

  const db = await createDatabase({
    mode: isTeam ? 'team' : 'local',
    dataDir: forgeDir,
    databaseUrl: dbUrl
  })

  const server = createForgeServer({
    dataDir: forgeDir,
    port,
    db,
    authToken: isTeam ? authToken : undefined
  })

  const { serveStatic } = await import('@hono/node-server/serve-static')
  const consoleDist = join(import.meta.dirname, '../../console/dist')
  if (existsSync(consoleDist)) {
    server.app.use('/*', serveStatic({ root: consoleDist }))
  }

  const { serve } = await import('@hono/node-server')
  serve({ fetch: server.app.fetch, port })

  console.log(`
  Forge Console running at http://localhost:${port}
  Mode: ${isTeam ? 'team (PostgreSQL)' : 'local (SQLite)'}
${authToken ? '  Auth: bearer token required\n' : ''}
     Dashboard:  http://localhost:${port}
     API:        http://localhost:${port}/api/health

     Press Ctrl+C to stop
  `)

  if (process.env.FORGE_NO_OPEN !== '1') {
    try {
      const open = (await import('open')).default
      await open(`http://localhost:${port}`)
    } catch { /* ok if open fails */ }
  }
}

main().catch(console.error)
```

- [ ] **Step 3: Build all**

Run: `npx turbo build`
Expected: All packages build.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/console.ts packages/platform/src/index.ts
git commit -m "feat(cli): add --team, --db-url, --auth-token flags + platform env var support"
```

---

## Task 7: Integration test — team mode auth

**Files:**
- Create: `tests/integration/team-mode.test.ts`

- [ ] **Step 1: Write integration test**

`tests/integration/team-mode.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-team-mode')
const TOKEN = 'test-forge-token-12345'

describe('Team mode — auth', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(join(TEST_DIR, 'modules'), { recursive: true })
    server = createForgeServer({
      dataDir: TEST_DIR,
      authToken: TOKEN
    })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('health endpoint is public (no token needed)', async () => {
    const res = await server.fetch('/api/health')
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('ok')
  })

  it('projects endpoint returns 401 without token', async () => {
    const res = await server.fetch('/api/projects')
    expect(res.status).toBe(401)
  })

  it('projects endpoint returns 401 with wrong token', async () => {
    const res = await server.fetch('/api/projects', {
      headers: { Authorization: 'Bearer wrong-token' }
    })
    expect(res.status).toBe(401)
  })

  it('projects endpoint works with valid token', async () => {
    const res = await server.fetch('/api/projects', {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('can create project with token', async () => {
    const res = await server.fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ name: 'team-proj', path: '/tmp/team' })
    })
    expect(res.status).toBe(201)
  })

  it('action-logs protected', async () => {
    const noAuth = await server.fetch('/api/action-logs')
    expect(noAuth.status).toBe(401)

    const withAuth = await server.fetch('/api/action-logs', {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })
    expect(withAuth.status).toBe(200)
  })

  it('module settings protected', async () => {
    const noAuth = await server.fetch('/api/modules/mod-test/settings')
    expect(noAuth.status).toBe(401)

    const withAuth = await server.fetch('/api/modules/mod-test/settings', {
      headers: { Authorization: `Bearer ${TOKEN}` }
    })
    expect(withAuth.status).toBe(200)
  })
})

describe('Local mode — no auth (default)', () => {
  let server: ReturnType<typeof createForgeServer>
  const LOCAL_DIR = join(import.meta.dirname, '../.test-local-mode')

  beforeAll(() => {
    mkdirSync(join(LOCAL_DIR, 'modules'), { recursive: true })
    server = createForgeServer({ dataDir: LOCAL_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(LOCAL_DIR, { recursive: true, force: true })
  })

  it('all endpoints accessible without token', async () => {
    const health = await server.fetch('/api/health')
    expect(health.status).toBe(200)

    const projects = await server.fetch('/api/projects')
    expect(projects.status).toBe(200)

    const logs = await server.fetch('/api/action-logs')
    expect(logs.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run tests/integration/ && npx turbo test --filter=@forge-dev/core`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/team-mode.test.ts
git commit -m "test: team mode integration tests — auth middleware, public health, protected endpoints"
```

---

## Summary

| # | Task | Files | Tests |
|---|------|-------|-------|
| 1 | Extract IForgeDB interface | 2 | Build + existing 30 |
| 2 | Auth middleware | 2 | 4 unit |
| 3 | Server accepts IForgeDB + auth | 3 | 3 unit |
| 4 | PostgresDB adapter | 2 | Build |
| 5 | DB factory + exports | 2 | Build |
| 6 | CLI + platform team flags | 2 | Build |
| 7 | Integration test | 1 | 8 integration |

**Totals: 7 tasks, ~14 files, 15 new tests**

After Phase 2b: `forge console --team --db-url postgres://... --auth-token secret` starts a team-shared Forge with PostgreSQL and bearer auth. Local mode (`forge console`) continues unchanged with SQLite. Environment variables `FORGE_DB_URL` and `FORGE_AUTH_TOKEN` also supported.

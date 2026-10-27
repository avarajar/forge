import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createForgeServer } from './server.js'
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-server')

describe('Forge Server', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(join(TEST_DIR, 'modules'), { recursive: true })
    server = createForgeServer({
      dataDir: TEST_DIR,
      port: 0,
      version: '9.8.7'
    })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('GET /api/health returns ok', async () => {
    const res = await server.fetch('/api/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.version).toBe('9.8.7')
  })

  it('GET /api/cw/session-states lists no states before any terminal starts', async () => {
    const res = await server.fetch('/api/cw/session-states')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ classifier: 'local', shadow: false, states: {} })
  })

  it('GET /api/projects returns empty array', async () => {
    const res = await server.fetch('/api/projects')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('POST /api/projects creates a project', async () => {
    const res = await server.fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-app', path: '/tmp/test-app' })
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('test-app')
  })

  it('GET /api/modules returns empty array', async () => {
    const res = await server.fetch('/api/modules')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('POST /api/actions/:module/:action returns 404 for missing module', async () => {
    const res = await server.fetch('/api/actions/nonexistent/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'test' })
    })
    expect(res.status).toBe(404)
  })

  it('GET /api/action-logs returns action logs', async () => {
    await server.fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'log-proj', path: '/tmp/log-proj' })
    })

    const res = await server.fetch('/api/action-logs')
    expect(res.status).toBe(200)
    const logs = await res.json()
    expect(Array.isArray(logs)).toBe(true)
  })

  it('GET /api/modules/:module/settings returns settings', async () => {
    const res = await server.fetch('/api/modules/mod-test/settings')
    expect(res.status).toBe(200)
    const settings = await res.json()
    expect(typeof settings).toBe('object')
  })

  it('PUT /api/modules/:module/settings stores settings', async () => {
    const putRes = await server.fetch('/api/modules/mod-test/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark', port: '8080' })
    })
    expect(putRes.status).toBe(200)

    const getRes = await server.fetch('/api/modules/mod-test/settings')
    const settings = await getRes.json()
    expect(settings).toEqual({ theme: 'dark', port: '8080' })
  })

  it('GET /api/registry/search returns results', async () => {
    const res = await server.fetch('/api/registry/search?q=forge')
    expect(res.status).toBe(200)
    const body = await res.json() as { results: unknown[] }
    expect(Array.isArray(body.results)).toBe(true)
  })
})

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

describe('Forge Server modules', () => {
  const dir = join(import.meta.dirname, '../.test-server-modules')
  const fixture = join(import.meta.dirname, '../test/fixtures/modules/valid')

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('serves an installed v1 module once the scan is done', async () => {
    mkdirSync(join(dir, 'local/modules'), { recursive: true })
    cpSync(fixture, join(dir, 'local/modules/valid'), { recursive: true })
    const server = createForgeServer({ dataDir: join(dir, 'local'), port: 0 })
    const res = await server.fetch('/api/modules/valid/hello?name=forge')
    expect(await res.json()).toEqual({ hello: 'forge' })
    server.close()
  })

  it('runs a module job at load and lists what it notified', async () => {
    mkdirSync(join(dir, 'jobs/modules'), { recursive: true })
    cpSync(join(fixture, '../watcher'), join(dir, 'jobs/modules/watcher'), { recursive: true })
    const server = createForgeServer({ dataDir: join(dir, 'jobs'), port: 0 })
    await server.modulesReady
    await vi.waitFor(async () => {
      const { items } = await (await server.fetch('/api/modules/notifications')).json() as { items: Array<{ key: string; kind: string; count?: number }> }
      expect(items).toEqual([expect.objectContaining({ key: 'reply', kind: 'attention' }), expect.objectContaining({ key: 'outbox', kind: 'badge', count: 3 })])
    })
    server.close()
  })

  it('disables v1 modules when the server is not local only', async () => {
    mkdirSync(join(dir, 'team/modules'), { recursive: true })
    cpSync(fixture, join(dir, 'team/modules/valid'), { recursive: true })
    const server = createForgeServer({ dataDir: join(dir, 'team'), port: 0, localOnly: false })
    const list = await (await server.fetch('/api/modules')).json() as Array<{ id: string; state: string; reason?: string }>
    expect(list).toEqual([expect.objectContaining({ id: 'valid', state: 'disabled', reason: 'modules run only in local mode' })])
    server.close()
  })

  it('previews a module folder in local mode and refuses installs in team mode', async () => {
    const preview = (server: ReturnType<typeof createForgeServer>) => server.fetch('/api/modules/install/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: fixture }),
    })
    mkdirSync(join(dir, 'preview-local'), { recursive: true })
    mkdirSync(join(dir, 'preview-team'), { recursive: true })
    const local = createForgeServer({ dataDir: join(dir, 'preview-local'), port: 0 })
    const res = await preview(local)
    expect(await res.json()).toMatchObject({ name: '@test/mod-valid', spec: fixture })
    local.close()
    const team = createForgeServer({ dataDir: join(dir, 'preview-team'), port: 0, localOnly: false })
    expect((await preview(team)).status).toBe(403)
    team.close()
  })
})

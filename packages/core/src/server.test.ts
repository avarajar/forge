import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from './server.js'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-server')

describe('Forge Server', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(join(TEST_DIR, 'modules'), { recursive: true })
    server = createForgeServer({
      dataDir: TEST_DIR,
      port: 0
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
})

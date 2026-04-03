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

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { SandboxManager } from './sandbox-manager.js'
import { prototypeRoutes } from './prototype-routes.js'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-proto-routes')
const TEMPLATE_DIR = join(import.meta.dirname, '../sandbox-template')

describe('Prototype API Routes', () => {
  let app: Hono
  let manager: SandboxManager

  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })

    manager = new SandboxManager({
      templateDir: TEMPLATE_DIR,
      sandboxBaseDir: TEST_DIR,
      portRangeStart: 63000,
    })

    app = new Hono()
    app.route('/api/prototype', prototypeRoutes(manager))
  })

  afterAll(() => {
    manager.dispose()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('POST /api/prototype/create creates a sandbox', async () => {
    const res = await app.request('/api/prototype/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-sandbox',
        inputType: 'description',
        inputData: 'A landing page with hero section',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.state).toBe('creating')
    expect(body.name).toBe('test-sandbox')
  })

  it('GET /api/prototype/list returns sandboxes', async () => {
    const res = await app.request('/api/prototype/list')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/prototype/:id returns a sandbox', async () => {
    // Create one first
    const createRes = await app.request('/api/prototype/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'get-me',
        inputType: 'description',
        inputData: 'A settings page',
      }),
    })
    const created = await createRes.json() as { id: string }

    const res = await app.request(`/api/prototype/${created.id}`)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('get-me')
  })

  it('GET /api/prototype/:id returns 404 for missing id', async () => {
    const res = await app.request('/api/prototype/nonexistent')

    expect(res.status).toBe(404)
  })

  it('POST /api/prototype/:id/archive archives a sandbox', async () => {
    // Create one first
    const createRes = await app.request('/api/prototype/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'archive-me',
        inputType: 'description',
        inputData: 'A form page',
      }),
    })
    const created = await createRes.json() as { id: string }

    const res = await app.request(`/api/prototype/${created.id}/archive`, {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    // Verify it's archived
    const getRes = await app.request(`/api/prototype/${created.id}`)
    const sandbox = await getRes.json()
    expect(sandbox.state).toBe('archived')
  })

  it('DELETE /api/prototype/:id deletes a sandbox', async () => {
    // Create one first
    const createRes = await app.request('/api/prototype/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'delete-me',
        inputType: 'description',
        inputData: 'A dashboard',
      }),
    })
    const created = await createRes.json() as { id: string }

    const res = await app.request(`/api/prototype/${created.id}`, {
      method: 'DELETE',
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    // Verify it's gone
    const getRes = await app.request(`/api/prototype/${created.id}`)
    expect(getRes.status).toBe(404)
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-prototype-integration')

describe('Prototype API Integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(join(TEST_DIR, 'modules'), { recursive: true })
    server = createForgeServer({ dataDir: TEST_DIR, port: 0 })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('creates a sandbox via POST /api/prototype/create', async () => {
    const res = await server.fetch('/api/prototype/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test-sandbox',
        inputType: 'description',
        inputData: 'A simple counter app',
      }),
    })

    expect(res.status).toBe(201)
    const sandbox = await res.json() as { id: string; name: string; state: string }
    expect(sandbox.id).toBeTruthy()
    expect(sandbox.name).toBe('test-sandbox')
    expect(sandbox.state).toBe('creating')
  })

  it('lists sandboxes via GET /api/prototype/list', async () => {
    // Ensure at least one sandbox exists
    await server.fetch('/api/prototype/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'list-test-sandbox',
        inputType: 'description',
        inputData: 'A sandbox for list testing',
      }),
    })

    const res = await server.fetch('/api/prototype/list')
    expect(res.status).toBe(200)
    const sandboxes = await res.json() as unknown[]
    expect(Array.isArray(sandboxes)).toBe(true)
    expect(sandboxes.length).toBeGreaterThanOrEqual(1)
  })

  it('gets a specific sandbox via GET /api/prototype/:id', async () => {
    const createRes = await server.fetch('/api/prototype/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'get-test-sandbox',
        inputType: 'description',
        inputData: 'A sandbox to retrieve by ID',
      }),
    })
    const created = await createRes.json() as { id: string; name: string }

    const res = await server.fetch(`/api/prototype/${created.id}`)
    expect(res.status).toBe(200)
    const sandbox = await res.json() as { id: string; name: string }
    expect(sandbox.name).toBe('get-test-sandbox')
  })

  it('archives and deletes a sandbox', async () => {
    const createRes = await server.fetch('/api/prototype/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'archive-delete-sandbox',
        inputType: 'description',
        inputData: 'A sandbox to archive and delete',
      }),
    })
    const created = await createRes.json() as { id: string }

    // Archive
    const archiveRes = await server.fetch(`/api/prototype/${created.id}/archive`, {
      method: 'POST',
    })
    expect(archiveRes.status).toBe(200)

    // Delete
    const deleteRes = await server.fetch(`/api/prototype/${created.id}`, {
      method: 'DELETE',
    })
    expect(deleteRes.status).toBe(200)

    // Verify it's gone
    const getRes = await server.fetch(`/api/prototype/${created.id}`)
    expect(getRes.status).toBe(404)
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { cwRoutes } from './cw-routes.js'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-cw-routes')

describe('CW Routes', () => {
  let app: Hono

  beforeAll(() => {
    mkdirSync(join(TEST_CW, 'sessions/testproj/task-mytask'), { recursive: true })
    mkdirSync(join(TEST_CW, 'accounts/default'), { recursive: true })

    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      testproj: { path: '/tmp/testproj', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' }
    }))

    writeFileSync(join(TEST_CW, 'config.yaml'), 'default_account: default\n')

    writeFileSync(join(TEST_CW, 'sessions/testproj/task-mytask/session.json'), JSON.stringify({
      project: 'testproj', task: 'mytask', type: 'task', account: 'default',
      worktree: '/tmp/testproj/.tasks/mytask', notes: join(TEST_CW, 'sessions/testproj/task-mytask/TASK_NOTES.md'),
      status: 'active', created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 2
    }))

    writeFileSync(join(TEST_CW, 'sessions/testproj/task-mytask/TASK_NOTES.md'), '# My Task\nSome notes')

    const reader = new CWReader(TEST_CW)
    app = new Hono()
    app.route('/api/cw', cwRoutes(reader))
  })

  afterAll(() => {
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('GET /api/cw/projects returns projects', async () => {
    const res = await app.request('/api/cw/projects')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.testproj).toBeDefined()
  })

  it('GET /api/cw/spaces returns sessions', async () => {
    const res = await app.request('/api/cw/spaces')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body.length).toBeGreaterThan(0)
  })

  it('GET /api/cw/spaces?project=testproj filters', async () => {
    const res = await app.request('/api/cw/spaces?project=testproj')
    const body = await res.json() as { project: string }[]
    expect(body.every(s => s.project === 'testproj')).toBe(true)
  })

  it('GET /api/cw/session/testproj/task-mytask returns session', async () => {
    const res = await app.request('/api/cw/session/testproj/task-mytask')
    expect(res.status).toBe(200)
    const body = await res.json() as { task: string }
    expect(body.task).toBe('mytask')
  })

  it('GET /api/cw/notes/testproj/task-mytask returns notes', async () => {
    const res = await app.request('/api/cw/notes/testproj/task-mytask')
    expect(res.status).toBe(200)
    const body = await res.json() as { content: string }
    expect(body.content).toContain('My Task')
  })

  it('GET /api/cw/accounts returns account list', async () => {
    const res = await app.request('/api/cw/accounts')
    expect(res.status).toBe(200)
    const body = await res.json() as string[]
    expect(body).toContain('default')
  })

  it('GET /api/cw/session/testproj/nonexistent returns 404', async () => {
    const res = await app.request('/api/cw/session/testproj/nonexistent')
    expect(res.status).toBe(404)
  })

  it('POST /api/cw/accounts rejects empty name', async () => {
    const res = await app.request('/api/cw/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('required')
  })

  it('POST /api/cw/accounts rejects invalid characters', async () => {
    const res = await app.request('/api/cw/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'bad account!' })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
  })

  it('POST /api/cw/accounts rejects name starting with hyphen', async () => {
    const res = await app.request('/api/cw/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '-bad' })
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/cw/accounts rejects duplicate account', async () => {
    const res = await app.request('/api/cw/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'default' })
    })
    expect(res.status).toBe(409)
    const body = await res.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('already exists')
  })

  it('POST /api/cw/start with type=create returns session with type "create"', async () => {
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'create',
        project: 'my-new-app',
        description: 'A SaaS for team collaboration',
        account: 'default',
      })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; session: { type: string; task: string; notes: string; project: string } }
    expect(body.ok).toBe(true)
    expect(body.session.type).toBe('create')
    expect(body.session.task).toBe('my-new-app')
    expect(body.session.notes).toBe('A SaaS for team collaboration')
    expect(body.session.project).toBe('__creating')
  })

  it('POST /api/cw/start with type=create requires project name', async () => {
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'create', description: 'No name given' })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
  })
})

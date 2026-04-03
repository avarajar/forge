import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { CWReader } from '../../packages/core/src/cw-reader.js'
import { cwRoutes } from '../../packages/core/src/cw-routes.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-cw-integration')

describe('CW API integration', () => {
  let app: Hono

  beforeAll(() => {
    mkdirSync(join(TEST_CW, 'sessions/demo/task-feat-1'), { recursive: true })
    mkdirSync(join(TEST_CW, 'sessions/demo/review-pr-10'), { recursive: true })
    mkdirSync(join(TEST_CW, 'accounts/myaccount'), { recursive: true })

    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      demo: { path: '/tmp/demo', account: 'myaccount', type: 'fullstack', registered: '2026-01-01T00:00:00Z' }
    }))

    writeFileSync(join(TEST_CW, 'config.yaml'), 'default_account: myaccount\n')

    writeFileSync(join(TEST_CW, 'sessions/demo/task-feat-1/session.json'), JSON.stringify({
      project: 'demo', task: 'feat-1', type: 'task', account: 'myaccount',
      worktree: '/tmp/demo/.tasks/feat-1', notes: join(TEST_CW, 'sessions/demo/task-feat-1/TASK_NOTES.md'),
      status: 'active', created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 2
    }))

    writeFileSync(join(TEST_CW, 'sessions/demo/task-feat-1/TASK_NOTES.md'), '# Feature 1')

    writeFileSync(join(TEST_CW, 'sessions/demo/review-pr-10/session.json'), JSON.stringify({
      project: 'demo', pr: '10', type: 'review', account: 'myaccount',
      worktree: '/tmp/demo/.reviews/pr-10', notes: '',
      status: 'done', created: '2026-03-01T00:00:00Z', last_opened: '2026-03-01T00:00:00Z', opens: 1
    }))

    const reader = new CWReader(TEST_CW)
    app = new Hono()
    app.route('/api/cw', cwRoutes(reader))
  })

  afterAll(() => {
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('lists projects from CW', async () => {
    const res = await app.request('/api/cw/projects')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.demo).toBeDefined()
  })

  it('lists all spaces sorted by last_opened', async () => {
    const res = await app.request('/api/cw/spaces')
    expect(res.status).toBe(200)
    const body = await res.json() as { project: string; status: string }[]
    expect(body).toHaveLength(2)
    expect(body[0].status).toBe('active') // most recent first
  })

  it('gets single session', async () => {
    const res = await app.request('/api/cw/session/demo/task-feat-1')
    expect(res.status).toBe(200)
    const body = await res.json() as { task: string; opens: number }
    expect(body.task).toBe('feat-1')
    expect(body.opens).toBe(2)
  })

  it('returns 404 for unknown session', async () => {
    const res = await app.request('/api/cw/session/demo/task-nope')
    expect(res.status).toBe(404)
  })

  it('reads task notes', async () => {
    const res = await app.request('/api/cw/notes/demo/task-feat-1')
    const body = await res.json() as { content: string }
    expect(body.content).toContain('Feature 1')
  })

  it('lists accounts', async () => {
    const res = await app.request('/api/cw/accounts')
    const body = await res.json() as string[]
    expect(body).toContain('myaccount')
  })

  it('includes review sessions in spaces', async () => {
    const res = await app.request('/api/cw/spaces')
    const body = await res.json() as { type: string }[]
    expect(body.find(s => s.type === 'review')).toBeDefined()
  })
})

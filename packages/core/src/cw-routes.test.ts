import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { cwRoutes } from './cw-routes.js'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

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

  it('DELETE /api/cw/accounts/:name removes account directory', async () => {
    const accountDir = join(TEST_CW, 'accounts/todelete')
    mkdirSync(accountDir, { recursive: true })
    writeFileSync(join(accountDir, 'meta.json'), '{}')

    const res = await app.request('/api/cw/accounts/todelete', { method: 'DELETE' })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const { existsSync } = await import('node:fs')
    expect(existsSync(accountDir)).toBe(false)
  })

  it('DELETE /api/cw/accounts/:name returns 404 for unknown account', async () => {
    const res = await app.request('/api/cw/accounts/doesnotexist', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it('POST /api/cw/start with Linear URL sets source and source_url', async () => {
    const url = 'https://linear.app/team/issue/ENG-123-fix-auth-bug'
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'dev', project: 'testproj', task: url })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; session: { source: string; source_url: string; task: string } }
    expect(body.ok).toBe(true)
    expect(body.session.source).toBe('linear')
    expect(body.session.source_url).toBe(url)
    expect(body.session.task).toBe('ENG-123')
  })

  it('POST /api/cw/start with GitHub PR URL sets source/source_url, task is PR number', async () => {
    const url = 'https://github.com/org/repo/pull/42'
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'dev', project: 'testproj', task: url })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; session: { source: string; source_url: string; task: string } }
    expect(body.ok).toBe(true)
    expect(body.session.source).toBe('github')
    expect(body.session.source_url).toBe(url)
    expect(body.session.task).toBe('42')
  })

  it('POST /api/cw/start with GitHub PR URL for review extracts PR number', async () => {
    const url = 'https://github.com/org/repo/pull/42'
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'review', project: 'testproj', task: url })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; session: { source: string; source_url: string; pr: string } }
    expect(body.ok).toBe(true)
    expect(body.session.source).toBe('github')
    expect(body.session.source_url).toBe(url)
    expect(body.session.pr).toBe('42')
  })

  it('POST /api/cw/start pre-writes description to TASK_NOTES.md', async () => {
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dev',
        project: 'testproj',
        task: 'desc-test',
        description: 'Fix the broken auth flow',
      })
    })
    expect(res.status).toBe(200)
    const notesPath = join(TEST_CW, 'sessions/testproj/task-desc-test/TASK_NOTES.md')
    expect(existsSync(notesPath)).toBe(true)
    const content = readFileSync(notesPath, 'utf-8')
    expect(content).toContain('## Description')
    expect(content).toContain('Fix the broken auth flow')
    expect(content).toContain('**Project:** testproj')
  })

  it('POST /api/cw/start without description does not pre-write TASK_NOTES.md', async () => {
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dev',
        project: 'testproj',
        task: 'no-desc-test',
      })
    })
    expect(res.status).toBe(200)
    const notesPath = join(TEST_CW, 'sessions/testproj/task-no-desc-test/TASK_NOTES.md')
    expect(existsSync(notesPath)).toBe(false)
  })

  it('POST /api/cw/move-project moves project to existing account', async () => {
    mkdirSync(join(TEST_CW, 'accounts/work'), { recursive: true })

    const res = await app.request('/api/cw/move-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'testproj', toAccount: 'work' })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const projects = JSON.parse(readFileSync(join(TEST_CW, 'projects.json'), 'utf-8')) as Record<string, { account: string }>
    expect(projects.testproj.account).toBe('work')

    // restore for other tests
    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      testproj: { path: '/tmp/testproj', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' }
    }))
  })

  it('POST /api/cw/move-project returns 409 when already in target account', async () => {
    const res = await app.request('/api/cw/move-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'testproj', toAccount: 'default' })
    })
    expect(res.status).toBe(409)
    const body = await res.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('already in account')
  })

  it('POST /api/cw/move-project returns 404 for unknown project', async () => {
    const res = await app.request('/api/cw/move-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'nonexistent', toAccount: 'default' })
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it('POST /api/cw/move-project returns 404 for unknown target account', async () => {
    const res = await app.request('/api/cw/move-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'testproj', toAccount: 'nosuchaccount' })
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toContain('does not exist')
  })

  it('POST /api/cw/move-project returns 400 for missing fields', async () => {
    const res = await app.request('/api/cw/move-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'testproj' })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(false)
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

  describe('GET /api/cw/browse-dirs', () => {
    const sandbox = join(tmpdir(), `forge-browse-${Date.now()}`)
    const childA = join(sandbox, 'alpha')
    const childB = join(sandbox, 'beta')
    const hidden = join(sandbox, '.hidden')

    beforeAll(() => {
      mkdirSync(childA, { recursive: true })
      mkdirSync(childB, { recursive: true })
      mkdirSync(hidden, { recursive: true })
      mkdirSync(join(childA, '.git'), { recursive: true })
    })

    afterAll(() => {
      rmSync(sandbox, { recursive: true, force: true })
    })

    it('lists subdirectories of an absolute path', async () => {
      const res = await app.request(`/api/cw/browse-dirs?path=${encodeURIComponent(sandbox)}`)
      expect(res.status).toBe(200)
      const body = await res.json() as {
        ok: boolean; path: string; parent: string | null; isGitRepo: boolean
        entries: { name: string; isGitRepo: boolean }[]
      }
      expect(body.ok).toBe(true)
      expect(body.path).toBe(sandbox)
      expect(body.parent).toBe(join(sandbox, '..').replace(/\/$/, ''))
      expect(body.isGitRepo).toBe(false)
      const names = body.entries.map(e => e.name)
      expect(names).toContain('alpha')
      expect(names).toContain('beta')
      // hidden entries are filtered out
      expect(names).not.toContain('.hidden')
      const alpha = body.entries.find(e => e.name === 'alpha')!
      expect(alpha.isGitRepo).toBe(true)
    })

    it('reports isGitRepo on the current path when .git exists', async () => {
      const res = await app.request(`/api/cw/browse-dirs?path=${encodeURIComponent(childA)}`)
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; isGitRepo: boolean }
      expect(body.ok).toBe(true)
      expect(body.isGitRepo).toBe(true)
    })

    it('returns 404 for a path that does not exist', async () => {
      const res = await app.request(`/api/cw/browse-dirs?path=${encodeURIComponent('/definitely/not/here-xyz')}`)
      expect(res.status).toBe(404)
      const body = await res.json() as { ok: boolean }
      expect(body.ok).toBe(false)
    })

    it('rejects relative paths', async () => {
      const res = await app.request(`/api/cw/browse-dirs?path=${encodeURIComponent('relative/path')}`)
      expect(res.status).toBe(400)
      const body = await res.json() as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
    })
  })

  describe('POST /api/cw/register-project', () => {
    const sandbox = join(tmpdir(), `forge-register-${Date.now()}`)
    const gitRepo = join(sandbox, 'somerepo')
    const notRepo = join(sandbox, 'plain-folder')

    beforeAll(() => {
      mkdirSync(join(gitRepo, '.git'), { recursive: true })
      mkdirSync(notRepo, { recursive: true })
    })

    afterAll(() => {
      rmSync(sandbox, { recursive: true, force: true })
    })

    it('rejects missing path or account', async () => {
      const res = await app.request('/api/cw/register-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: gitRepo })
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
      expect(body.error).toContain('required')
    })

    it('rejects invalid account name', async () => {
      const res = await app.request('/api/cw/register-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: gitRepo, account: 'bad name!' })
      })
      expect(res.status).toBe(400)
    })

    it('returns 404 when path does not exist', async () => {
      const res = await app.request('/api/cw/register-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/definitely/not/here-abc', account: 'default' })
      })
      expect(res.status).toBe(404)
    })

    it('rejects path that is not a git repository', async () => {
      const res = await app.request('/api/cw/register-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: notRepo, account: 'default' })
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
      expect(body.error).toContain('git repository')
    })

    it('returns 404 for unknown account', async () => {
      const res = await app.request('/api/cw/register-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: gitRepo, account: 'nosuchaccount' })
      })
      expect(res.status).toBe(404)
      const body = await res.json() as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
      expect(body.error).toContain('does not exist')
    })

    it('returns 409 when project name (folder basename) is already registered', async () => {
      // testproj is registered in beforeAll above
      const existingRepo = join(sandbox, 'testproj')
      mkdirSync(join(existingRepo, '.git'), { recursive: true })
      const res = await app.request('/api/cw/register-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: existingRepo, account: 'default' })
      })
      expect(res.status).toBe(409)
      const body = await res.json() as { ok: boolean; error: string }
      expect(body.ok).toBe(false)
      expect(body.error).toContain('already registered')
    })
  })
})

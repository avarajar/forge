import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Hono } from 'hono'
import { cwRoutes } from './cw-routes.js'
import { CWReader } from './cw-reader.js'
import { LoginManager } from './login-manager.js'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Runner } from './task-review.js'
import type { TaskReviewState } from './cw-types.js'
import type { DetectedEditor } from './editors.js'

const TEST_CW = join(import.meta.dirname, '../.test-cw-routes')

describe('CW Routes', () => {
  let app: Hono

  beforeAll(() => {
    mkdirSync(join(TEST_CW, 'sessions/testproj/task-mytask'), { recursive: true })
    mkdirSync(join(TEST_CW, 'accounts/default'), { recursive: true })
    mkdirSync(join(TEST_CW, 'bin'), { recursive: true })

    // resolveCwBin falls back to PATH when bin/cw is missing, which would
    // otherwise spawn the real cw on the host running these tests.
    writeFileSync(join(TEST_CW, 'bin/cw'), '#!/bin/sh\nexit 0\n')
    chmodSync(join(TEST_CW, 'bin/cw'), 0o755)

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

    // Loop session read from disk without a `worktree` field (CW omits it).
    // Regression fixture for the git-route worktree guard.
    mkdirSync(join(TEST_CW, 'sessions/testproj/loop-noworktree'), { recursive: true })
    writeFileSync(join(TEST_CW, 'sessions/testproj/loop-noworktree/session.json'), JSON.stringify({
      project: 'testproj', task: 'noworktree', type: 'loop', status: 'active',
      account: 'default', notes: '', created: '2026-07-01T00:00:00Z',
      last_opened: '2026-07-01T00:00:00Z', opens: 1
    }))

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

  it('POST /api/cw/start with type=loop returns loop session', async () => {
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'loop', project: 'testproj',
        loopPrompt: 'Run the Test suite & fix breakage!', loopInterval: '30m',
        account: 'default',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; session: Record<string, unknown> }
    expect(body.ok).toBe(true)
    expect(body.session.type).toBe('loop')
    expect(body.session.loop_prompt).toBe('Run the Test suite & fix breakage!')
    expect(body.session.loop_interval).toBe('30m')
    // slug: lowercased, non-alphanumerics collapsed to hyphens, sliced to 30 chars, hyphens trimmed
    expect(body.session.sessionDir).toBe('loop-run-the-test-suite-fix-breakag')
    expect(body.session.task).toBe('run-the-test-suite-fix-breakag')
    expect(body.session.worktree).toBe('/tmp/testproj')
  })

  it('POST /api/cw/start type=loop uses explicit name as slug', async () => {
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: 'babysit PRs', name: 'pr-babysitter' }),
    })
    const body = await res.json() as { session: Record<string, unknown> }
    expect(body.session.sessionDir).toBe('loop-pr-babysitter')
    expect(body.session.loop_interval).toBe('')
  })

  it('POST /api/cw/start type=loop rejects empty prompt', async () => {
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/cw/start type=loop rejects bad interval', async () => {
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: 'x y z', loopInterval: '99x' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/cw/start type=loop rejects duplicate active loop', async () => {
    mkdirSync(join(TEST_CW, 'sessions/testproj/loop-dupe'), { recursive: true })
    writeFileSync(join(TEST_CW, 'sessions/testproj/loop-dupe/session.json'), JSON.stringify({
      project: 'testproj', task: 'dupe', type: 'loop', account: 'default',
      worktree: '', notes: '', status: 'active',
      created: '2026-07-01T00:00:00Z', last_opened: '2026-07-01T00:00:00Z', opens: 1,
    }))
    const res = await app.request('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: 'whatever', name: 'dupe' }),
    })
    expect(res.status).toBe(409)
  })

  it('POST /api/cw/start type=loop rejects invalid explicit name', async () => {
    for (const bad of ['UPPER', '!!!', 'x/../../evil', '-lead', 'trail-']) {
      const res = await app.request('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: 'whatever', name: bad }),
      })
      expect(res.status).toBe(400)
    }
  })

  it('GET /api/cw/git/status for a worktree-less loop session returns empty output, not the server repo\'s git state', async () => {
    const res = await app.request('/api/cw/git/status/testproj/loop-noworktree')
    expect(res.status).toBe(200)
    const body = await res.json() as { output: string }
    expect(body.output).toBe('')
  })

  it('POST /api/cw/done marks a loop session done using the loop-<task> sessionDir default', async () => {
    mkdirSync(join(TEST_CW, 'sessions/testproj/loop-donetest'), { recursive: true })
    writeFileSync(join(TEST_CW, 'sessions/testproj/loop-donetest/session.json'), JSON.stringify({
      project: 'testproj', task: 'donetest', type: 'loop', status: 'active',
      account: 'default', worktree: '', notes: '', created: '2026-07-01T00:00:00Z',
      last_opened: '2026-07-01T00:00:00Z', opens: 1
    }))

    const res = await app.request('/api/cw/done', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'testproj', task: 'donetest', type: 'loop' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; updated: boolean }
    expect(body.ok).toBe(true)
    expect(body.updated).toBe(true)

    const meta = JSON.parse(readFileSync(join(TEST_CW, 'sessions/testproj/loop-donetest/session.json'), 'utf-8'))
    expect(meta.status).toBe('done')
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

  describe('GET /api/cw/review-state', () => {
    const notRepo = join(tmpdir(), `forge-review-route-${Date.now()}`)
    let calls = 0
    let reviewApp: Hono

    beforeAll(() => {
      mkdirSync(notRepo, { recursive: true })
      mkdirSync(join(TEST_CW, 'sessions/testproj/task-reviewed'), { recursive: true })
      writeFileSync(join(TEST_CW, 'sessions/testproj/task-reviewed/session.json'), JSON.stringify({
        project: 'testproj', task: 'reviewed', type: 'task', account: 'default', worktree: notRepo, notes: '',
        status: 'active', created: '2026-09-14T00:00:00Z', last_opened: '2026-09-14T00:00:00Z', opens: 1,
      }))
      const runner: Runner = async () => { calls++; return { code: 128, stdout: '', stderr: 'not a git repository' } }
      reviewApp = new Hono()
      reviewApp.route('/api/cw', cwRoutes(new CWReader(TEST_CW), { runner }))
    })

    afterAll(() => { rmSync(notRepo, { recursive: true, force: true }) })

    it('returns 404 for an unknown session', async () => {
      const res = await reviewApp.request('/api/cw/review-state/testproj/task-nope')
      expect(res.status).toBe(404)
    })

    it('returns workspace none for a loop session', async () => {
      const res = await reviewApp.request('/api/cw/review-state/testproj/loop-noworktree')
      expect(res.status).toBe(200)
      expect((await res.json() as TaskReviewState).workspace).toBe('none')
    })

    it('caches a session for 30 s and refreshes with fresh=1', async () => {
      const first = await reviewApp.request('/api/cw/review-state/testproj/task-reviewed')
      expect((await first.json() as TaskReviewState).closeWarnings).toEqual(['state-unknown'])
      const afterFirst = calls
      expect(afterFirst).toBeGreaterThan(0)

      await reviewApp.request('/api/cw/review-state/testproj/task-reviewed')
      expect(calls).toBe(afterFirst)

      await reviewApp.request('/api/cw/review-state/testproj/task-reviewed?fresh=1')
      expect(calls).toBeGreaterThan(afterFirst)
    })
  })

  describe('editors', () => {
    const workspace = join(tmpdir(), `forge-editor-route-${Date.now()}`)
    const editors: DetectedEditor[] = [{ id: 'vscode', label: 'VS Code', bin: '/bin/sh', args: ['-c', 'exit 0'] }]
    let localApp: Hono
    let remoteApp: Hono

    beforeAll(() => {
      mkdirSync(workspace, { recursive: true })
      mkdirSync(join(TEST_CW, 'sessions/testproj/task-editable'), { recursive: true })
      writeFileSync(join(TEST_CW, 'sessions/testproj/task-editable/session.json'), JSON.stringify({
        project: 'testproj', task: 'editable', type: 'task', account: 'default', worktree: workspace, notes: '',
        status: 'active', created: '2026-09-14T00:00:00Z', last_opened: '2026-09-14T00:00:00Z', opens: 1,
      }))
      localApp = new Hono()
      localApp.route('/api/cw', cwRoutes(new CWReader(TEST_CW), { editors, localOnly: true }))
      remoteApp = new Hono()
      remoteApp.route('/api/cw', cwRoutes(new CWReader(TEST_CW), { editors, localOnly: false }))
    })

    afterAll(() => { rmSync(workspace, { recursive: true, force: true }) })

    const open = (target: Hono, body: Record<string, string>) => target.request('/api/cw/open-in-editor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })

    it('lists detected editors in local mode and none remotely', async () => {
      expect(await (await localApp.request('/api/cw/editors')).json()).toEqual({ enabled: true, editors: [{ id: 'vscode', label: 'VS Code' }] })
      expect(await (await remoteApp.request('/api/cw/editors')).json()).toEqual({ enabled: false, editors: [] })
    })

    it('refuses to open an editor remotely', async () => {
      const res = await open(remoteApp, { project: 'testproj', sessionDir: 'task-editable', editor: 'vscode' })
      expect(res.status).toBe(403)
    })

    it('rejects an editor that was not detected', async () => {
      const res = await open(localApp, { project: 'testproj', sessionDir: 'task-editable', editor: 'zed' })
      expect(res.status).toBe(400)
    })

    it('returns 404 when the task has no workspace on disk', async () => {
      const res = await open(localApp, { project: 'testproj', sessionDir: 'task-mytask', editor: 'vscode' })
      expect(res.status).toBe(404)
    })

    it('opens the worktree', async () => {
      const res = await open(localApp, { project: 'testproj', sessionDir: 'task-editable', editor: 'vscode' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })
  })
})

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

  it('never passes CW_HARNESS to cw when registering a project', async () => {
    const repoDir = join(DIR, 'repo')
    mkdirSync(join(repoDir, '.git'), { recursive: true })
    mkdirSync(join(DIR, 'accounts/reg-acct'), { recursive: true })

    const previous = process.env.CW_HARNESS
    process.env.CW_HARNESS = 'pi'
    try {
      const res = await app.request('/api/cw/register-project', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoDir, account: 'reg-acct' }),
      })
      expect(res.status).toBe(200)
      expect(recordedArgs()).toEqual(['project', 'register', repoDir, '--account', 'reg-acct'])
    } finally {
      if (previous === undefined) delete process.env.CW_HARNESS
      else process.env.CW_HARNESS = previous
    }
  })
})

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
      '[ -n "$CW_HARNESS" ] && exit 3',
      'case "$*" in',
      "  *--no-browser*) printf 'CW_LOGIN_URL=https://auth.openai.com/codex/device\\nCW_LOGIN_CODE=WXYZ-4821\\n'; sleep 30 ;;",
      '  *--with-api-key*)',
      '    read key',
      `    printf '%s\\n' "$@" > '${join(DIR, 'args.txt')}'`,
      `    printf '%s' "$key" > '${join(DIR, 'stdin.txt')}'`,
      '    if [ "$key" = "sk-badkey" ]; then echo "rejected key $key" >&2; exit 1; fi',
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
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'codex', apiKey: 'sk-goodkey' })
    expect(res.status).toBe(200)
    expect(readFileSync(join(DIR, 'stdin.txt'), 'utf-8')).toBe('sk-goodkey')
    const args = readFileSync(join(DIR, 'args.txt'), 'utf-8').trim().split('\n')
    expect(args).toEqual(['account', 'login', 'work', '--harness', 'codex', '--with-api-key', '-'])
  })

  it('redacts the key when cw rejects it', async () => {
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'codex', apiKey: 'sk-badkey' })
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('rejected key ***')
    expect(text).not.toContain('sk-badkey')
  })

  it('refuses an API key on a harness without an API key login', async () => {
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'opencode', apiKey: 'sk-goodkey' })
    expect(res.status).toBe(400)
  })

  it('refuses a key with a newline', async () => {
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'codex', apiKey: 'sk-a\nsk-b' })
    expect(res.status).toBe(400)
  })

  it('refuses a key shorter than 8 characters', async () => {
    const res = await post('/api/cw/accounts/work/api-key', { harness: 'codex', apiKey: 'sk-1234' })
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('Invalid API key')
  })

  it('never passes CW_HARNESS to cw when importing an API key', async () => {
    const previous = process.env.CW_HARNESS
    process.env.CW_HARNESS = 'pi'
    try {
      const res = await post('/api/cw/accounts/work/api-key', { harness: 'codex', apiKey: 'sk-goodkey' })
      expect(res.status).toBe(200)
    } finally {
      if (previous === undefined) delete process.env.CW_HARNESS
      else process.env.CW_HARNESS = previous
    }
  })
})

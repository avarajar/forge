import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-cw')

describe('CWReader', () => {
  let reader: CWReader

  beforeEach(() => {
    mkdirSync(join(TEST_CW, 'sessions/myapp/task-fix-bug'), { recursive: true })
    mkdirSync(join(TEST_CW, 'sessions/myapp/review-pr-42'), { recursive: true })
    mkdirSync(join(TEST_CW, 'accounts/default'), { recursive: true })

    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      myapp: { path: '/tmp/myapp', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' },
      other: { path: '/tmp/other', account: 'default', type: 'fullstack', registered: '2026-01-02T00:00:00Z' }
    }))

    writeFileSync(join(TEST_CW, 'config.yaml'), `default_account: default\nskip_permissions: true\n`)

    writeFileSync(join(TEST_CW, 'sessions/myapp/task-fix-bug/session.json'), JSON.stringify({
      project: 'myapp', task: 'fix-bug', type: 'task', account: 'default',
      workflow: 'bugfix', worktree: '/tmp/myapp/.tasks/fix-bug',
      notes: join(TEST_CW, 'sessions/myapp/task-fix-bug/TASK_NOTES.md'),
      source: '', source_url: '', status: 'active',
      created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 3
    }))

    writeFileSync(join(TEST_CW, 'sessions/myapp/task-fix-bug/TASK_NOTES.md'), '# Fix Bug\nNotes here')

    writeFileSync(join(TEST_CW, 'sessions/myapp/review-pr-42/session.json'), JSON.stringify({
      project: 'myapp', pr: '42', type: 'review', account: 'default',
      worktree: '/tmp/myapp/.reviews/pr-42',
      notes: join(TEST_CW, 'sessions/myapp/review-pr-42/REVIEW_NOTES.md'),
      status: 'done', created: '2026-03-30T10:00:00Z', last_opened: '2026-03-30T10:00:00Z',
      opens: 1, closed: '2026-03-31T10:00:00Z'
    }))

    reader = new CWReader(TEST_CW)
  })

  afterEach(() => {
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('reads projects', () => {
    const projects = reader.getProjects()
    expect(Object.keys(projects)).toHaveLength(2)
    expect(projects.myapp.path).toBe('/tmp/myapp')
  })

  it('reads all spaces (sessions)', () => {
    const spaces = reader.getSpaces()
    expect(spaces).toHaveLength(2)
    const task = spaces.find(s => s.type === 'task')
    expect(task?.task).toBe('fix-bug')
    expect(task?.status).toBe('active')
  })

  it('reads spaces filtered by project', () => {
    const spaces = reader.getSpaces('myapp')
    expect(spaces).toHaveLength(2)
  })

  it('reads single session', () => {
    const session = reader.getSession('myapp', 'task-fix-bug')
    expect(session?.task).toBe('fix-bug')
    expect(session?.opens).toBe(3)
  })

  it('reads session notes', () => {
    const notes = reader.getNotes('myapp', 'task-fix-bug')
    expect(notes).toContain('Fix Bug')
  })

  it('returns null for missing session', () => {
    const session = reader.getSession('myapp', 'task-nonexistent')
    expect(session).toBeNull()
  })

  it('reads accounts', () => {
    const accounts = reader.getAccounts()
    expect(accounts).toContain('default')
  })

  it('detects project stack', () => {
    mkdirSync('/tmp/myapp', { recursive: true })
    writeFileSync('/tmp/myapp/package.json', '{"dependencies":{"react":"18"}}')
    writeFileSync('/tmp/myapp/vitest.config.ts', '')
    const detection = reader.detectStack('myapp')
    expect(detection.hasPackageJson).toBe(true)
    expect(detection.hasTests).toBe(true)
    rmSync('/tmp/myapp', { recursive: true, force: true })
  })
})

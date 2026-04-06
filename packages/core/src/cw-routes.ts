import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import { execSync, execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const spawnedPids = new Map<string, number>()
export { spawnedPids }

export function cwRoutes(reader: CWReader): Hono {
  const app = new Hono()

  app.get('/projects', (c) => {
    return c.json(reader.getProjects())
  })

  app.get('/spaces', (c) => {
    const project = c.req.query('project')
    return c.json(reader.getSpaces(project))
  })

  app.get('/session/:project/:sessionDir', (c) => {
    const { project, sessionDir } = c.req.param()
    const session = reader.getSession(project, sessionDir)
    if (!session) return c.json({ error: 'Session not found' }, 404)
    return c.json(session)
  })

  app.get('/notes/:project/:sessionDir', (c) => {
    const { project, sessionDir } = c.req.param()
    const content = reader.getNotes(project, sessionDir)
    return c.json({ content })
  })

  app.get('/accounts', (c) => {
    return c.json(reader.getAccounts())
  })

  app.get('/detect/:project', (c) => {
    const project = c.req.param('project')
    return c.json(reader.detectStack(project))
  })

  app.get('/mcps', (c) => {
    const project = c.req.query('project')
    return c.json(reader.getMCPs(project))
  })

  app.get('/tools', (c) => {
    const project = c.req.query('project')
    return c.json(reader.getTools(project))
  })

  app.get('/git/status/:project/:sessionDir', (c) => {
    const session = reader.getSession(c.req.param('project'), c.req.param('sessionDir'))
    if (!session) return c.json({ error: 'Session not found' }, 404)
    try {
      const output = execSync('git status --short', { cwd: session.worktree, encoding: 'utf-8', timeout: 5000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.get('/git/log/:project/:sessionDir', (c) => {
    const session = reader.getSession(c.req.param('project'), c.req.param('sessionDir'))
    if (!session) return c.json({ error: 'Session not found' }, 404)
    try {
      const output = execSync('git log --oneline -20', { cwd: session.worktree, encoding: 'utf-8', timeout: 5000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.get('/git/diff/:project/:sessionDir', (c) => {
    const session = reader.getSession(c.req.param('project'), c.req.param('sessionDir'))
    if (!session) return c.json({ error: 'Session not found' }, 404)
    try {
      const output = execSync('git diff HEAD~5..HEAD --stat 2>/dev/null || git diff --stat', { cwd: session.worktree, encoding: 'utf-8', timeout: 10000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.post('/start', async (c) => {
    const { type, project, task, description, workflow, account, directory } = await c.req.json<{
      type: string; project: string; task: string; description?: string; workflow?: string; account?: string; directory?: string
    }>()

    // Check if session already exists (active)
    const cwHome = join(process.env.HOME ?? '', '.cw')
    const taskSlug = task.trim()
    const dirPrefix = type === 'review' ? 'review-pr-' : 'task-'
    const sessionDir = join(cwHome, 'sessions', project, `${dirPrefix}${taskSlug}`)
    const sessionFile = join(sessionDir, 'session.json')

    if (existsSync(sessionFile)) {
      try {
        const meta = JSON.parse(readFileSync(sessionFile, 'utf-8'))
        if (meta.status === 'active') {
          return c.json({ ok: false, error: `Session "${taskSlug}" already exists for ${project}. Pick a different name or open the existing task.` }, 409)
        }
      } catch {}
    }

    const args: string[] = []
    if (type === 'review') {
      args.push('review', project, task)
      if (account) args.push('--account', account)
    } else if (type === 'plan') {
      args.push('plan', project, description ?? task)
    } else if (type === 'create') {
      args.push('create', description ?? task, '--name', project)
      if (account) args.push('--account', account)
      if (directory) args.push('--dir', directory)
    } else {
      args.push('work', project, task)
      if (account) args.push('--account', account)
      if (workflow) args.push('--workflow', workflow)
    }

    // Pre-write description to TASK_NOTES.md so CW picks it up
    if (description && type !== 'plan' && type !== 'create') {
      const { mkdirSync, writeFileSync: writeSync } = await import('node:fs')
      const notesDir = join(cwHome, 'sessions', project, `${dirPrefix}${taskSlug}`)
      mkdirSync(notesDir, { recursive: true })
      const notesFile = join(notesDir, type === 'review' ? 'REVIEW_NOTES.md' : 'TASK_NOTES.md')
      if (!existsSync(notesFile)) {
        writeSync(notesFile, `# ${type === 'review' ? 'Review' : 'Task'}: ${taskSlug}\n\n## Description\n${description}\n\n## Notes\n`)
      }
    }

    // CW commands are interactive (open terminal windows).
    // Spawn detached so they don't block the server.
    const child = spawn('cw', args, {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    // Track PID so PTY manager can kill it before taking over
    if (child.pid) {
      const taskSlug = type === 'review' ? task : task
      const dirName = type === 'review' ? `review-pr-${taskSlug}` : `task-${taskSlug}`
      spawnedPids.set(`${project}::${dirName}`, child.pid)
    }

    return c.json({ ok: true, command: `cw ${args.join(' ')}` })
  })

  app.post('/done', async (c) => {
    const { project, task, type, sessionDir } = await c.req.json<{ project: string; task: string; type: string; sessionDir?: string }>()

    // Directly update session.json for instant UI feedback
    const cwHome = join(process.env.HOME ?? '', '.cw')
    const sessionDirName = sessionDir ?? (type === 'review' ? `review-pr-${task}` : `task-${task}`)
    const sessionFile = join(cwHome, 'sessions', project, sessionDirName, 'session.json')

    let updated = false
    if (existsSync(sessionFile)) {
      try {
        const meta = JSON.parse(readFileSync(sessionFile, 'utf-8'))
        meta.status = 'done'
        meta.closed = new Date().toISOString()
        writeFileSync(sessionFile, JSON.stringify(meta, null, 2))
        updated = true
      } catch {}
    }

    // Also spawn cw --done in background for worktree cleanup
    const args = type === 'review'
      ? ['review', project, task, '--done']
      : ['work', project, task, '--done']
    try {
      const child = spawn('cw', args, { detached: true, stdio: 'ignore' })
      child.unref()
    } catch {}

    return c.json({ ok: true, updated })
  })

  app.post('/delete-project', async (c) => {
    const { project, deleteFiles } = await c.req.json<{ project: string; deleteFiles: boolean }>()

    // Get project path before removing from CW
    const projects = reader.getProjects()
    const projPath = projects[project]?.path

    // Unregister from CW
    try {
      execFileSync('cw', ['project', 'remove', project, '--yes'], { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' })
    } catch {
      // May not be registered, continue anyway
    }

    // Always clean up session data for this project
    const { rmSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const sessionsDir = join(process.env.HOME ?? '', '.cw', 'sessions', project)
    if (existsSync(sessionsDir)) {
      try { rmSync(sessionsDir, { recursive: true, force: true }) } catch {}
    }

    // Delete project files if requested
    if (deleteFiles && projPath) {
      try {
        rmSync(projPath, { recursive: true, force: true })
      } catch {
        return c.json({ ok: true, filesDeleted: false, reason: 'Failed to delete directory' })
      }
    }

    return c.json({ ok: true, filesDeleted: deleteFiles && !!projPath })
  })

  return app
}

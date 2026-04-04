import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import { execSync, spawn } from 'node:child_process'

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

    let cmd = ''
    if (type === 'review') {
      cmd = `cw review ${project} ${task}`
    } else if (type === 'plan') {
      cmd = `cw plan ${project} "${description ?? task}"`
    } else if (type === 'create') {
      cmd = `cw create "${description ?? task}" --name ${project}`
      if (account) cmd += ` --account ${account}`
      if (directory) cmd += ` --dir ${directory}`
    } else {
      cmd = `cw work ${project} ${task}`
      if (workflow) cmd += ` --workflow ${workflow}`
    }

    // CW commands are interactive (open terminal windows).
    // Spawn detached so they don't block the server.
    const child = spawn('sh', ['-c', cmd], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    return c.json({ ok: true, command: cmd })
  })

  app.post('/done', async (c) => {
    const { project, task, type } = await c.req.json<{ project: string; task: string; type: string }>()
    const cmd = type === 'review'
      ? `cw review ${project} ${task} --done`
      : `cw work ${project} ${task} --done`

    const child = spawn('sh', ['-c', cmd], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    return c.json({ ok: true })
  })

  app.post('/delete-project', async (c) => {
    const { project, deleteFiles } = await c.req.json<{ project: string; deleteFiles: boolean }>()

    // Get project path before removing from CW
    const projects = reader.getProjects()
    const projPath = projects[project]?.path

    // Unregister from CW
    try {
      execSync(`echo y | cw project remove ${project}`, { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' })
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

import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import { execSync } from 'node:child_process'

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
    const { type, project, task, description, workflow } = await c.req.json<{
      type: string; project: string; task: string; description?: string; workflow?: string
    }>()

    let cmd = ''
    if (type === 'review') {
      cmd = `cw review ${project} ${task}`
    } else if (type === 'plan') {
      cmd = `cw plan ${project} "${description ?? task}"`
    } else if (type === 'create') {
      cmd = `cw create "${description ?? task}" --name ${project}`
    } else {
      cmd = `cw work ${project} ${task}`
      if (workflow) cmd += ` --workflow ${workflow}`
    }

    try {
      execSync(cmd, { encoding: 'utf-8', timeout: 30000, stdio: 'pipe' })
      return c.json({ ok: true, command: cmd })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return c.json({ ok: false, error: msg, command: cmd }, 500)
    }
  })

  app.post('/done', async (c) => {
    const { project, task, type } = await c.req.json<{ project: string; task: string; type: string }>()
    const cmd = type === 'review'
      ? `cw review ${project} ${task} --done`
      : `cw work ${project} ${task} --done`
    try {
      execSync(cmd, { encoding: 'utf-8', timeout: 15000, stdio: 'pipe' })
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500)
    }
  })

  return app
}

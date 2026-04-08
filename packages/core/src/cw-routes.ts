import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import { ACCOUNT_NAME_RE, type CWSession } from './cw-types.js'
import { execSync, execFileSync, execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

// Sentinel project names for sessions not tied to a registered project
const GENERAL_PROJECT = '__general'
const CREATING_PROJECT = '__creating'

// Sessions created via /api/cw/start that don't exist on disk yet.
// PTY routes check here when reader.getSession() returns null.
const pendingSessions = new Map<string, CWSession>()
export { pendingSessions }

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

  app.post('/accounts', async (c) => {
    const { name } = await c.req.json<{ name: string }>()

    if (!name || !name.trim()) {
      return c.json({ ok: false, error: 'Account name is required' }, 400)
    }

    const trimmed = name.trim()
    if (!ACCOUNT_NAME_RE.test(trimmed)) {
      return c.json({ ok: false, error: 'Name must start with a letter or number and contain only letters, numbers, hyphens, and underscores (max 64 chars)' }, 400)
    }

    if (reader.getAccounts().includes(trimmed)) {
      return c.json({ ok: false, error: `Account "${trimmed}" already exists` }, 409)
    }

    try {
      await execFileAsync('cw', ['account', 'add', trimmed], { encoding: 'utf-8', timeout: 10000 })
      return c.json({ ok: true, name: trimmed })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return c.json({ ok: false, error: `Failed to create account: ${message}` }, 500)
    }
  })

  app.delete('/accounts/:name', async (c) => {
    const name = c.req.param('name')

    if (!ACCOUNT_NAME_RE.test(name)) {
      return c.json({ ok: false, error: 'Invalid account name' }, 400)
    }

    const accountDir = join(reader.cwHome, 'accounts', name)

    if (!existsSync(accountDir)) {
      return c.json({ ok: false, error: `Account "${name}" not found` }, 404)
    }

    try {
      const { rmSync } = await import('node:fs')
      rmSync(accountDir, { recursive: true, force: true })
      return c.json({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return c.json({ ok: false, error: `Failed to remove account: ${message}` }, 500)
    }
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
    const { type, project, task, description, workflow, account, directory, skipPermissions, model } = await c.req.json<{
      type: string; project?: string; task?: string; description?: string; workflow?: string; account?: string; directory?: string; skipPermissions?: boolean; model?: string
    }>()

    // General sessions: no project or task required, just an account
    if (type === 'general') {
      const acct = account || 'default'
      const sessionDirName = `general-${acct}-${Date.now()}`
      const projectPath = project ? reader.getProjects()[project]?.path : undefined
      const projectName = project && projectPath ? project : GENERAL_PROJECT
      const sessionData: CWSession = {
        project: projectName,
        type: 'general',
        account: acct,
        model: model || undefined,
        workflow: '',
        worktree: projectPath ?? '',
        notes: '',
        status: 'active',
        created: new Date().toISOString(),
        last_opened: new Date().toISOString(),
        opens: 0,
        sessionDir: sessionDirName,
        skipPermissions: skipPermissions ?? false,
      }
      pendingSessions.set(`${projectName}::${sessionDirName}`, sessionData)
      return c.json({ ok: true, session: sessionData, command: `cw launch ${acct}` })
    }

    if (type === 'create') {
      const name = project?.trim()
      if (!name) return c.json({ ok: false, error: 'Project name is required' }, 400)
      const sessionDirName = `create-${name}-${Date.now()}`
      const sessionData: CWSession = {
        project: CREATING_PROJECT,
        task: name,
        type: 'create',
        account: account ?? '',
        model: model || undefined,
        workflow: '',
        worktree: directory ?? '',
        notes: description ?? name,
        status: 'active',
        created: new Date().toISOString(),
        last_opened: new Date().toISOString(),
        opens: 0,
        sessionDir: sessionDirName,
        skipPermissions: skipPermissions ?? false,
      }
      pendingSessions.set(`${CREATING_PROJECT}::${sessionDirName}`, sessionData)
      return c.json({ ok: true, session: sessionData })
    }

    if (!project || !task) {
      return c.json({ ok: false, error: 'Project and task are required' }, 400)
    }

    // Check if session already exists (active)
    const cwHome = join(process.env.HOME ?? '', '.cw')
    let taskSlug = task.trim()
    let taskUrl: string | undefined
    let taskSource: string | undefined

    // Extract identifier from URLs (mirrors CW's parsing)
    if (taskSlug.startsWith('http')) {
      taskUrl = taskSlug
      if (taskSlug.includes('github.com')) {
        taskSource = 'github'
        const pullM = taskSlug.match(/\/pull\/(\d+)/)
        if (pullM && type !== 'review') {
          // For dev tasks with a PR URL: pre-fetch the actual branch via gh CLI
          // so CW creates the worktree on the PR's branch without needing GitHub MCP
          const projectPath = project ? reader.getProjects()[project]?.path : undefined
          try {
            const result = await execFileAsync('gh', ['pr', 'view', pullM[1], '--json', 'headRefName', '--jq', '.headRefName'], {
              encoding: 'utf-8', timeout: 5000,
              cwd: projectPath || process.cwd()
            })
            const branch = result.stdout.trim()
            taskSlug = branch || `pull-${pullM[1]}`
          } catch {
            taskSlug = `pull-${pullM[1]}`
          }
        } else {
          // Review type or non-PR URL: just extract the number/slug
          const m = taskSlug.match(/\d+$/)
          if (m) taskSlug = m[0]
        }
      } else if (taskSlug.includes('linear.app')) {
        taskSource = 'linear'
        const m = taskSlug.match(/([A-Z]+-\d+)/)
        if (m) taskSlug = m[1]
      } else if (taskSlug.includes('notion.so') || taskSlug.includes('notion.site')) {
        taskSource = 'notion'
        const parts = taskSlug.split('/')
        const last = parts[parts.length - 1] ?? ''
        taskSlug = last.replace(/-[a-f0-9]+$/, '').slice(0, 30)
      } else {
        taskSource = 'url'
        taskSlug = taskSlug.replace(/^https?:\/\//, '').replace(/\//g, '-').slice(0, 30)
      }
    }

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
    if (skipPermissions) args.push('--skip-permissions')
    if (type === 'review') {
      args.push('review', project, task)
      if (account) args.push('--account', account)
      if (model) args.push('--model', model)
    } else if (type === 'plan') {
      args.push('plan', project, description ?? task)
      if (model) args.push('--model', model)
    } else {
      args.push('work', project, task)
      if (account) args.push('--account', account)
      if (workflow) args.push('--workflow', workflow)
      if (model) args.push('--model', model)
    }

    // Pre-write description to TASK_NOTES.md so CW picks it up
    if (description && type !== 'plan') {
      const { mkdirSync, writeFileSync: writeSync } = await import('node:fs')
      const notesDir = join(cwHome, 'sessions', project, `${dirPrefix}${taskSlug}`)
      mkdirSync(notesDir, { recursive: true })
      const notesFile = join(notesDir, type === 'review' ? 'REVIEW_NOTES.md' : 'TASK_NOTES.md')
      if (!existsSync(notesFile)) {
        writeSync(notesFile, `# ${type === 'review' ? 'Review' : 'Task'}: ${taskSlug}\n\n## Description\n${description}\n\n## Notes\n`)
      }
    }

    // Return session info so the frontend can open the tab directly.
    // The PTY manager will spawn `cw work/review` when the tab connects.
    // No detached process — avoids double spawn and stale session resume.
    const sessionDirName = `${dirPrefix}${taskSlug}`
    const sessionData: CWSession = {
      project,
      task: type === 'review' ? undefined : taskSlug,
      pr: type === 'review' ? taskSlug : undefined,
      type: type === 'review' ? 'review' : 'task',
      account: account ?? '',
      workflow: workflow ?? '',
      model: model || undefined,
      source: taskSource,
      source_url: taskUrl,
      worktree: '',
      notes: '',
      status: 'active',
      created: new Date().toISOString(),
      last_opened: new Date().toISOString(),
      opens: 0,
      sessionDir: sessionDirName,
      skipPermissions: skipPermissions ?? false,
    }

    // Store so pty-routes can find it before CW creates session.json on disk
    pendingSessions.set(`${project}::${sessionDirName}`, sessionData)

    return c.json({ ok: true, session: sessionData, command: `cw ${args.join(' ')}` })
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

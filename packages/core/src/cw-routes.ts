import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import { ACCOUNT_NAME_RE, HARNESS_NAME_RE, type CWSession } from './cw-types.js'
import { execSync, execFileSync, execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { join, resolve, dirname, basename, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { createDoctorClient, readContextTokens } from './cw-doctor.js'
import { HARNESS_CAPABILITIES } from './harness-capabilities.js'

const execFileAsync = promisify(execFile)

// Sentinel project names for sessions not tied to a registered project
const GENERAL_PROJECT = '__general'
const CREATING_PROJECT = '__creating'
const ACCOUNTS_PROJECT = '__accounts'

// Sessions created via /api/cw/start that don't exist on disk yet.
// PTY routes check here when reader.getSession() returns null.
const pendingSessions = new Map<string, CWSession>()
export { pendingSessions }

export function cwRoutes(reader: CWReader): Hono {
  const app = new Hono()

  // Resolve `cw` to an absolute path so spawn() doesn't depend on PATH.
  // Forge is often launched from contexts (Finder, a stripped-PATH shell,
  // a CW-spawned subprocess) where ~/.cw/bin isn't on PATH and a bare
  // `spawn('cw')` fails with ENOENT.
  const cwBin = (() => {
    const candidate = join(reader.cwHome, 'bin', 'cw')
    return existsSync(candidate) ? candidate : 'cw'
  })()

  const doctor = createDoctorClient(cwBin)

  app.get('/harnesses', async (c) => {
    const result = await doctor.get(c.req.query('fresh') === '1')
    if (!result.available) return c.json(result)
    const capabilities = Object.fromEntries(
      result.doctor.harnesses.map(h => [h.name, [...(HARNESS_CAPABILITIES[h.name] ?? [])]])
    )
    return c.json({ ...result, capabilities, contextTokens: readContextTokens(reader.cwHome) })
  })

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
      await execFileAsync(cwBin, ['account', 'add', trimmed], { encoding: 'utf-8', timeout: 10000 })
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

  // Shared lookup for the git info routes below. Sessions read from disk
  // (e.g. loop sessions, which CW may persist without a `worktree` field)
  // can have an empty/undefined worktree. Running git with `cwd: undefined`
  // would silently inherit the Forge server's own cwd and leak ITS repo's
  // git state into the UI, so callers must check `worktree` before shelling
  // out and return their own "empty" shape instead.
  const loadGitSession = (project: string, sessionDir: string): { session: CWSession } | { error: true } | { empty: true } => {
    const session = reader.getSession(project, sessionDir)
    if (!session) return { error: true }
    if (!session.worktree) return { empty: true }
    return { session }
  }

  app.get('/git/status/:project/:sessionDir', (c) => {
    const result = loadGitSession(c.req.param('project'), c.req.param('sessionDir'))
    if ('error' in result) return c.json({ error: 'Session not found' }, 404)
    if ('empty' in result) return c.json({ output: '' })
    try {
      const output = execSync('git status --short', { cwd: result.session.worktree, encoding: 'utf-8', timeout: 5000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.get('/git/log/:project/:sessionDir', (c) => {
    const result = loadGitSession(c.req.param('project'), c.req.param('sessionDir'))
    if ('error' in result) return c.json({ error: 'Session not found' }, 404)
    if ('empty' in result) return c.json({ output: '' })
    try {
      const output = execSync('git log --oneline -20', { cwd: result.session.worktree, encoding: 'utf-8', timeout: 5000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.get('/git/branch/:project/:sessionDir', (c) => {
    const result = loadGitSession(c.req.param('project'), c.req.param('sessionDir'))
    if ('error' in result) return c.json({ error: 'Session not found' }, 404)
    if ('empty' in result) return c.json({ branch: '' })
    try {
      const output = execSync('git rev-parse --abbrev-ref HEAD', { cwd: result.session.worktree, encoding: 'utf-8', timeout: 5000 }).trim()
      return c.json({ branch: output })
    } catch {
      return c.json({ branch: '' })
    }
  })

  app.get('/git/diff/:project/:sessionDir', (c) => {
    const result = loadGitSession(c.req.param('project'), c.req.param('sessionDir'))
    if ('error' in result) return c.json({ error: 'Session not found' }, 404)
    if ('empty' in result) return c.json({ output: '' })
    try {
      const output = execSync('git diff HEAD~5..HEAD --stat 2>/dev/null || git diff --stat', { cwd: result.session.worktree, encoding: 'utf-8', timeout: 10000 })
      return c.json({ output })
    } catch {
      return c.json({ output: '' })
    }
  })

  app.post('/start', async (c) => {
    const { type, project, task, description, workflow, account, directory, skipPermissions, model, loopPrompt, loopInterval, name, harness } = await c.req.json<{
      type: string; project?: string; task?: string; description?: string; workflow?: string; account?: string; directory?: string; skipPermissions?: boolean; model?: string; loopPrompt?: string; loopInterval?: string; name?: string; harness?: string
    }>()

    if (harness !== undefined && !HARNESS_NAME_RE.test(harness)) {
      return c.json({ ok: false, error: 'Invalid harness' }, 400)
    }

    if (type === 'login') {
      if (!account || !ACCOUNT_NAME_RE.test(account) || !reader.getAccounts().includes(account)) {
        return c.json({ ok: false, error: 'Unknown account' }, 400)
      }
      if (!harness) return c.json({ ok: false, error: 'Harness is required' }, 400)
      const sessionDirName = `login-${account}-${harness}`
      const now = new Date().toISOString()
      const sessionData: CWSession = {
        project: ACCOUNTS_PROJECT,
        type: 'login',
        account,
        harness,
        workflow: '',
        worktree: '',
        notes: '',
        status: 'active',
        created: now,
        last_opened: now,
        opens: 0,
        sessionDir: sessionDirName,
      }
      pendingSessions.set(`${ACCOUNTS_PROJECT}::${sessionDirName}`, sessionData)
      return c.json({ ok: true, session: sessionData })
    }

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
        harness: harness || undefined,
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
        harness: harness || undefined,
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

    if (type === 'loop') {
      if (!project) return c.json({ ok: false, error: 'Project is required' }, 400)
      if (harness && harness !== 'claude') {
        return c.json({ ok: false, error: 'Loop runs on Claude Code only' }, 400)
      }
      const prompt = (loopPrompt ?? '').trim()
      if (!prompt) return c.json({ ok: false, error: 'Loop prompt is required' }, 400)
      const interval = (loopInterval ?? '').trim()
      if (interval && !/^\d+[smh]$/.test(interval)) {
        return c.json({ ok: false, error: 'Interval must be like 30s, 5m, 2h' }, 400)
      }
      const explicitName = name?.trim()
      if (explicitName && !/^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/.test(explicitName)) {
        return c.json({ ok: false, error: 'Invalid name. Use lowercase letters, numbers, hyphens (max 30 chars)' }, 400)
      }
      const slug = (explicitName || prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30))
        .replace(/^-+|-+$/g, '')
      if (!slug) return c.json({ ok: false, error: 'Could not derive a name from the prompt' }, 400)

      const sessionDirName = `loop-${slug}`
      const loopSessionFile = join(reader.cwHome, 'sessions', project, sessionDirName, 'session.json')
      if (existsSync(loopSessionFile)) {
        try {
          const meta = JSON.parse(readFileSync(loopSessionFile, 'utf-8'))
          if (meta.status === 'active') {
            return c.json({ ok: false, error: `Loop "${slug}" already exists for ${project}. Pick a different name or open the existing session.` }, 409)
          }
        } catch {}
      }

      const projectPath = reader.getProjects()[project]?.path ?? ''
      const sessionData: CWSession = {
        project,
        task: slug,
        type: 'loop',
        account: account ?? '',
        harness: harness || undefined,
        model: model || undefined,
        loop_prompt: prompt,
        loop_interval: interval,
        workflow: '',
        // This in-memory pending session may carry the project path (used as
        // the PTY's cwd), but it must never be persisted to CW's session.json —
        // `cw clean` treats a persisted worktree as a stale-space candidate to
        // rm -rf. CW itself writes 'worktree': '' when it creates the file.
        worktree: projectPath,
        notes: '',
        status: 'active',
        created: new Date().toISOString(),
        last_opened: new Date().toISOString(),
        opens: 0,
        sessionDir: sessionDirName,
        skipPermissions: skipPermissions ?? false,
      }
      pendingSessions.set(`${project}::${sessionDirName}`, sessionData)
      return c.json({ ok: true, session: sessionData })
    }

    if (!project || !task) {
      return c.json({ ok: false, error: 'Project and task are required' }, 400)
    }

    // Check if session already exists (active)
    const cwHome = reader.cwHome
    let taskSlug = task.trim()
    let taskUrl: string | undefined
    let taskSource: string | undefined

    // Extract identifier from URLs (mirrors CW's parsing)
    if (taskSlug.startsWith('http')) {
      taskUrl = taskSlug
      if (taskSlug.includes('github.com')) {
        taskSource = 'github'
        const m = taskSlug.match(/(\d+)\s*$/)
        if (m) taskSlug = m[1]
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
    } else {
      args.push('work', project, task)
      if (account) args.push('--account', account)
      if (workflow) args.push('--workflow', workflow)
      if (model) args.push('--model', model)
    }
    if (harness) args.push('--harness', harness)

    // Pre-write description to TASK_NOTES.md so CW picks it up.
    // Uses ## Description section that CW extracts into the init_prompt.
    if (description) {
      const notesDir = join(cwHome, 'sessions', project, `${dirPrefix}${taskSlug}`)
      mkdirSync(notesDir, { recursive: true })
      const notesFile = join(notesDir, type === 'review' ? 'REVIEW_NOTES.md' : 'TASK_NOTES.md')
      if (!existsSync(notesFile)) {
        const header = type === 'review' ? 'Review' : 'Task'
        const now = new Date().toISOString().slice(0, 10)
        writeFileSync(notesFile, [
          `# ${header}: ${taskSlug}`,
          `**Project:** ${project}`,
          `**Created:** ${now}`,
          '',
          '## Description',
          description,
          '',
          '## Context',
          '<!-- Additional context discovered during work -->',
          '',
          '## Decisions',
          '<!-- Important decisions made during this task -->',
          '',
          '## Status',
          '- [ ] Pending',
          '',
          '## Notes',
          '<!-- Findings, context, references -->',
          '',
        ].join('\n'))
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
      harness: harness || undefined,
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
    const cwHome = reader.cwHome
    const sessionDirName = sessionDir ?? (type === 'review' ? `review-pr-${task}` : type === 'loop' ? `loop-${task}` : `task-${task}`)
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
      : type === 'loop'
        ? ['loop', project, task, '--done']
        : ['work', project, task, '--done']
    try {
      const child = spawn(cwBin, args, { detached: true, stdio: 'ignore' })
      child.unref()
    } catch {}

    return c.json({ ok: true, updated })
  })

  app.post('/move-project', async (c) => {
    const { project, toAccount } = await c.req.json<{ project: string; toAccount: string }>()

    if (!project || !toAccount) {
      return c.json({ ok: false, error: 'Project and target account are required' }, 400)
    }

    if (!ACCOUNT_NAME_RE.test(toAccount)) {
      return c.json({ ok: false, error: 'Invalid account name' }, 400)
    }

    const projects = reader.getProjects()

    if (!projects[project]) {
      return c.json({ ok: false, error: `Project "${project}" not found` }, 404)
    }

    if (projects[project].account === toAccount) {
      return c.json({ ok: false, error: `Project "${project}" is already in account "${toAccount}"` }, 409)
    }

    if (!reader.getAccounts().includes(toAccount)) {
      return c.json({ ok: false, error: `Account "${toAccount}" does not exist` }, 404)
    }

    projects[project] = { ...projects[project], account: toAccount }

    try {
      writeFileSync(join(reader.cwHome, 'projects.json'), JSON.stringify(projects, null, 2))
      return c.json({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return c.json({ ok: false, error: `Failed to update projects: ${message}` }, 500)
    }
  })

  app.post('/delete-project', async (c) => {
    const { project, deleteFiles } = await c.req.json<{ project: string; deleteFiles: boolean }>()

    // Get project path before removing from CW
    const projects = reader.getProjects()
    const projPath = projects[project]?.path

    // Unregister from CW
    try {
      execFileSync(cwBin, ['project', 'remove', project, '--yes'], { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' })
    } catch {
      // May not be registered, continue anyway
    }

    // Always clean up session data for this project
    const sessionsDir = join(reader.cwHome, 'sessions', project)
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

  // Resolve a user-supplied path, expanding ~ and resolving relative to home.
  // Returns null if the result would escape allowed roots.
  const resolveBrowsePath = (input: string): string | null => {
    const home = homedir()
    let p = input.trim()
    if (!p) p = home
    if (p === '~' || p.startsWith('~/')) p = join(home, p.slice(1).replace(/^\//, ''))
    if (!isAbsolute(p)) return null
    return resolve(p)
  }

  app.get('/browse-dirs', (c) => {
    const requested = c.req.query('path') ?? '~'
    const target = resolveBrowsePath(requested)
    if (!target) {
      return c.json({ ok: false, error: 'Path must be absolute or start with ~' }, 400)
    }

    if (!existsSync(target)) {
      return c.json({ ok: false, error: `Path does not exist: ${target}` }, 404)
    }

    let stat
    try { stat = statSync(target) } catch {
      return c.json({ ok: false, error: 'Cannot stat path' }, 500)
    }
    if (!stat.isDirectory()) {
      return c.json({ ok: false, error: 'Not a directory' }, 400)
    }

    let entries: Dirent[] = []
    try {
      entries = readdirSync(target, { withFileTypes: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return c.json({ ok: false, error: `Cannot read directory: ${message}` }, 500)
    }

    const dirs = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(({ name }) => {
        const full = join(target, name)
        return { name, path: full, isGitRepo: existsSync(join(full, '.git')) }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    const parent = dirname(target)
    return c.json({
      ok: true,
      path: target,
      parent: parent === target ? null : parent,
      home: homedir(),
      isGitRepo: existsSync(join(target, '.git')),
      entries: dirs,
    })
  })

  app.post('/register-project', async (c) => {
    const { path: rawPath, account, alias, type } = await c.req.json<{
      path: string; account: string; alias?: string; type?: string
    }>()

    if (!rawPath || !account) {
      return c.json({ ok: false, error: 'Path and account are required' }, 400)
    }

    if (!ACCOUNT_NAME_RE.test(account)) {
      return c.json({ ok: false, error: 'Invalid account name' }, 400)
    }

    const projectPath = resolveBrowsePath(rawPath)
    if (!projectPath) {
      return c.json({ ok: false, error: 'Path must be absolute or start with ~' }, 400)
    }

    if (!existsSync(projectPath)) {
      return c.json({ ok: false, error: `Path does not exist: ${projectPath}` }, 404)
    }

    if (!existsSync(join(projectPath, '.git'))) {
      return c.json({ ok: false, error: 'Selected directory is not a git repository' }, 400)
    }

    if (!reader.getAccounts().includes(account)) {
      return c.json({ ok: false, error: `Account "${account}" does not exist` }, 404)
    }

    const projectName = (alias?.trim() || basename(projectPath)).trim()
    if (reader.getProjects()[projectName]) {
      return c.json({ ok: false, error: `Project "${projectName}" is already registered` }, 409)
    }

    const args = ['project', 'register', projectPath, '--account', account]
    if (alias?.trim()) args.push('--alias', alias.trim())
    if (type?.trim()) args.push('--type', type.trim())

    try {
      await execFileAsync(cwBin, args, { encoding: 'utf-8', timeout: 30000 })
      return c.json({ ok: true, project: projectName })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return c.json({ ok: false, error: `Failed to register project: ${message}` }, 500)
    }
  })

  return app
}

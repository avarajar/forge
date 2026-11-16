import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sessionFolder, type CWReader } from './cw-reader.js'
import { HARNESS_NAME_RE, ACCOUNT_NAME_RE, type CWSession } from './cw-types.js'
import type { PTYManager, PTYSession } from './pty-manager.js'
import type { GeneralSessions } from './general-sessions.js'
import { takeSession } from './pty-routes.js'

// Sentinel project names for sessions not tied to a registered project
const GENERAL_PROJECT = '__general'
const CREATING_PROJECT = '__creating'
const ACCOUNTS_PROJECT = '__accounts'

// Sessions created via /api/cw/start that don't exist on disk yet.
// PTY routes check here when reader.getSession() returns null.
export const pendingSessions = new Map<string, CWSession>()

export interface StartInput {
  type: string
  project?: string
  task?: string
  description?: string
  workflow?: string
  account?: string
  directory?: string
  skipPermissions?: boolean
  model?: string
  loopPrompt?: string
  loopInterval?: string
  name?: string
  harness?: string
}

export type StartResult =
  | { ok: true; session: CWSession; key: string; command?: string }
  | { ok: false; status: 400 | 409; error: string }

export async function prepareStart(input: StartInput, deps: { reader: CWReader }): Promise<StartResult> {
  const { reader } = deps
  const { type, project, task, description, workflow, account, directory, skipPermissions, model, loopPrompt, loopInterval, name, harness } = input

  if (harness !== undefined && !HARNESS_NAME_RE.test(harness)) {
    return { ok: false, status: 400, error: 'Invalid harness' }
  }

  if (type === 'login') {
    if (!account || !ACCOUNT_NAME_RE.test(account) || !reader.getAccounts().includes(account)) {
      return { ok: false, status: 400, error: 'Unknown account' }
    }
    if (!harness) return { ok: false, status: 400, error: 'Harness is required' }
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
    return { ok: true, session: sessionData, key: `${ACCOUNTS_PROJECT}::${sessionDirName}` }
  }

  // General sessions: no project or task required, just an account; directory runs it in any folder
  if (type === 'general') {
    const acct = account || 'default'
    const sessionDirName = `general-${acct}-${Date.now()}`
    const projectPath = project ? reader.getProjects()[project]?.path : undefined
    const projectName = project && projectPath ? project : GENERAL_PROJECT
    const sessionData: CWSession = {
      project: projectName,
      task: task?.trim() || undefined,
      type: 'general',
      account: acct,
      harness: harness || undefined,
      model: model || undefined,
      workflow: '',
      worktree: projectPath ?? directory ?? '',
      notes: '',
      status: 'active',
      created: new Date().toISOString(),
      last_opened: new Date().toISOString(),
      opens: 0,
      sessionDir: sessionDirName,
      skipPermissions: skipPermissions ?? false,
    }
    pendingSessions.set(`${projectName}::${sessionDirName}`, sessionData)
    return { ok: true, session: sessionData, key: `${projectName}::${sessionDirName}`, command: `cw launch ${acct}` }
  }

  if (type === 'create') {
    const name = project?.trim()
    if (!name) return { ok: false, status: 400, error: 'Project name is required' }
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
    return { ok: true, session: sessionData, key: `${CREATING_PROJECT}::${sessionDirName}` }
  }

  if (type === 'loop') {
    if (!project) return { ok: false, status: 400, error: 'Project is required' }
    if (harness && harness !== 'claude') {
      return { ok: false, status: 400, error: 'Loop runs on Claude Code only' }
    }
    const prompt = (loopPrompt ?? '').trim()
    if (!prompt) return { ok: false, status: 400, error: 'Loop prompt is required' }
    const interval = (loopInterval ?? '').trim()
    if (interval && !/^\d+[smh]$/.test(interval)) {
      return { ok: false, status: 400, error: 'Interval must be like 30s, 5m, 2h' }
    }
    const explicitName = name?.trim()
    if (explicitName && !/^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/.test(explicitName)) {
      return { ok: false, status: 400, error: 'Invalid name. Use lowercase letters, numbers, hyphens (max 30 chars)' }
    }
    const slug = (explicitName || prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30))
      .replace(/^-+|-+$/g, '')
    if (!slug) return { ok: false, status: 400, error: 'Could not derive a name from the prompt' }

    const sessionDirName = `loop-${slug}`
    const loopSessionFile = join(reader.cwHome, 'sessions', project, sessionDirName, 'session.json')
    if (existsSync(loopSessionFile)) {
      try {
        const meta = JSON.parse(readFileSync(loopSessionFile, 'utf-8'))
        if (meta.status === 'active') {
          return { ok: false, status: 409, error: `Loop "${slug}" already exists for ${project}. Pick a different name or open the existing session.` }
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
    return { ok: true, session: sessionData, key: `${project}::${sessionDirName}` }
  }

  if (!project || !task) {
    return { ok: false, status: 400, error: 'Project and task are required' }
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
  const sessionDir = sessionFolder(cwHome, project, `${dirPrefix}${taskSlug}`)
  if (!sessionDir) return { ok: false, status: 400, error: 'Invalid project or task name' }
  const sessionFile = join(sessionDir, 'session.json')

  if (existsSync(sessionFile)) {
    try {
      const meta = JSON.parse(readFileSync(sessionFile, 'utf-8'))
      if (meta.status === 'active') {
        return { ok: false, status: 409, error: `Session "${taskSlug}" already exists for ${project}. Pick a different name or open the existing task.` }
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
    const notesDir = sessionDir
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

  return { ok: true, session: sessionData, key: `${project}::${sessionDirName}`, command: `cw ${args.join(' ')}` }
}

// Starts a pending session's terminal now, with no browser tab attached
export function launchHeadless(project: string, sessionDir: string, deps: { reader: CWReader; manager: PTYManager; general: GeneralSessions }): PTYSession | null {
  const taken = takeSession(deps.reader, project, sessionDir, deps.general)
  if (!taken) return null
  return deps.manager.getOrCreate(project, sessionDir, taken.session, { isNew: taken.isNew, headless: true })
}

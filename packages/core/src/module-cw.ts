import { ModuleError } from '@forge-dev/sdk'
import type { CwStartInput, SendResult } from '@forge-dev/sdk'
import type { CWReader } from './cw-reader.js'
import type { PTYManager } from './pty-manager.js'
import type { StateTracker } from './session-state.js'
import type { GeneralSessions } from './general-sessions.js'
import type { ContextDeps } from './module-context.js'
import { launchHeadless, prepareStart } from './cw-start.js'

const POLL_MS = 500
const DEFAULT_WAIT_MS = 90_000

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

// one line for a terminal: no control characters, collapsed whitespace
const oneLine = (text: string) => text.replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim()

export function createCwDeps(o: {
  reader: CWReader
  manager: PTYManager
  states: StateTracker | null
  general: GeneralSessions
  waitMs?: number
}): NonNullable<ContextDeps['cw']> {
  const { reader, manager, states, general } = o
  const waitMs = o.waitMs ?? DEFAULT_WAIT_MS

  const waitFor = async (key: string, ready: (state: string | undefined) => boolean) => {
    const deadline = Date.now() + waitMs
    while (!ready(states?.snapshot()[key]?.state)) {
      if (Date.now() >= deadline) throw new ModuleError('unreachable', `${key} did not reach its prompt in ${Math.round(waitMs / 1000)} s`)
      await sleep(POLL_MS)
    }
  }

  const start = async (input: CwStartInput) => {
    // a general session with no account takes the project's, then the first one, as the start card does
    const account = input.account ?? (input.type === 'general'
      ? (input.project ? reader.getProjects()[input.project]?.account : undefined) ?? reader.getAccounts()[0]
      : undefined)
    const prepared = await prepareStart({
      type: input.type,
      project: input.project,
      task: input.task,
      description: input.description,
      directory: input.directory,
      account,
      harness: input.harness,
    }, { reader })
    if (!prepared.ok) throw new ModuleError('bad_request', prepared.error)
    const { project, sessionDir } = prepared.session
    if (!sessionDir) throw new ModuleError('upstream', 'the session has no folder name')
    const pty = launchHeadless(project, sessionDir, { reader, manager, general })
    if (!pty) throw new ModuleError('upstream', `could not start ${project}/${sessionDir}`)
    const prompt = input.type === 'general' && input.prompt ? oneLine(input.prompt) : ''
    if (prompt) {
      await waitFor(`${project}::${sessionDir}`, state => state === 'waiting')
      if (!manager.typeLine(project, sessionDir, prompt)) throw new ModuleError('unreachable', `${project}::${sessionDir} closed before it could be typed into`)
    }
    return { project, sessionDir }
  }

  const send = async (project: string, sessionDir: string, text: string): Promise<SendResult> => {
    const key = `${project}::${sessionDir}`
    const stored = reader.getSession(project, sessionDir)
    const session = stored ?? general.get(key)
    if (!session) return 'unavailable'
    if ((session.harness ?? 'claude') !== 'claude') return 'unsupported'

    const wasLive = manager.has(key)
    if (!wasLive) {
      if (!stored) return 'unavailable'
      const pty = manager.getOrCreate(project, sessionDir, stored, { isNew: false, headless: true })
      if (!pty) throw new ModuleError('unreachable', `could not resume ${key}`)
    }
    await waitFor(key, state => state === 'waiting' || state === 'idle')
    if (!manager.typeLine(project, sessionDir, text)) throw new ModuleError('unreachable', `${key} closed before it could be typed into`)
    return wasLive ? 'typed' : 'resumed'
  }

  return { start, send }
}

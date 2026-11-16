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

export function createCwDeps(o: {
  reader: CWReader
  manager: PTYManager
  states: StateTracker | null
  general: GeneralSessions
  waitMs?: number
}): NonNullable<ContextDeps['cw']> {
  const { reader, manager, states, general } = o
  const waitMs = o.waitMs ?? DEFAULT_WAIT_MS

  const start = async (input: CwStartInput) => {
    // a general session with no account takes the project's, then the first one, as the start card does
    const account = input.account ?? (input.type === 'general'
      ? (input.project ? reader.getProjects()[input.project]?.account : undefined) ?? reader.getAccounts()[0]
      : undefined)
    const prepared = await prepareStart({
      type: input.type,
      project: input.project,
      task: input.task,
      directory: input.directory,
      account,
      harness: input.harness,
    }, { reader })
    if (!prepared.ok) throw new ModuleError('bad_request', prepared.error)
    const { project, sessionDir } = prepared.session
    if (!sessionDir) throw new ModuleError('upstream', 'the session has no folder name')
    const pty = launchHeadless(project, sessionDir, { reader, manager, general })
    if (!pty) throw new ModuleError('upstream', `could not start ${project}/${sessionDir}`)
    return { project, sessionDir }
  }

  const send = async (project: string, sessionDir: string, text: string): Promise<SendResult> => {
    const session = reader.getSession(project, sessionDir)
    if (session && session.harness !== 'claude') return 'unsupported'
    if (manager.typeLine(project, sessionDir, text)) return 'typed'
    if (!session) return 'unavailable'

    const key = `${project}::${sessionDir}`
    const pty = manager.getOrCreate(project, sessionDir, session, { isNew: false, headless: true })
    if (!pty) throw new ModuleError('unreachable', `could not resume ${key}`)
    const deadline = Date.now() + waitMs
    while (states?.snapshot()[key]?.state !== 'waiting') {
      if (Date.now() >= deadline) throw new ModuleError('unreachable', `${key} did not reach its prompt in ${Math.round(waitMs / 1000)} s`)
      await sleep(POLL_MS)
    }
    if (!manager.typeLine(project, sessionDir, text)) throw new ModuleError('unreachable', `${key} closed before it could be typed into`)
    return 'resumed'
  }

  return { start, send }
}

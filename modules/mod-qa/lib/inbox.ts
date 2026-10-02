import type { CheckStatus } from './decision.js'

/** What `/api/actions/:module/:action` answers: a run, or a refusal (`{ error }`). */
export type ActionResponse =
  | { exitCode: number; output: string; timedOut?: boolean }
  | { error: string }

export type GhResult<T> = { ok: true; data: T } | { ok: false; message: string }

/** Reads the JSON a `gh ... --json` action printed; any failure keeps gh's own words. */
export function readGh<T>(res: ActionResponse): GhResult<T> {
  const run = readGhRun(res)
  if (!run.ok) return run
  const output = run.data
  try {
    return { ok: true, data: JSON.parse(output) as T }
  } catch {
    return { ok: false, message: output || 'gh no devolvió JSON' }
  }
}

/** For actions that change something (`gh pr edit`, `gh pr comment`): exit 0 is success, the output is just text. */
export function readGhRun(res: ActionResponse): GhResult<string> {
  if ('error' in res) return { ok: false, message: res.error }
  const output = res.output.trim()
  if (res.timedOut) return { ok: false, message: 'gh no respondió a tiempo' }
  if (res.exitCode !== 0) return { ok: false, message: output || `gh terminó con código ${res.exitCode}` }
  return { ok: true, data: output }
}

export function timeAgo(iso: string, now = Date.now()): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const min = Math.floor((now - then) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.floor(h / 24)} d`
}

const MARKS: Record<CheckStatus, string> = { pass: '✓', fail: '✗', warn: '!' }

export function checkMark(status: CheckStatus): string {
  return MARKS[status]
}

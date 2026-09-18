import type { CWDoctor, CWDoctorCell, CWSession, UsageWindow } from '@forge-dev/core'
import type { UsageBar } from '@forge-dev/ui'

// avatar gradients, cycled per account
const AVATAR_PAIRS: Array<[string, string]> = [['--blue', '--purple'], ['--teal', '--blue'], ['--orange', '--red'], ['--green', '--teal']]
export const avatarPair = (index: number): [string, string] => AVATAR_PAIRS[index % AVATAR_PAIRS.length]

/* ── Type visual config ── */

export const soft = (token: string, pct = 18): string => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`

export interface TypeStyle {
  label: string
  glyph: string
  token: string
  ink: string
  fill: string
}

const typeStyle = (label: string, glyph: string, token: string): TypeStyle =>
  ({ label, glyph, token, ink: `var(${token})`, fill: soft(token) })

export const TYPE_STYLES: Record<string, TypeStyle> = {
  task: typeStyle('Dev', 'D', '--orange'),
  review: typeStyle('Review', 'R', '--blue'),
  loop: typeStyle('Loop', 'L', '--purple'),
  general: typeStyle('General', 'G', '--green'),
}

const OTHER_TYPES: Record<string, TypeStyle> = {
  create: typeStyle('Create', 'C', '--teal'),
  login: typeStyle('Login', 'A', '--ink-2'),
}

export const getTypeStyle = (type: string): TypeStyle =>
  TYPE_STYLES[type] ?? OTHER_TYPES[type] ?? TYPE_STYLES.task

/* ── Quick-launch types ── */

export type QuickType = 'dev' | 'review' | 'loop' | 'general'

// each quick type and the session type it starts
export const QUICK_TYPES: Array<{ key: QuickType; sessionType: CWSession['type'] }> = [
  { key: 'dev', sessionType: 'task' },
  { key: 'review', sessionType: 'review' },
  { key: 'loop', sessionType: 'loop' },
  { key: 'general', sessionType: 'general' },
]

export const quickLabel = (key: QuickType): string => TYPE_STYLES[QUICK_TYPES.find(t => t.key === key)?.sessionType ?? 'task'].label

export const sessionTypeOf = (key: QuickType): CWSession['type'] => QUICK_TYPES.find(t => t.key === key)?.sessionType ?? 'task'

/* ── Shared helpers ── */

export const sessionKey = (s: CWSession) =>
  s.sessionDir ? `${s.project}::${s.sessionDir}` : `${s.project}::${s.task ?? s.pr}`

// a general session outside any project carries CW's placeholder project name
export const projectOf = (s: Pick<CWSession, 'project'>): string => s.project === '__general' ? '' : s.project

export const sessionDirOf = (s: CWSession): string =>
  s.sessionDir ?? (s.type === 'review' ? `review-pr-${s.pr}` : s.type === 'loop' ? `loop-${s.task}` : `task-${s.task}`)

export const sessionLabel = (s: CWSession) =>
  s.type === 'review' ? `PR #${s.pr}`
  : s.type === 'general' ? `General (${s.account})`
  : s.type === 'create' ? `Create: ${s.task ?? 'project'}`
  : s.type === 'loop' ? `Loop: ${s.task ?? 'loop'}`
  : s.type === 'login' ? `Login: ${s.account} · ${getHarnessStyle(s.harness).label}`
  : (s.task ?? 'unknown')

// compact form for fixed-width columns
export const shortAgo = (date: string): string => {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`
}

/* ── Harness visual config ── */

export interface HarnessStyle {
  label: string
  color: string
  bg: string
}

const harnessStyle = (label: string, name: string): HarnessStyle =>
  ({ label, color: `var(--forge-harness-${name})`, bg: soft(`--forge-harness-${name}`) })

export const HARNESS_STYLES: Record<string, HarnessStyle> = {
  claude: harnessStyle('Claude Code', 'claude'),
  codex: harnessStyle('Codex', 'codex'),
  pi: harnessStyle('Pi', 'pi'),
  opencode: harnessStyle('OpenCode', 'opencode'),
}

export const getHarnessStyle = (harness?: string): HarnessStyle =>
  HARNESS_STYLES[harness ?? 'claude'] ?? { label: harness ?? 'claude', color: 'var(--ink-3)', bg: 'var(--elev)' }

export const harnessLabel = (s: Pick<CWSession, 'harness' | 'provider' | 'model'>): string => {
  const label = getHarnessStyle(s.harness).label
  return s.provider && s.provider !== 'native' ? `${label} · ${s.model || s.provider}` : label
}

export const CLAUDE_MODELS = [
  { id: '', label: 'Default', description: 'Recommended model' },
  { id: 'haiku', label: 'Haiku', description: 'Fast, simple tasks' },
  { id: 'sonnet', label: 'Sonnet', description: 'Daily coding' },
  { id: 'opus', label: 'Opus', description: 'Complex reasoning' },
]

// Same order CW uses for a new work, review, loop or create session
export const resolveHarness = (
  project: string | undefined,
  account: string,
  projects: Record<string, { harness?: string }>,
  doctor: CWDoctor,
): string =>
  (project ? projects[project]?.harness : undefined)
  ?? doctor.accounts.find(a => a.name === account)?.default_harness
  ?? 'claude'

export const findCell = (doctor: CWDoctor, account: string, harness: string): CWDoctorCell | undefined =>
  doctor.accounts.find(a => a.name === account)?.harnesses.find(h => h.harness === harness)

// Mirrors ACCOUNT_NAME_RE in @forge-dev/core, which the console does not import at runtime
export const ACCOUNT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

const RESET_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })

// a countdown while the window is close, a weekday once it is far enough away to be useless as one
export const formatReset = (iso: string | null, now = Date.now()): string | null => {
  if (!iso) return null
  const at = new Date(iso).getTime()
  if (!Number.isFinite(at)) return null
  const minutes = Math.round((at - now) / 60_000)
  if (minutes <= 0) return 'resets now'
  if (minutes < 60) return `resets in ${minutes} m`
  const hours = Math.floor(minutes / 60)
  // the reset instant jitters by fractions of a second, so a whole hour can arrive as 15:59:59.9
  if (hours >= 24) return `resets ${RESET_FORMAT.format(Math.round(at / 60_000) * 60_000)}`
  const rest = minutes % 60
  return `resets in ${hours} h${rest ? ` ${rest} m` : ''}`
}

export const usageBars = (windows: UsageWindow[]): UsageBar[] =>
  windows.map(w => ({ label: w.label, percent: w.percent, severity: w.severity, scope: w.scope, reset: formatReset(w.resetsAt) }))

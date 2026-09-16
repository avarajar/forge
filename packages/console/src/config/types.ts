import type { CWDoctor, CWDoctorCell, CWSession } from '@forge-dev/core'

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

export const QUICK_TYPES: Array<{ key: QuickType; label: string; style: TypeStyle }> = [
  { key: 'dev', label: 'Dev', style: TYPE_STYLES.task },
  { key: 'review', label: 'Review', style: TYPE_STYLES.review },
  { key: 'loop', label: 'Loop', style: TYPE_STYLES.loop },
  { key: 'general', label: 'General', style: TYPE_STYLES.general },
]

// the session type each quick type starts
export const QUICK_TO_SESSION: Record<QuickType, CWSession['type']> = { dev: 'task', review: 'review', loop: 'loop', general: 'general' }

/* ── Shared helpers ── */

export const sessionKey = (s: CWSession) =>
  s.sessionDir ? `${s.project}::${s.sessionDir}` : `${s.project}::${s.task ?? s.pr}`

export const sessionDirOf = (s: CWSession): string =>
  s.sessionDir ?? (s.type === 'review' ? `review-pr-${s.pr}` : s.type === 'loop' ? `loop-${s.task}` : `task-${s.task}`)

export const sessionLabel = (s: CWSession) =>
  s.type === 'review' ? `PR #${s.pr}`
  : s.type === 'general' ? `General (${s.account})`
  : s.type === 'create' ? `Create: ${s.task ?? 'project'}`
  : s.type === 'loop' ? `Loop: ${s.task ?? 'loop'}`
  : s.type === 'login' ? `Login: ${s.account} · ${getHarnessStyle(s.harness).label}`
  : (s.task ?? 'unknown')

export const timeAgo = (date: string): string => {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

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

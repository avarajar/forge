import type { CWDoctor, CWDoctorCell, CWSession } from '@forge-dev/core'

/* ── Type visual config ── */

export interface TypeStyle {
  label: string
  color: string
  bg: string
  border: string
  /** UnoCSS class for dot indicator */
  dotClass: string
  /** CSS var for tinted background */
  bgVar: string
  /** CSS var for tinted border */
  borderVar: string
}

export const TYPE_STYLES: Record<string, TypeStyle> = {
  task: {
    label: 'DEV',
    color: '#d97706',
    bg: 'rgba(217,119,6,0.10)',
    border: 'rgba(217,119,6,0.25)',
    dotClass: 'bg-amber-500',
    bgVar: 'var(--forge-tint-amber-bg)',
    borderVar: 'var(--forge-tint-amber-border)',
  },
  review: {
    label: 'REVIEW',
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.10)',
    border: 'rgba(37,99,235,0.25)',
    dotClass: 'bg-blue-500',
    bgVar: 'var(--forge-tint-blue-bg)',
    borderVar: 'var(--forge-tint-blue-border)',
  },
  design: {
    label: 'DESIGN',
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.10)',
    border: 'rgba(124,58,237,0.25)',
    dotClass: 'bg-purple-500',
    bgVar: 'var(--forge-tint-purple-bg)',
    borderVar: 'var(--forge-tint-purple-border)',
  },
  general: {
    label: 'GENERAL',
    color: '#059669',
    bg: 'rgba(5,150,105,0.10)',
    border: 'rgba(5,150,105,0.25)',
    dotClass: 'bg-emerald-500',
    bgVar: 'var(--forge-tint-emerald-bg)',
    borderVar: 'var(--forge-tint-emerald-border)',
  },
  loop: {
    label: 'LOOP',
    color: '#e11d48',
    bg: 'rgba(225,29,72,0.10)',
    border: 'rgba(225,29,72,0.25)',
    dotClass: 'bg-rose-500',
    bgVar: 'var(--forge-tint-rose-bg)',
    borderVar: 'var(--forge-tint-rose-border)',
  },
  login: {
    label: 'LOGIN',
    color: '#64748b',
    bg: 'rgba(100,116,139,0.10)',
    border: 'rgba(100,116,139,0.25)',
    dotClass: 'bg-slate-500',
    bgVar: 'var(--forge-ghost-bg)',
    borderVar: 'var(--forge-ghost-border)',
  },
}

export const getTypeStyle = (type: string): TypeStyle =>
  TYPE_STYLES[type] ?? TYPE_STYLES['task']

/* ── Quick-launch type pills ── */

export const QUICK_TYPES = [
  { key: 'dev',     label: 'Dev',     style: TYPE_STYLES['task'] },
  { key: 'review',  label: 'Review',  style: TYPE_STYLES['review'] },
  { key: 'loop',    label: 'Loop',    style: TYPE_STYLES['loop'] },
  { key: 'general', label: 'General', style: TYPE_STYLES['general'] },
]

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

/* ── Harness visual config ── */

export interface HarnessStyle {
  label: string
  color: string
  bg: string
}

export const HARNESS_STYLES: Record<string, HarnessStyle> = {
  claude: { label: 'Claude Code', color: 'var(--forge-harness-claude)', bg: 'var(--forge-harness-claude-bg)' },
  codex: { label: 'Codex', color: 'var(--forge-harness-codex)', bg: 'var(--forge-harness-codex-bg)' },
  pi: { label: 'Pi', color: 'var(--forge-harness-pi)', bg: 'var(--forge-harness-pi-bg)' },
  opencode: { label: 'OpenCode', color: 'var(--forge-harness-opencode)', bg: 'var(--forge-harness-opencode-bg)' },
}

export const getHarnessStyle = (harness?: string): HarnessStyle =>
  HARNESS_STYLES[harness ?? 'claude'] ?? { label: harness ?? 'claude', color: 'var(--forge-muted)', bg: 'var(--forge-ghost-bg)' }

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

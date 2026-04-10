import type { CWSession } from '@forge-dev/core'

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
  plan: {
    label: 'PLAN',
    color: '#0891b2',
    bg: 'rgba(8,145,178,0.10)',
    border: 'rgba(8,145,178,0.25)',
    dotClass: 'bg-cyan-500',
    bgVar: 'var(--forge-tint-cyan-bg)',
    borderVar: 'var(--forge-tint-cyan-border)',
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
}

export const getTypeStyle = (type: string): TypeStyle =>
  TYPE_STYLES[type] ?? TYPE_STYLES['task']

/* ── Quick-launch type pills ── */

export const QUICK_TYPES = [
  { key: 'dev',     label: 'Dev',     style: TYPE_STYLES['task'] },
  { key: 'review',  label: 'Review',  style: TYPE_STYLES['review'] },
  { key: 'design',  label: 'Design',  style: TYPE_STYLES['design'] },
  { key: 'plan',    label: 'Plan',    style: TYPE_STYLES['plan'] },
  { key: 'general', label: 'General', style: TYPE_STYLES['general'] },
]

/* ── Model defaults per task type ── */

export const MODEL_DEFAULTS: Record<string, string> = {
  dev: 'sonnet',
  review: 'sonnet',
  plan: 'opus',
  design: 'sonnet',
  general: 'sonnet',
  create: 'opus',
}

/* ── Shared helpers ── */

export const sessionKey = (s: CWSession) =>
  s.sessionDir ? `${s.project}::${s.sessionDir}` : `${s.project}::${s.task ?? s.pr}`

export const sessionLabel = (s: CWSession) =>
  s.type === 'review' ? `PR #${s.pr}`
  : s.type === 'general' ? `General (${s.account})`
  : s.type === 'create' ? `Create: ${s.task ?? 'project'}`
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

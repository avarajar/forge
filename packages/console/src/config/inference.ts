import type { QuickType } from './types.js'

export type Inference =
  | { kind: 'pr'; type: 'review' }
  | { kind: 'linear' | 'notion'; type: 'dev' }
  | { kind: 'name'; type: 'dev'; slug: string }

export const slugOf = (value: string): string => value.trim().replace(/\s+/g, '-').toLowerCase()

export function inferTask(value: string): Inference | null {
  const s = value.trim()
  if (!s) return null
  if (/github\.com\/.+\/pull\/\d+/.test(s) || /^#?\d{1,6}$/.test(s)) return { kind: 'pr', type: 'review' }
  if (/linear\.app/.test(s)) return { kind: 'linear', type: 'dev' }
  if (/notion\.(so|site)/.test(s)) return { kind: 'notion', type: 'dev' }
  return { kind: 'name', type: 'dev', slug: slugOf(s) }
}

export const EMPTY_HINT = 'A PR link becomes a review. A Linear or Notion link becomes a dev task with its notes.'

export interface StartContext { type: QuickType; project: string; account: string; harness: string }

// what Start will do, for the line under the start card and the drawer field
export function startSummary(value: string, ctx: StartContext): { text: string; ready: boolean } {
  const inf = inferTask(value)
  const on = ctx.project ? ` on ${ctx.project}` : ''
  if (ctx.type === 'general') {
    return { text: `General session as ${ctx.account || 'an account'}${ctx.project ? ` in ${ctx.project}` : ', outside any project'}, run by ${ctx.harness}.`, ready: Boolean(ctx.account) }
  }
  if (!ctx.project) return { text: 'Pick a project to start.', ready: false }
  if (!inf) return { text: EMPTY_HINT, ready: false }
  if (ctx.type === 'loop') return { text: `Loop${on} — pick its interval in the next step.`, ready: true }
  if (ctx.type === 'review') {
    return { text: inf.kind === 'pr' ? `Pull request detected — this becomes a review${on}, run by ${ctx.harness}.` : `Review of “${value.trim()}”${on}, run by ${ctx.harness}.`, ready: true }
  }
  switch (inf.kind) {
    case 'linear': return { text: 'Linear ticket detected — a dev task, and the ticket lands in TASK_NOTES.md first.', ready: true }
    case 'notion': return { text: 'Notion page detected — a dev task, and the page lands in TASK_NOTES.md first.', ready: true }
    case 'pr': return { text: `Dev task${on} from pull request ${value.trim()}, run by ${ctx.harness}.`, ready: true }
    case 'name': return { text: `Dev task${on} · branch task/${inf.slug}`, ready: true }
  }
}

// the type the user sees: a manual pick wins until the text changes
export const effectiveType = (value: string, override: QuickType | null): QuickType =>
  override ?? inferTask(value)?.type ?? 'dev'

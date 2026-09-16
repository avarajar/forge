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

export function inferenceText(inf: Inference, project: string, harness: string): string {
  switch (inf.kind) {
    case 'pr': return `Pull request detected — this becomes a review on ${project}, run by ${harness}.`
    case 'linear': return 'Linear ticket detected — a dev task, and the ticket lands in TASK_NOTES.md first.'
    case 'notion': return 'Notion page detected — a dev task, and the page lands in TASK_NOTES.md first.'
    case 'name': return `Dev task on ${project} · branch task/${inf.slug}`
  }
}

// the type the user sees: a manual pick wins until the text changes
export const effectiveType = (value: string, override: QuickType | null): QuickType =>
  override ?? inferTask(value)?.type ?? 'dev'

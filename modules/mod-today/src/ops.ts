import type { Item, Op } from './digest'

// shared by the server and the views, so it stays free of Node imports
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

// the op an item can take on its own, or null when it still needs the person
export function opFor(item: Item, project?: string): Exclude<Op, 'dismiss'> | null {
  if (item.kind === 'to-task') return item.targetSession ? 'send' : null
  if (item.kind === 'research') return 'research'
  return project ?? item.project ? 'start' : null
}

// one bounded line: collapsed whitespace, cut with an ellipsis past max
export function oneLine(text: string, max?: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return max && t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

// the link without its anchor when it is on a GitHub host, otherwise null
export function githubPage(link: string): string | null {
  let host = ''
  try {
    host = new URL(link).hostname.toLowerCase().replace(/\.+$/, '')
  } catch {
    return null
  }
  return host === 'github.com' || host.endsWith('.github.com') ? link.split('#')[0] : null
}

// a GitHub-only note is not a failed reading; anything else is
export const readingProblem = (error: string) => (error.startsWith('GitHub: ') ? error : `Last reading failed: ${error}`)

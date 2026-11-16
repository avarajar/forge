import type { Item, Op, Problem } from './digest'

// shared by the server and the views, so it stays free of Node imports
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

// kinds that start a CW task
const STARTS = ['issue', 'request', 'review']
export const startsTask = (kind: Item['kind']) => STARTS.includes(kind)

// the items an account owns, or all of them when none is given
export const inAccount = (items: Item[], account?: string): Item[] => (account ? items.filter(i => i.account === account) : items)

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

// project name to its account, for the projects that have one
export const ownersOf = (projects: { name: string; account?: string }[]): Record<string, string> =>
  Object.fromEntries(projects.flatMap(p => (p.account ? [[p.name, p.account]] : [])))

export interface ProjectList { names: string[]; owners: Record<string, string> }
export const EMPTY_PROJECTS: ProjectList = { names: [], owners: {} }

// the projects an item may start in: its account's and those with no account (all when it has none)
export function projectsFor({ names, owners }: ProjectList, account?: string): string[] {
  return account ? names.filter(n => !owners[n] || owners[n] === account) : names
}

// text that anyone could have written: read beside GitHub text or taken from GitHub, so it never starts on its own
export const untrusted = (i: Item): boolean => !!i.manual || i.source === 'github' || !!githubPage(i.link)

export const failedLine = (error: string) => `Last reading failed: ${error}`
export const loadFailedLine = (error: string) => `Can't load Today: ${error}`

// problems that did not fail the reading, on one line
export const notesLine = (notes: string[] | undefined) => (notes?.length ? notes.join(' · ') : null)

const SOURCE_NAME: Record<Problem['source'], string> = { slack: 'Slack', linear: 'Linear', reader: 'Reader' }

// an account's problems on one line, its reasons kept for the tooltip
export interface ProblemGroup { account: string; label: string; reasons: string[] }

// the sources that did not respond, in a fixed order
function sourcesLabel(sources: Problem['source'][]): string {
  const names = (['slack', 'linear', 'reader'] as const).filter(s => sources.includes(s)).map(s => SOURCE_NAME[s])
  return names.join(' and ')
}

export function groupProblems(problems: Problem[]): ProblemGroup[] {
  const accounts = [...new Set(problems.map(p => p.account))]
  return accounts.map(account => {
    const mine = problems.filter(p => p.account === account)
    return { account, label: sourcesLabel(mine.map(p => p.source)), reasons: mine.map(p => `${SOURCE_NAME[p.source]}: ${p.reason}`) }
  })
}

export const groupLine = (g: ProblemGroup) => `${g.account} · ${g.label} did not respond`

export const problemsLabel = (n: number) => `⚠ ${n} account problem${n === 1 ? '' : 's'}`

const GROUPS: { title: string; pick: (i: Item) => boolean }[] = [
  { title: 'In open tasks', pick: i => i.kind === 'to-task' },
  { title: 'New', pick: i => i.kind === 'issue' || i.kind === 'request' },
  { title: 'To review', pick: i => i.kind === 'review' },
  { title: 'Researching', pick: i => i.kind === 'research' },
]

// live items by kind, then the dismissed ones
export function sections(all: Item[]): { title: string; items: Item[] }[] {
  const live = all.filter(i => i.state !== 'dismissed')
  const groups = GROUPS.map(g => ({ title: g.title, items: live.filter(g.pick) }))
  return [...groups, { title: 'Dismissed', items: all.filter(i => i.state === 'dismissed') }].filter(g => g.items.length > 0)
}

// the accounts that appear in items, in order of first appearance
export const accountsOf = (items: Item[]): string[] => [...new Set(items.flatMap(i => (i.account ? [i.account] : [])))]

// the page's groups: one block per account (items without one last) when there is more than one
export function byAccount(items: Item[]): { account?: string; sections: ReturnType<typeof sections> }[] {
  const accounts = accountsOf(items)
  if (accounts.length < 2) return [{ sections: sections(items) }]
  const blocks = accounts.map(account => ({ account, sections: sections(inAccount(items, account)) }))
  const rest = items.filter(i => !i.account)
  return rest.length ? [...blocks, { sections: sections(rest) }] : blocks
}

// the accounts of a reading in flight, in order, with what each is doing
export function readingAccounts(accounts: Record<string, 'reading' | 'done' | 'problem'>): { account: string; state: 'reading' | 'done' | 'problem' }[] {
  return Object.entries(accounts).map(([account, state]) => ({ account, state }))
}

import type { Item, Op, PendingItem, Problem } from './digest'

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

const GH_SIGNED_OUT = 'GitHub: gh is not signed in (run gh auth login)'

// a known gh sign-in error in one short sentence; other notes as they are, none twice
export function tidyNotes(notes: string[]): string[] {
  return [...new Set(notes.map(n => (/^github\b[^:]*:/i.test(n) && /gh auth login|GH_TOKEN/i.test(n) ? GH_SIGNED_OUT : n)))]
}

// problems that did not fail the reading, on one line
export const notesLine = (notes: string[] | undefined) => (notes?.length ? tidyNotes(notes).join(' · ') : null)

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

// a title without the issue key the row already shows as a chip
export function titleFor(i: { title: string; issueKey?: string }): string {
  if (!i.issueKey) return i.title
  const key = i.issueKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rest = i.title.replace(new RegExp(`^\\s*\\[?${key}\\]?\\s*[:\\-–—]?\\s*`, 'i'), '')
  return rest.trim() ? rest : i.title
}

const SOURCE_NAMES = { linear: 'Linear', slack: 'Slack', github: 'GitHub' }

// who wrote it, or null when that is only the source's own name
export function whoOf(i: { who: string; source: Item['source'] }): string | null {
  const who = i.who.trim()
  return !who || who.toLowerCase() === SOURCE_NAMES[i.source].toLowerCase() ? null : who
}

export const CAPPED_NOTE = 'showing the latest 20'
export const GITHUB_SEARCH = 'https://github.com/pulls/review-requested'
export const PENDING_EMPTY = 'Nothing open — nice.'
export const FIRST_READING_NOTE = 'First reading — what you have open is under Pending.'

export type SourceName = Item['source']
export interface Filters { account: string; source: '' | SourceName; query: string }
export const NO_FILTERS: Filters = { account: '', source: '', query: '' }

const SOURCE_IDS: SourceName[] = ['linear', 'slack', 'github']

// the stored filters, tolerant of anything the browser kept before
export function parseFilters(raw: string | null | undefined): Filters {
  try {
    const v: unknown = JSON.parse(raw ?? '')
    if (!isRecord(v)) return NO_FILTERS
    return {
      account: typeof v.account === 'string' ? v.account : '',
      source: SOURCE_IDS.includes(v.source as SourceName) ? (v.source as SourceName) : '',
      query: typeof v.query === 'string' ? v.query : '',
    }
  } catch {
    return NO_FILTERS
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// what the search box looks at: title, key, who and where (a pull request's repository counts as where)
interface Searchable { title: string; issueKey?: string; who?: string; where?: string; repo?: string; account?: string; source: SourceName }

export function matchesQuery(x: Searchable, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [x.title, x.issueKey, x.who, x.where, x.repo].some(f => !!f && f.toLowerCase().includes(q))
}

// each part of the filter on its own, so the pills can count what a click would show
function passes(x: Searchable, f: Filters, skip?: 'account' | 'source'): boolean {
  return (skip === 'account' || !f.account || x.account === f.account) && (skip === 'source' || !f.source || x.source === f.source) && matchesQuery(x, f.query)
}

export const filterNews = (items: Item[], f: Filters): Item[] => items.filter(i => passes(i, f))
export const filterPending = (items: PendingItem[], f: Filters): PendingItem[] => items.filter(p => passes(p, f))

// news the page lists: everything but the dismissed, the ones still waiting first, then the latest first
export function newsList(items: Item[]): Item[] {
  const waiting = (i: Item) => (i.state === 'proposed' || i.state === 'failed' ? 0 : 1)
  return items.filter(i => i.state !== 'dismissed').sort((a, b) => waiting(a) - waiting(b) || Date.parse(b.when) - Date.parse(a.when))
}

export interface Counts { total: number; accounts: Record<string, number>; sources: Record<SourceName, number> }

// counts for the pills: each pill row counts under the other filter and the search
export function countFor(news: Item[], pending: PendingItem[], f: Filters): Counts {
  const all: Searchable[] = [...news, ...pending]
  const accounts: Record<string, number> = {}
  for (const x of all.filter(x => passes(x, f, 'account'))) if (x.account) accounts[x.account] = (accounts[x.account] ?? 0) + 1
  const sources: Record<SourceName, number> = { linear: 0, slack: 0, github: 0 }
  for (const x of all.filter(x => passes(x, f, 'source'))) sources[x.source]++
  return { total: all.filter(x => passes(x, { ...f, account: '', source: '' })).length, accounts, sources }
}

export interface PendingGroup { id: string; title: string; items: PendingItem[]; folded: boolean }

const PENDING_GROUPS: { id: string; title: string; pick: (p: PendingItem) => boolean; folded?: boolean }[] = [
  { id: 'ci', title: 'CI failing', pick: p => p.kind === 'ci' },
  { id: 'slack', title: 'Slack waiting on you', pick: p => p.kind === 'reply' },
  { id: 'review', title: 'Review requests', pick: p => p.kind === 'review' },
  { id: 'progress', title: 'Linear in progress', pick: p => p.source === 'linear' && !!p.started },
  { id: 'issues', title: 'Issues assigned', pick: p => p.source === 'github' && p.kind === 'issue' },
  { id: 'todo', title: 'Linear to do', pick: p => p.source === 'linear' && !p.started, folded: true },
]

// the non-empty pending groups in the page's order, each keeping the order it came in
export function groupPending(items: PendingItem[]): PendingGroup[] {
  return PENDING_GROUPS.map(g => ({ id: g.id, title: g.title, folded: !!g.folded, items: items.filter(g.pick) })).filter(g => g.items.length > 0)
}

// a group is folded unless the person opened it, or folded when the page would have it so
export const isGroupFolded = (g: { id: string; folded: boolean }, saved: Record<string, boolean>): boolean => saved[g.id] ?? g.folded

// "5 min", "3 h", "2 d": one short unit for a row
export function ageShort(iso: string, now = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000))
  if (Number.isNaN(min)) return ''
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  if (min < 48 * 60) return `${Math.round(min / 60)}h`
  return `${Math.round(min / 1440)}d`
}

// a link the page may open: http(s) only
export const safeHref = (link: string): string | undefined => (/^https?:\/\//i.test(link) ? link : undefined)

const isOpenNews = (i: Item) => i.state === 'proposed' || i.state === 'failed'

// the banner's one line: new items waiting, open work and what is urgent in it
export function bannerSummary(news: Item[], pending: PendingItem[]): { fresh: number; pending: number; ci: number; slack: number } {
  return { fresh: news.filter(isOpenNews).length, pending: pending.length, ci: pending.filter(p => p.kind === 'ci').length, slack: pending.filter(p => p.kind === 'reply').length }
}

export function summaryText(s: ReturnType<typeof bannerSummary>): string {
  const urgent = [s.ci ? `${s.ci} CI` : '', s.slack ? `${s.slack} Slack` : ''].filter(Boolean).join(' · ')
  return `${s.fresh} new · ${s.pending} pending${urgent ? ` (${urgent})` : ''}`
}

export type Urgent = { kind: 'pending'; item: PendingItem } | { kind: 'news'; item: Item }

// at most `max` rows for the banner: failing CI, then Slack waiting on you, then news that waits
export function urgentRows(news: Item[], pending: PendingItem[], max = 3): Urgent[] {
  const rows: Urgent[] = [
    ...pending.filter(p => p.kind === 'ci').map(item => ({ kind: 'pending' as const, item })),
    ...pending.filter(p => p.kind === 'reply').map(item => ({ kind: 'pending' as const, item })),
    ...newsList(news).filter(isOpenNews).map(item => ({ kind: 'news' as const, item })),
  ]
  return rows.slice(0, max)
}

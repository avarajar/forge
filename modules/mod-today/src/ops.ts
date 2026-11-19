import type { Item, Kind, Op, PendingItem, Problem } from './digest'

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
// the account filter value for items that have no account
export const NO_ACCOUNT = '__none__'

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
  return (skip === 'account' || !f.account || (f.account === NO_ACCOUNT ? !x.account : x.account === f.account)) && (skip === 'source' || !f.source || x.source === f.source) && matchesQuery(x, f.query)
}

export const filterNews = (items: Item[], f: Filters): Item[] => items.filter(i => passes(i, f))
export const filterPending = (items: PendingItem[], f: Filters): PendingItem[] => items.filter(p => passes(p, f))

// news the page lists: everything but the dismissed, the ones still waiting first, then the latest first
export function newsList(items: Item[]): Item[] {
  const waiting = (i: Item) => (i.state === 'proposed' || i.state === 'failed' ? 0 : 1)
  return items.filter(i => i.state !== 'dismissed').sort((a, b) => waiting(a) - waiting(b) || Date.parse(b.when) - Date.parse(a.when))
}

export interface Counts { total: number; accounts: Record<string, number>; noAccount: number; sources: Record<SourceName, number> }

// counts for the pills: each pill row counts under the other filter and the search
export function countFor(news: Item[], pending: PendingItem[], f: Filters): Counts {
  const all: Searchable[] = [...news, ...pending]
  const accounts: Record<string, number> = {}
  let noAccount = 0
  for (const x of all.filter(x => passes(x, f, 'account'))) {
    if (x.account) accounts[x.account] = (accounts[x.account] ?? 0) + 1
    else noAccount++
  }
  const sources: Record<SourceName, number> = { linear: 0, slack: 0, github: 0 }
  for (const x of all.filter(x => passes(x, f, 'source'))) sources[x.source]++
  // the account pills (with No account) add up to the same items as All
  return { total: all.filter(x => passes(x, f, 'account')).length, accounts, noAccount, sources }
}

export type Entry = { kind: 'news'; item: Item } | { kind: 'pending'; item: PendingItem }
export type GroupId = 'needs' | 'progress' | 'todo' | 'updates'
export interface InboxGroup { id: GroupId; title: string; entries: Entry[]; folded: boolean }

const GROUPS: { id: GroupId; title: string; folded?: boolean }[] = [
  { id: 'needs', title: 'Needs you' },
  { id: 'progress', title: 'In progress' },
  { id: 'todo', title: 'To do', folded: true },
  { id: 'updates', title: 'Updates' },
]

function groupOf(e: Entry): GroupId {
  if (e.kind === 'news') return e.item.state === 'proposed' || e.item.state === 'failed' ? 'needs' : 'updates'
  const p = e.item
  if (p.kind === 'ci' || p.kind === 'reply') return 'needs'
  return p.kind === 'review' || (p.source === 'linear' && p.started) ? 'progress' : 'todo'
}

// the non-empty inbox groups in order; pending comes before news inside a group, each keeping the order it came in
export function inboxGroups(news: Item[], pending: PendingItem[]): InboxGroup[] {
  const entries: Entry[] = [...pending.map(item => ({ kind: 'pending' as const, item })), ...news.map(item => ({ kind: 'news' as const, item }))]
  return GROUPS.map(g => ({ ...g, folded: !!g.folded, entries: entries.filter(e => groupOf(e) === g.id) })).filter(g => g.entries.length > 0)
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

// at most `max` rows for the banner: failing CI, then Slack waiting on you; when news waits, pending leaves room (two rows) so the newest news shows
export function urgentRows(news: Item[], pending: PendingItem[], max = 3): Urgent[] {
  const open = newsList(news).filter(isOpenNews)
  const urgent = [...pending.filter(p => p.kind === 'ci'), ...pending.filter(p => p.kind === 'reply')]
  const first = urgent.slice(0, open.length ? Math.max(1, max - 1) : max).map(item => ({ kind: 'pending' as const, item }))
  return [...first, ...open.slice(0, max - first.length).map(item => ({ kind: 'news' as const, item }))]
}

// the news a click on Accept would start or send: open items that have what they need
export const acceptable = (news: Item[]): Item[] => news.filter(i => i.state === 'proposed' && opFor(i))

// a Slack link is on slack.com or one of its subdomains, over http(s)
export function isSlackLink(link: string): boolean {
  try {
    const u = new URL(link)
    return (u.protocol === 'https:' || u.protocol === 'http:') && /(^|\.)slack\.com$/i.test(u.hostname)
  } catch {
    return false
  }
}

// the entries the list shows, top to bottom: folded groups stay out unless a search is on
export function visibleEntries(groups: InboxGroup[], folds: Record<string, boolean>, searching: boolean): Entry[] {
  return groups.filter(g => searching || !isGroupFolded(g, folds)).flatMap(g => g.entries)
}

// the first of Needs you, else the first listed
export function initialSelection(visible: Entry[]): string | null {
  return (visible.find(e => groupOf(e) === 'needs') ?? visible[0])?.item.id ?? null
}

// one step up or down the list, stopping at its ends
export function moveSelection(ids: string[], current: string | null, delta: 1 | -1): string | null {
  if (!ids.length) return null
  const at = current === null ? -1 : ids.indexOf(current)
  if (at < 0) return ids[0]
  return ids[Math.min(ids.length - 1, Math.max(0, at + delta))]
}

// new since the viewer's last visit; the first visit marks nothing
export function isUnread(when: string, lastSeen: number | null): boolean {
  const t = Date.parse(when)
  return lastSeen !== null && !Number.isNaN(t) && t > lastSeen
}

export function parseLastSeen(raw: string | null | undefined): number | null {
  const n = Number(raw)
  return raw && Number.isFinite(n) && n > 0 ? n : null
}

const VERBS: Record<Kind, string> = { 'to-task': 'Send', issue: 'Start', request: 'Start', research: 'Research', review: 'Review' }
export const verbFor = (kind: Kind): string => VERBS[kind]

// the main thing an entry offers: an action, or opening the task or session it already has
export interface Move { label: string; kind: 'op' | 'task' | 'session'; ready: boolean }

const isOpen = (i: Item) => i.state === 'proposed' || i.state === 'failed'

// whether the person must pick a project before it can start
export function needsProject(e: Entry): boolean {
  if (e.kind === 'news') return isOpen(e.item) && startsTask(e.item.kind) && !e.item.project
  return !e.item.targetSession && !e.item.project
}

export function moveFor(e: Entry, project?: string): Move | null {
  if (e.kind === 'pending') {
    const p = e.item
    if (p.targetSession) return { label: 'Open task', kind: 'task', ready: true }
    return { label: p.kind === 'review' ? 'Review' : 'Start', kind: 'op', ready: !!(p.project ?? project) }
  }
  const i = e.item
  if (isOpen(i)) return { label: i.state === 'failed' ? 'Retry' : verbFor(i.kind), kind: 'op', ready: !!opFor(i, project) }
  return i.state === 'done' && i.startedSession ? { label: 'Open session', kind: 'session', ready: true } : null
}

// a Slack message with no task yet can be researched
export const canResearch = (e: Entry): boolean => e.kind === 'pending' && e.item.kind === 'reply' && !e.item.targetSession

export const canHide = (e: Entry): boolean => e.kind === 'pending' || isOpen(e.item)

export type Command = 'next' | 'prev' | 'open' | 'start' | 'hide' | 'research' | 'search' | 'clear' | 'later' | 'close'

const INBOX_KEYS: Record<string, Command> = { arrowdown: 'next', j: 'next', arrowup: 'prev', k: 'prev', enter: 'open', s: 'start', h: 'hide', r: 'research', '/': 'search' }
const TRIAGE_KEYS: Record<string, Command> = { s: 'start', o: 'open', l: 'later', h: 'hide' }

// what a key press means: nothing with a modifier (⌘F or Ctrl+F searches), and only Escape while typing
export function keyCommand(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }, mode: 'inbox' | 'triage', typing: boolean): Command | null {
  const key = e.key.toLowerCase()
  if (mode === 'inbox' && key === 'f' && (e.metaKey || e.ctrlKey) && !e.altKey) return 'search'
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  if (key === 'escape') return mode === 'inbox' ? 'clear' : 'close'
  if (typing) return null
  return (mode === 'inbox' ? INBOX_KEYS : TRIAGE_KEYS)[key] ?? null
}

export type Decision = 'started' | 'hidden' | 'later'
export type Decisions = Record<string, Decision>

// the cards to deal: Needs you, then In progress, then To do when asked; Updates never
export function triageDeck(groups: InboxGroup[], withTodo: boolean): Entry[] {
  const ids: GroupId[] = withTodo ? ['needs', 'progress', 'todo'] : ['needs', 'progress']
  return ids.flatMap(id => groups.find(g => g.id === id)?.entries ?? [])
}

export const triageNext = (deck: Entry[], done: Decisions): Entry | null => deck.find(e => !done[e.item.id]) ?? null

// sorted counts every decision, so an item that left the list after it still counts
export function triageProgress(deck: Entry[], done: Decisions): { sorted: number; total: number } {
  const ids = new Set([...deck.map(e => e.item.id), ...Object.keys(done)])
  return { sorted: Object.keys(done).length, total: ids.size }
}

// what is left to decide in each group
export function triageCounts(groups: InboxGroup[], done: Decisions): { id: GroupId; title: string; left: number }[] {
  return groups.filter(g => g.id !== 'updates').map(g => ({ id: g.id, title: g.title, left: g.entries.filter(e => !done[e.item.id]).length }))
}

export function triageSummary(done: Decisions): Record<Decision, number> {
  const sum = { started: 0, hidden: 0, later: 0 }
  for (const d of Object.values(done)) sum[d]++
  return sum
}

const DECISIONS: Decision[] = ['started', 'hidden', 'later']

// the decisions stored for this date; another day starts clean
export function parseTriage(raw: string | null | undefined, date: string): Decisions {
  try {
    const v: unknown = JSON.parse(raw ?? '')
    if (!isRecord(v) || v.date !== date || !isRecord(v.done)) return {}
    return Object.fromEntries(Object.entries(v.done).filter(([, d]) => DECISIONS.includes(d as Decision))) as Decisions
  } catch {
    return {}
  }
}

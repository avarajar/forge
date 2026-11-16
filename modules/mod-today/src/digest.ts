import { createHash } from 'node:crypto'

export type Op = 'send' | 'start' | 'research' | 'dismiss'
export type Kind = 'to-task' | 'issue' | 'request' | 'research' | 'review'
type Ref = { project: string; sessionDir: string }

export interface Item {
  id: string
  source: 'linear' | 'slack' | 'github'
  // the CW account whose connectors read it; older digests have none
  account?: string
  kind: Kind
  title: string
  who: string
  where: string
  when: string
  quote?: string
  link: string
  issueKey?: string
  targetSession?: Ref
  project?: string
  state: 'proposed' | 'done' | 'dismissed' | 'failed'
  startedSession?: Ref
  error?: string
  // read alongside GitHub text, so it only starts on a click
  manual?: boolean
}

export interface Problem {
  account: string
  source: 'slack' | 'linear' | 'reader'
  reason: string
}

// the reading in flight, per account
export interface Reading {
  startedAt: string
  accounts: Record<string, 'reading' | 'done' | 'problem'>
}

export interface Digest {
  date: string
  readAt: string
  since: string
  items: Item[]
  error?: string
  // problems that did not fail the reading, such as GitHub being unreadable
  notes?: string[]
  // what an account's reader could not reach; older digests have none
  problems?: Problem[]
  // research sessions started on its own: per account, or one number in older digests
  autoStarted: number | Record<string, number>
}

const KINDS: Kind[] = ['to-task', 'issue', 'request', 'research', 'review']
const SOURCES = ['linear', 'slack', 'github']

// the same Linear or Slack link read by two accounts is two items
export function itemId(source: string, link: string, account?: string): string {
  const who = account && source !== 'github' ? `\n${account}` : ''
  return createHash('sha1').update(`${source}\n${link}${who}`).digest('hex').slice(0, 16)
}

export function startedBy(d: Digest, account = ''): number {
  return typeof d.autoStarted === 'number' ? d.autoStarted : d.autoStarted[account] ?? 0
}

export function countStart(d: Digest, account = ''): void {
  const was = startedBy(d, account)
  d.autoStarted = { ...(typeof d.autoStarted === 'number' ? {} : d.autoStarted), [account]: was + 1 }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function text(o: Record<string, unknown>, key: string, n: number, optional = false): string | undefined {
  const v = o[key]
  // an empty optional field is as good as a missing one
  if (v === undefined || v === null || (optional && typeof v === 'string' && !v.trim())) {
    if (optional) return undefined
    throw new Error(`item ${n}: missing ${key}`)
  }
  if (typeof v !== 'string' || !v.trim()) throw new Error(`item ${n}: ${key} must be a non-empty string`)
  return v
}

function extractJson(out: string): unknown {
  const start = out.indexOf('{')
  const end = out.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('reader output has no JSON object')
  try {
    return JSON.parse(out.slice(start, end + 1))
  } catch {
    throw new Error('reader output is not valid JSON')
  }
}

// what the reader could not reach in Slack or Linear (named anywhere in the line), bounded and one line each; a GitHub one is not a problem
export function parseReaderProblems(out: string): string[] {
  let root: unknown
  try {
    root = extractJson(out)
  } catch {
    return []
  }
  if (!isRecord(root) || !Array.isArray(root.problems)) return []
  return root.problems.filter((p): p is string => typeof p === 'string' && /\b(slack|linear)\b/i.test(p) && !/^\s*github/i.test(p)).slice(0, 5).map(p => p.replace(/\s+/g, ' ').trim().slice(0, 160))
}

// "<source>: <reason>" from the reader; anything else is the reader's own problem
export function toProblem(account: string, text: string): Problem {
  const m = /^(slack|linear|reader)\s*:\s*(.+)$/i.exec(text)
  if (m) return { account, source: m[1].toLowerCase() as Problem['source'], reason: m[2] }
  // a problem that names Slack or Linear elsewhere still belongs to that source
  const named = /\b(slack|linear)\b/i.exec(text)
  return { account, source: named ? (named[1].toLowerCase() as Problem['source']) : 'reader', reason: text }
}

export function parseReaderOutput(out: string, known: { projects: string[]; sessions: string[]; account?: string }): Item[] {
  const root = extractJson(out)
  if (!isRecord(root) || !Array.isArray(root.items)) throw new Error('reader output needs an items array')
  return root.items.map((raw, n) => {
    if (!isRecord(raw)) throw new Error(`item ${n}: not an object`)
    const source = text(raw, 'source', n)!
    if (!SOURCES.includes(source)) throw new Error(`item ${n}: unknown source ${source}`)
    const kind = text(raw, 'kind', n)!
    if (!KINDS.includes(kind as Kind)) throw new Error(`item ${n}: unknown kind ${kind}`)
    const link = text(raw, 'link', n)!
    let protocol = ''
    try {
      protocol = new URL(link).protocol
    } catch {
      // handled below
    }
    if (protocol !== 'http:' && protocol !== 'https:') throw new Error(`item ${n}: link must be an http(s) URL`)
    const when = text(raw, 'when', n)!
    if (Number.isNaN(Date.parse(when))) throw new Error(`item ${n}: when must be a date`)
    const item: Item = {
      id: itemId(source, link, known.account),
      source: source as Item['source'],
      kind: kind as Kind,
      title: text(raw, 'title', n)!,
      who: text(raw, 'who', n)!,
      where: text(raw, 'where', n)!,
      when,
      link,
      state: 'proposed',
    }
    if (known.account) item.account = known.account
    const quote = text(raw, 'quote', n, true)
    if (quote) item.quote = quote
    const issueKey = text(raw, 'issueKey', n, true)
    if (issueKey) item.issueKey = issueKey
    const project = text(raw, 'project', n, true)
    if (project && known.projects.includes(project)) item.project = project
    const t = raw.targetSession
    if (t !== undefined && t !== null) {
      if (!isRecord(t) || typeof t.project !== 'string' || typeof t.sessionDir !== 'string') throw new Error(`item ${n}: bad targetSession`)
      if (known.sessions.includes(`${t.project}::${t.sessionDir}`)) item.targetSession = { project: t.project, sessionDir: t.sessionDir }
    }
    if (item.kind === 'to-task' && !item.targetSession) item.kind = item.issueKey ? 'issue' : 'request'
    return item
  })
}

export function dedupe(items: Item[], handled: Record<string, string>): Item[] {
  return items.filter(i => {
    const seen = handled[i.id]
    return seen === undefined || Date.parse(i.when) > Date.parse(seen)
  })
}

function localDay(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function shouldRead(now: Date, time: string, lastReadAt?: string): boolean {
  if (!lastReadAt) return true
  const last = new Date(lastReadAt)
  if (Number.isNaN(last.getTime())) return true
  if (localDay(last) === localDay(now)) return false
  const [h, m] = time.split(':').map(Number)
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + (m || 0)
}

export function pendingCount(d: Digest): number {
  return d.items.filter(i => i.state === 'proposed').length
}

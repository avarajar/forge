import { createHash } from 'node:crypto'

export type Kind = 'to-task' | 'issue' | 'request' | 'research'
type Ref = { project: string; sessionDir: string }

export interface Item {
  id: string
  source: 'linear' | 'slack'
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
}

export interface Digest {
  date: string
  readAt: string
  since: string
  items: Item[]
  error?: string
  autoStarted: number
}

const KINDS: Kind[] = ['to-task', 'issue', 'request', 'research']
const SOURCES = ['linear', 'slack']

export function itemId(source: string, link: string): string {
  return createHash('sha1').update(`${source}\n${link}`).digest('hex').slice(0, 16)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function text(o: Record<string, unknown>, key: string, n: number, optional = false): string | undefined {
  const v = o[key]
  if (v === undefined || v === null) {
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

export function parseReaderOutput(out: string, known: { projects: string[]; sessions: string[] }): Item[] {
  const root = extractJson(out)
  if (!isRecord(root) || !Array.isArray(root.items)) throw new Error('reader output needs an items array')
  return root.items.map((raw, n) => {
    if (!isRecord(raw)) throw new Error(`item ${n}: not an object`)
    const source = text(raw, 'source', n)!
    if (!SOURCES.includes(source)) throw new Error(`item ${n}: unknown source ${source}`)
    const kind = text(raw, 'kind', n)!
    if (!KINDS.includes(kind as Kind)) throw new Error(`item ${n}: unknown kind ${kind}`)
    const link = text(raw, 'link', n)!
    const item: Item = {
      id: itemId(source, link),
      source: source as Item['source'],
      kind: kind as Kind,
      title: text(raw, 'title', n)!,
      who: text(raw, 'who', n)!,
      where: text(raw, 'where', n)!,
      when: text(raw, 'when', n)!,
      link,
      state: 'proposed',
    }
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

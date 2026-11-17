import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren, FunctionComponent } from 'preact'
import { showToast } from '@forge-dev/ui'
import type { PanelClient } from '@forge-dev/sdk'
import type { Digest, Item, Kind, Op, PendingItem, Reading } from './digest'
import { ageShort, EMPTY_PROJECTS, errorMessage, groupLine, NO_FILTERS, opFor, parseFilters, parseLastSeen, parseTriage, projectsFor, safeHref, startsTask, tidyNotes, titleFor, verbFor, whoOf, type Decision, type Decisions, type Filters, type ProblemGroup, type ProjectList } from './ops'

// each action answers whether it ran, so a caller can tell a failure from a success
export type OnAct = (item: Item, op: Op, project?: string) => Promise<boolean>
export interface Acting { busy: boolean; refreshing: boolean; retrying: string | null; retry: (account: string) => Promise<void>; reconnect: (account: string) => Promise<boolean>; run: (fn: () => Promise<unknown>) => Promise<boolean>; act: OnAct; refresh: () => Promise<void>; startPending: (item: PendingItem, project?: string) => Promise<boolean>; researchPending: (item: PendingItem) => Promise<boolean>; hidePending: (item: PendingItem) => Promise<boolean> }

export interface DigestReply { digest: Digest | null; folded: boolean; enabled: boolean; reading?: Reading; pending?: PendingItem[]; pendingCapped?: boolean; firstReading?: boolean }

export const soft = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`
const AVATARS = ['--blue', '--purple', '--orange', '--green', '--teal', '--red']
const ACCOUNT_TOKENS = ['--blue', '--purple', '--orange', '--green', '--teal']

// a stable token per account name
export function accountToken(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ACCOUNT_TOKENS[h % ACCOUNT_TOKENS.length]
}

export function AccountChip({ account }: { account: string }) {
  const token = accountToken(account)
  return (
    <span title={`Account ${account}`} style={{ fontSize: '10.5px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', whiteSpace: 'nowrap', color: `var(${token})`, background: soft(token, 15) }}>{account}</span>
  )
}

const FILTERS_KEY = 'today.filters'
const FOLDS_KEY = 'today.folds'
const LAST_SEEN_KEY = 'today.lastSeen'
const TRIAGE_KEY = 'today.triage'
const START_DAY_KEY = 'today.startDay'

// a value kept in this viewer's browser; storage can be missing or throw, then it lasts until the page closes
function useStored<T>(key: string, read: (raw: string | null) => T, empty: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return read(localStorage.getItem(key))
    } catch {
      return empty
    }
  })
  const set = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // the choice then lasts until the page closes
    }
  }
  return [value, set]
}

// the account, source and search this viewer looks at
export const useFilters = (): [Filters, (next: Filters) => void] => useStored(FILTERS_KEY, parseFilters, NO_FILTERS)

// which pending groups the viewer folded (true) or opened (false)
export function useFolds(): [Record<string, boolean>, (id: string, folded: boolean) => void] {
  const [folds, set] = useStored<Record<string, boolean>>(FOLDS_KEY, raw => {
    const v: unknown = JSON.parse(raw ?? '{}')
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, f]) => typeof f === 'boolean')) as Record<string, boolean> : {}
  }, {})
  return [folds, (id, folded) => set({ ...folds, [id]: folded })]
}

// when this viewer last opened Today, read once; opening it now makes everything up to now seen for the next visit
export function useLastSeen(): number | null {
  const [seen] = useState<number | null>(() => {
    try {
      return parseLastSeen(localStorage.getItem(LAST_SEEN_KEY))
    } catch {
      return null
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(LAST_SEEN_KEY, String(Date.now()))
    } catch {
      // the dots then show against the first visit
    }
  }, [])
  return seen
}

// the triage decisions of one day, kept per viewer
export function useTriage(date: string | undefined): [Decisions, (id: string, d: Decision) => void, () => void] {
  const [stored, setStored] = useState<{ date: string; done: Decisions } | null>(null)
  const day = date ?? ''
  let current: Decisions = {}
  if (stored?.date === day) current = stored.done
  else {
    try {
      current = parseTriage(localStorage.getItem(TRIAGE_KEY), day)
    } catch {
      // nothing was kept
    }
  }
  const save = (done: Decisions) => {
    setStored({ date: day, done })
    try {
      localStorage.setItem(TRIAGE_KEY, JSON.stringify({ date: day, done }))
    } catch {
      // the day's decisions last until the page closes
    }
  }
  return [current, (id, d) => save({ ...current, [id]: d }), () => save({})]
}

// the banner asks the page to open the triage: a one-time flag in this browser
export function requestStartDay() {
  try {
    localStorage.setItem(START_DAY_KEY, '1')
  } catch {
    // the page then opens without it
  }
}

export function takeStartDay(): boolean {
  try {
    const on = localStorage.getItem(START_DAY_KEY) === '1'
    if (on) localStorage.removeItem(START_DAY_KEY)
    return on
  } catch {
    return false
  }
}

// loads the digest now, every 3 s while a reading runs and every minute otherwise; `path` picks a day
export function useDigest(forge: PanelClient, path = '/digest') {
  const [reply, setReply] = useState<DigestReply | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hurried, hurry] = useState(false)
  const latest = useRef(0)
  const load = useCallback(async () => {
    const mine = ++latest.current
    try {
      const next = await forge.route<DigestReply>(path)
      if (mine !== latest.current) return
      setReply(next)
      setError(null)
    } catch (e) {
      if (mine === latest.current) setError(errorMessage(e))
    }
  }, [forge, path])
  const fast = hurried || !!reply?.reading
  useEffect(() => {
    void load()
    const poll = () => { if (!document.hidden) void load() }
    const t = setInterval(poll, fast ? 3_000 : 60_000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [load, fast])
  return { reply, error, reload: load, hurry }
}

export function useProjects(forge: PanelClient): ProjectList {
  const [projects, setProjects] = useState<ProjectList>(EMPTY_PROJECTS)
  useEffect(() => {
    forge.route<{ projects: string[]; owners?: Record<string, string> }>('/projects').then(r => setProjects({ names: r.projects, owners: r.owners ?? {} }), () => {})
  }, [forge])
  return projects
}

// one acting state per digest: every action button waits while any action runs; a reading only blocks another reading
export function useActing(forge: PanelClient, date: string | undefined, reload: () => Promise<void>, hurry: (on: boolean) => void = () => {}): Acting {
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [retrying, setRetrying] = useState<string | null>(null)
  const reading = useRef(false)
  // runs fn, tells the person when it fails, and loads what it changed
  const guarded = async (fn: () => Promise<unknown>): Promise<boolean> => {
    let ok = true
    try {
      await fn()
    } catch (e) {
      ok = false
      showToast(errorMessage(e), 'error')
    }
    await reload()
    return ok
  }
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    const ok = await guarded(fn)
    setBusy(false)
    return ok
  }
  const act: OnAct = (item, op, project) => run(async () => {
    if (date) await forge.action(op, { date, id: item.id, ...(project ? { project } : {}) })
  })
  const startPending = (item: PendingItem, project?: string) => run(async () => {
    await forge.action('pending-start', { id: item.id, ...(project ? { project } : {}) })
  })
  const researchPending = (item: PendingItem) => run(async () => {
    await forge.action('pending-research', { id: item.id })
  })
  const hidePending = (item: PendingItem) => run(async () => {
    await forge.action('pending-hide', { id: item.id })
  })
  const refresh = async () => {
    if (reading.current) return
    reading.current = true
    setRefreshing(true)
    hurry(true)
    await guarded(() => forge.action('refresh'))
    hurry(false)
    reading.current = false
    setRefreshing(false)
  }
  const retry = async (account: string) => {
    if (busy) return
    setBusy(true)
    setRetrying(account)
    hurry(true)
    await guarded(() => forge.action('retry-account', { account }))
    hurry(false)
    setRetrying(null)
    setBusy(false)
  }
  // opens the account's Claude Code at /mcp
  const reconnect = (account: string) => run(async () => {
    const s = await forge.action<{ project: string; sessionDir: string }>('reconnect', { account })
    if (s) forge.openSession(s.project, s.sessionDir)
  })
  return { busy, refreshing, retrying, retry, reconnect, run, act, refresh, startPending, researchPending, hidePending }
}

function dayOf(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const isToday = (date: string, now: Date) => dayOf(date).toDateString() === now.toDateString()

// a greeting for today's digest, the digest's own day for an older one
export function dayLabel(now: Date, date: string): string {
  const day = dayOf(date)
  if (!isToday(date, now)) return `From ${day.toLocaleDateString('en-US', { weekday: 'long' })} ${day.getDate()}`
  const hour = now.getHours()
  const part = hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening'
  return `${part} · your ${now.toLocaleDateString('en-US', { weekday: 'long' })} ${now.getDate()}`
}

// the short name of a digest's day for one-line states
export const shortDay = (now: Date, date?: string) => (!date || isToday(date, now) ? 'Today' : dayLabel(now, date))

// folded when the person folded it or nothing is left for them to decide
export function foldedNow(folded: boolean, items: Item[]): boolean {
  return folded || !items.some(i => i.state === 'proposed' || i.state === 'failed')
}

export const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

// a time as the reading's window names it: the clock, "yesterday 1:05 PM" or "Nov 12 1:05 PM"
function windowTime(at: Date, read: Date): string {
  if (at.toDateString() === read.toDateString()) return clock(at)
  const yesterday = new Date(read.getTime() - 86_400_000).toDateString() === at.toDateString()
  return `${yesterday ? 'yesterday' : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${clock(at)}`
}

export function readLine(d: Digest): string {
  const read = new Date(d.readAt)
  return `Read at ${clock(read)} · changes since ${windowTime(new Date(d.windowStart ?? d.since), read)}`
}

// the day as the picker shows it: "Monday 16"
export function dayName(date: string): string {
  const day = dayOf(date)
  return `${day.toLocaleDateString('en-US', { weekday: 'long' })} ${day.getDate()}`
}

export function ago(iso: string, now = new Date()): string {
  const t = new Date(iso)
  const min = Math.round((now.getTime() - t.getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + clock(t)
}

const SOURCE_LABEL: Record<Item['source'], string> = { linear: 'Linear', slack: 'Slack', github: 'GitHub' }
const SOURCE_TINT: Record<Item['source'], string> = { linear: '#5e6ad2 22%', slack: '#e01e5a 18%', github: '#8b949e 24%' }

export function SourceIcon({ source }: { source: Item['source'] }) {
  return (
    <div title={SOURCE_LABEL[source]} style={{ width: '22px', height: '22px', borderRadius: '6px', display: 'grid', placeItems: 'center', flexShrink: 0, background: `color-mix(in srgb, ${SOURCE_TINT[source]}, transparent)` }}>
      {source === 'github' ? (
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" style={{ color: 'var(--ink)' }} d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
      ) : source === 'linear' ? (
        <svg width="12" height="12" viewBox="0 0 100 100" aria-hidden="true"><path fill="#8c94f0" d="M1.2 61.5 38.5 98.8C19.8 95.6 4.4 80.2 1.2 61.5zM0 46.9 53.1 100c3.4-.2 6.8-.8 10-1.6L1.6 36.9C.8 40.1.2 43.5 0 46.9zM4.9 27 73 95.1c2.6-1.1 5.1-2.5 7.4-4L8.9 19.6c-1.5 2.3-2.9 4.8-4 7.4zM14.4 13.8C23.4 5.3 35.5 0 48.9 0 76 0 100 24 100 51.1c0 13.4-5.3 25.5-13.8 34.5z" /></svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke-width="2.6" stroke-linecap="round"><path stroke="#36c5f0" d="M9 3.5v6" /><path stroke="#2eb67d" d="M20.5 9h-6" /><path stroke="#ecb22e" d="M15 20.5v-6" /><path stroke="#e01e5a" d="M3.5 15h6" /></g></svg>
      )}
    </div>
  )
}

const KIND: Record<Kind, { label: string; token: string }> = {
  'to-task': { label: 'Send to the task', token: '--orange' },
  issue: { label: 'New task', token: '--green' },
  request: { label: 'New task', token: '--green' },
  research: { label: 'Research', token: '--purple' },
  review: { label: 'Review', token: '--blue' },
}

export function KindPill({ kind }: { kind: Kind }) {
  const k = KIND[kind]
  return (
    <span style={{ fontSize: '10.5px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', whiteSpace: 'nowrap', color: `var(${k.token})`, background: soft(k.token, 15) }}>{k.label}</span>
  )
}

export function Avatar({ who }: { who: string }) {
  const initials = who.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?'
  let h = 0
  for (const c of who) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span style={{ width: '16px', height: '16px', borderRadius: '50%', display: 'inline-grid', placeItems: 'center', fontSize: '8.5px', fontWeight: 700, color: '#fff', background: `var(${AVATARS[h % AVATARS.length]})` }}>{initials}</span>
  )
}

export const Sep = () => <span style={{ color: 'var(--ink-3)' }}>·</span>
export const strong = (t: string) => <b style={{ color: 'var(--ink)', fontWeight: 550 }}>{t}</b>

export function LiveChip({ label }: { label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--teal)' }}>
      <i style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--teal)', boxShadow: `0 0 0 3px ${soft('--teal', 25)}` }} />
      {label}
    </span>
  )
}

const buttonStyle = { font: 'inherit', fontSize: '12px', fontWeight: 550, borderRadius: '8px', padding: '5px 11px', border: '1px solid var(--hair-2)', background: 'var(--card-2, var(--elev))', color: 'var(--ink)', cursor: 'pointer', whiteSpace: 'nowrap' as const }
export const ghostStyle = { ...buttonStyle, border: '1px solid transparent', background: 'transparent', color: 'var(--ink-2)' }
export const primaryStyle = { ...buttonStyle, background: 'var(--blue)', borderColor: 'transparent', color: '#fff', boxShadow: `0 2px 8px ${soft('--blue', 35)}` }

export const Btn: FunctionComponent<{ label: string; style?: Record<string, string | number>; disabled?: boolean; title?: string; onClick: () => void }> = ({ label, style = buttonStyle, disabled, title, onClick }) => (
  <button type="button" title={title} disabled={disabled} style={{ ...style, opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer', transition: 'opacity .2s var(--ease)' }} onClick={onClick}>{label}</button>
)

export function ProjectPicker({ projects, value, onChange }: { projects: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Project" value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)} style={{ font: 'inherit', fontSize: '12px', padding: '4px 6px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--card)', color: 'var(--ink)' }}>
      <option value="">Project…</option>
      {projects.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  )
}

export function outcome(item: Item): ComponentChildren {
  const s = item.startedSession
  const where = s ? `${s.project} / ${s.sessionDir}` : ''
  if (item.kind === 'research') return <LiveChip label={`Researching${where ? ` · ${where}` : ''}`} />
  if (item.kind === 'to-task') return <span style={{ fontSize: '11.5px', color: 'var(--green)' }}>Sent</span>
  return <span style={{ fontSize: '11.5px', color: 'var(--green)' }}>Started{where ? ` · ${where}` : ''}</span>
}

export const sourceOf = (p: { source: Item['source'] }) => SOURCE_LABEL[p.source]
const mono = { fontFamily: 'var(--mono, ui-monospace, monospace)', fontSize: '11.5px', color: 'var(--ink-2)', fontWeight: 500 }

// a one-line row: icon, key, title, account, age and the primary button; a click opens the rest
function Line({ source, keyText, title, account, when, primary, children, dim }: { source: Item['source']; keyText?: string; title: string; account?: string; when: string; primary: ComponentChildren; children: ComponentChildren; dim?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius: '9px', background: open ? soft('--ink', 3) : 'transparent', border: `1px solid ${open ? 'var(--hair)' : 'transparent'}`, opacity: dim ? 0.55 : 1, transition: 'background .2s var(--ease)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px', minHeight: '30px' }}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', font: 'inherit', fontSize: '12.5px', textAlign: 'left', padding: 0, border: 0, background: 'none', color: 'var(--ink)', cursor: 'pointer' }}>
          <SourceIcon source={source} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 530 }}>{title}</span>
          {keyText && <span style={{ ...mono, flexShrink: 0, marginLeft: 'auto' }}>{keyText}</span>}
        </button>
        {account && <span style={{ flexShrink: 0 }}><AccountChip account={account} /></span>}
        <span title={when} style={{ fontSize: '11px', color: 'var(--ink-3)', minWidth: '26px', textAlign: 'right' }}>{ageShort(when)}</span>
        {primary && <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>{primary}</span>}
      </div>
      {open && <div style={{ padding: '2px 8px 9px 36px', display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '11.5px', color: 'var(--ink-2)' }}>{children}</div>}
    </div>
  )
}

export const Quote = ({ text }: { text: string }) => <div style={{ fontSize: '12px', borderLeft: '2px solid var(--hair-2)', paddingLeft: '8px', fontStyle: 'italic' }}>“{text}”</div>

export function OpenLink({ href, label }: { href: string; label: string }) {
  const safe = safeHref(href)
  return safe ? <a href={safe} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-2)', textDecoration: 'none', borderBottom: '1px dotted var(--ink-3)' }}>{label} ↗</a> : null
}

const Actions = ({ children }: { children: ComponentChildren }) => <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{children}</div>

export const Row: FunctionComponent<{ item: Item; projects?: ProjectList; acting: Acting; forge: PanelClient }> = ({ item, projects = EMPTY_PROJECTS, acting, forge }) => {
  const [project, setProject] = useState(item.project ?? '')
  const open = item.state === 'proposed' || item.state === 'failed'
  const needsProject = startsTask(item.kind) && !item.project
  const op = opFor(item, project)
  const where = item.source === 'slack' ? 'in' : 'on'
  const s = item.startedSession
  const go = <Btn label={item.state === 'failed' ? 'Retry' : verbFor(item.kind)} disabled={acting.busy || !op} onClick={() => op && acting.act(item, op, needsProject ? project : undefined)} />
  // a task that needs a project is started from the opened row
  const primary = open ? (needsProject ? null : go) : item.state === 'done' ? (
    s ? <Btn label="Open session" onClick={() => forge.openSession(s.project, s.sessionDir)} /> : <span style={{ fontSize: '11.5px', color: 'var(--green)' }}>{item.kind === 'to-task' ? 'Sent' : 'Done'}</span>
  ) : null
  return (
    <Line source={item.source} keyText={item.issueKey} title={titleFor(item)} account={item.account} when={item.when} primary={primary}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <KindPill kind={item.kind} />
        {whoOf(item) && <Avatar who={item.who} />}
        <span>{whoOf(item) ? <>{item.who} {where} {strong(item.where)}</> : strong(item.where)}</span>
        {item.kind === 'to-task' && item.targetSession && <><Sep /><span>goes to {strong(item.targetSession.sessionDir)}</span></>}
        {item.project && item.kind !== 'to-task' && <><Sep /><span>project {strong(item.project)}</span></>}
      </div>
      {item.quote && <Quote text={item.quote} />}
      {item.error && <div style={{ color: 'var(--red)' }}>{item.error}</div>}
      {item.state === 'done' && outcome(item)}
      <Actions>
        {open && needsProject && <><ProjectPicker projects={projectsFor(projects, item.account)} value={project} onChange={setProject} />{go}</>}
        <OpenLink href={item.link} label={`Open in ${sourceOf(item)}`} />
        {open && <Btn label="Dismiss" style={ghostStyle} disabled={acting.busy} onClick={() => acting.act(item, 'dismiss')} />}
      </Actions>
    </Line>
  )
}

export const PENDING_TOKEN: Record<PendingItem['kind'], string> = { ci: '--red', review: '--blue', issue: '--green', reply: '--purple' }

// one open item: Open task or Start as the primary button; Hide, Research and the link when it is opened
export const PendingRow: FunctionComponent<{ item: PendingItem; projects?: ProjectList; acting: Acting; forge: PanelClient }> = ({ item, projects = EMPTY_PROJECTS, acting, forge }) => {
  const [project, setProject] = useState(item.project ?? '')
  const token = PENDING_TOKEN[item.kind]
  const target = item.project ?? project
  const slack = item.kind === 'reply'
  const start = <Btn label={item.kind === 'review' ? 'Review' : 'Start'} disabled={acting.busy || !target} onClick={() => acting.startPending(item, item.project ? undefined : project)} />
  // a task that needs a project is started from the opened row
  const primary = item.targetSession ? (
    <Btn label="Open task" onClick={() => forge.openSession(item.targetSession!.project, item.targetSession!.sessionDir)} />
  ) : item.project ? start : null
  return (
    <Line source={item.source} keyText={item.issueKey} title={titleFor(item)} account={item.account} when={item.when} primary={primary}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10.5px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', whiteSpace: 'nowrap', color: `var(${token})`, background: soft(token, 15) }}>{slack ? 'Waiting on you' : item.kind === 'ci' ? 'CI failing' : item.kind === 'review' ? 'Review requested' : item.state}</span>
        {slack ? <span>{item.who} in {strong(item.where ?? '')}</span> : <span>{item.repo ? strong(item.repo) : null}{item.repo && item.state ? ' · ' : ''}{item.state}</span>}
        {item.project && <><Sep /><span>project {strong(item.project)}</span></>}
      </div>
      {item.quote && <Quote text={item.quote} />}
      <Actions>
        {!item.targetSession && !item.project && <><ProjectPicker projects={projectsFor(projects, item.account)} value={project} onChange={setProject} />{start}</>}
        <OpenLink href={item.link} label={`Open in ${sourceOf(item)}`} />
        {slack && !item.targetSession && <Btn label="Research" style={ghostStyle} disabled={acting.busy} onClick={() => acting.researchPending(item)} />}
        <Btn label="Hide" style={ghostStyle} disabled={acting.busy} onClick={() => acting.hidePending(item)} />
      </Actions>
    </Line>
  )
}

// a filter pill with its count
export function Pill({ label, n, on, token, onClick }: { label: string; n: number; on: boolean; token?: string; onClick: () => void }) {
  const tint = token ?? '--blue'
  return (
    <button type="button" aria-pressed={on} onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', font: 'inherit', fontSize: '11.5px', cursor: 'pointer', padding: '3px 9px', borderRadius: '20px', color: on ? 'var(--ink)' : 'var(--ink-2)', border: `1px solid ${on ? `var(${tint})` : 'var(--hair)'}`, background: on ? soft(tint, 15) : 'var(--elev)' }}>
      {token && <i style={{ width: '7px', height: '7px', borderRadius: '50%', background: `var(${token})` }} />}
      {label} · {n}
    </button>
  )
}

// keyframes for the reading line and skeleton, off for people who ask for less motion
const READING_CSS = `
@keyframes today-spin { to { transform: rotate(360deg) } }
@keyframes today-pulse { 0%, 100% { opacity: .55 } 50% { opacity: 1 } }
.today-spin { animation: today-spin .8s linear infinite }
.today-pulse { animation: today-pulse 1.4s ease-in-out infinite }
.today-inbox { display: grid; grid-template-columns: 340px minmax(0, 1fr); height: calc(100vh - 250px); min-height: 440px; border: 1px solid var(--hair); border-radius: 12px; overflow: hidden }
.today-list { display: flex; flex-direction: column; min-height: 0; background: var(--card); border-right: 1px solid var(--hair) }
.today-detail { overflow-y: auto; min-width: 0; background: var(--elev) }
.today-back { display: none }
@media (max-width: 900px) {
  .today-inbox { grid-template-columns: minmax(0, 1fr) }
  .today-list { border-right: 0 }
  .today-inbox[data-open="true"] .today-list, .today-inbox[data-open="false"] .today-detail { display: none }
  .today-back { display: inline-block }
}
@keyframes today-slide { from { opacity: 0; transform: translateX(28px) } to { opacity: 1; transform: none } }
.today-slide { animation: today-slide .22s var(--ease) }
@media (prefers-reduced-motion: reduce) { .today-spin, .today-pulse, .today-slide { animation: none } }`

// the keyframes go into the page once, however many components use them
export function useReadingStyles() {
  if (typeof document !== 'undefined' && !document.getElementById('today-reading-css')) {
    const el = document.createElement('style')
    el.id = 'today-reading-css'
    el.textContent = READING_CSS
    document.head.appendChild(el)
  }
}

function Spinner() {
  return <i class="today-spin" style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', border: '2px solid var(--hair-2)', borderTopColor: 'var(--blue)', boxSizing: 'border-box' }} />
}

// "Reading monoku · meridian…" with a mark per account: spinner, done or problem
export function ReadingLine({ reading }: { reading: Reading | undefined }) {
  useReadingStyles()
  const accounts = Object.entries(reading?.accounts ?? {})
  return (
    <span role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ink-2)', flexWrap: 'wrap' }}>
      <b class="today-pulse" style={{ fontWeight: 600, color: 'var(--ink)' }}>{accounts.length ? 'Reading' : 'Reading…'}</b>
      {accounts.map(([account, state], n) => (
        <span key={account} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          {n > 0 && <span style={{ color: 'var(--ink-3)' }}>·</span>}
          {state === 'reading' ? <Spinner /> : state === 'done' ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--orange)' }}>⚠</span>}
          {account}
        </span>
      ))}
      {accounts.length > 0 && <span>…</span>}
    </span>
  )
}

// soft pulsing blocks shaped like item rows, for a first reading
export function SkeletonRows() {
  useReadingStyles()
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {[0, 1, 2].map(n => (
        <div key={n} class="today-pulse" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--elev)', border: '1px solid var(--hair)', animationDelay: `${n * 0.15}s` }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--hair)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ height: '9px', width: `${70 - n * 12}%`, borderRadius: '5px', background: 'var(--hair)' }} />
            <div style={{ height: '8px', width: '35%', borderRadius: '5px', background: 'var(--hair)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// one line for an account's problems, the reasons in a tooltip (and below when details is on), with the two ways out
export function ProblemRow({ group, acting, details = false }: { group: ProblemGroup; acting: Acting; details?: boolean }) {
  const mine = acting.retrying === group.account
  return (
    <div role="alert" title={group.reasons.join('\n')} style={{ padding: '7px 10px', borderRadius: '10px', fontSize: '12px', color: 'var(--ink-2)', background: soft('--orange', 10), border: `1px solid ${soft('--orange', 35)}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: 'var(--orange)' }}>⚠</span>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{groupLine(group)}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexShrink: 0 }}>
          <Btn label={mine ? 'Reading…' : 'Retry'} disabled={acting.busy} onClick={() => acting.retry(group.account)} />
          <Btn label="Reconnect" style={ghostStyle} disabled={acting.busy} onClick={() => acting.reconnect(group.account)} />
        </span>
      </div>
      {details && <ul style={{ margin: '6px 0 0 22px', padding: 0, color: 'var(--ink-3)', fontSize: '11.5px' }}>{group.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
    </div>
  )
}

// notes as one muted line cut with an ellipsis; "details" lists them in full
export function Notes({ notes }: { notes: string[] | undefined }) {
  const [open, setOpen] = useState(false)
  if (!notes?.length) return null
  const short = tidyNotes(notes)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--ink-3)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short.join(' · ')}</span>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ font: 'inherit', fontSize: '11.5px', padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-3)', flexShrink: 0 }}>{open ? 'Hide details' : 'Details'}</button>
      </div>
      {open && <ul style={{ margin: 0, paddingLeft: '18px' }}>{notes.map(n => <li key={n} style={{ overflowWrap: 'anywhere' }}>{n}</li>)}</ul>}
    </div>
  )
}

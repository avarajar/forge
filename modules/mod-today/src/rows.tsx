import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren, FunctionComponent } from 'preact'
import { showToast } from '@forge-dev/ui'
import type { PanelClient } from '@forge-dev/sdk'
import type { Digest, Item, Kind, Op } from './digest'
import { errorMessage, opFor } from './ops'

export type OnAct = (item: Item, op: Op, project?: string) => Promise<void>
export interface Acting { busy: boolean; refreshing: boolean; run: (fn: () => Promise<unknown>) => Promise<void>; act: OnAct; refresh: () => Promise<void> }

export interface DigestReply { digest: Digest | null; folded: boolean; enabled: boolean }

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

const FILTER_KEY = 'today.account'

// the account this viewer looks at, kept in the browser; '' is every account
export function useAccountFilter(): [string, (a: string) => void] {
  const [account, setAccount] = useState(() => {
    try {
      return localStorage.getItem(FILTER_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const choose = (a: string) => {
    setAccount(a)
    try {
      if (a) localStorage.setItem(FILTER_KEY, a)
      else localStorage.removeItem(FILTER_KEY)
    } catch {
      // the choice then lasts until the page closes
    }
  }
  return [account, choose]
}

// loads the digest now and every minute; `path` picks a day
export function useDigest(forge: PanelClient, path = '/digest') {
  const [reply, setReply] = useState<DigestReply | null>(null)
  const [error, setError] = useState<string | null>(null)
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
  useEffect(() => {
    void load()
    const poll = () => { if (!document.hidden) void load() }
    const t = setInterval(poll, 60_000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [load])
  return { reply, error, reload: load }
}

export function useProjects(forge: PanelClient): string[] {
  const [projects, setProjects] = useState<string[]>([])
  useEffect(() => {
    forge.route<{ projects: string[] }>('/projects').then(r => setProjects(r.projects), () => {})
  }, [forge])
  return projects
}

// one acting state per digest: every action button waits while any action runs; a reading only blocks another reading
export function useActing(forge: PanelClient, date: string | undefined, reload: () => Promise<void>): Acting {
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const reading = useRef(false)
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      showToast(errorMessage(e), 'error')
    }
    await reload()
    setBusy(false)
  }
  const act: OnAct = (item, op, project) => run(async () => {
    if (date) await forge.action(op, { date, id: item.id, ...(project ? { project } : {}) })
  })
  const refresh = async () => {
    if (reading.current) return
    reading.current = true
    setRefreshing(true)
    try {
      await forge.action('refresh')
    } catch (e) {
      showToast(errorMessage(e), 'error')
    }
    await reload()
    reading.current = false
    setRefreshing(false)
  }
  return { busy, refreshing, run, act, refresh }
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

export function readLine(d: Digest): string {
  const read = new Date(d.readAt)
  const since = new Date(d.since)
  const same = read.toDateString() === since.toDateString()
  const day = new Date(read.getTime() - 86_400_000).toDateString() === since.toDateString() ? 'yesterday ' : `${since.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} `
  return `Read at ${clock(read)} · Linear, Slack and GitHub since ${same ? '' : day}${clock(since)}`
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
    <div title={SOURCE_LABEL[source]} style={{ width: '30px', height: '30px', borderRadius: '8px', display: 'grid', placeItems: 'center', flexShrink: 0, background: `color-mix(in srgb, ${SOURCE_TINT[source]}, transparent)` }}>
      {source === 'github' ? (
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" style={{ color: 'var(--ink)' }} d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
      ) : source === 'linear' ? (
        <svg width="15" height="15" viewBox="0 0 100 100" aria-hidden="true"><path fill="#8c94f0" d="M1.2 61.5 38.5 98.8C19.8 95.6 4.4 80.2 1.2 61.5zM0 46.9 53.1 100c3.4-.2 6.8-.8 10-1.6L1.6 36.9C.8 40.1.2 43.5 0 46.9zM4.9 27 73 95.1c2.6-1.1 5.1-2.5 7.4-4L8.9 19.6c-1.5 2.3-2.9 4.8-4 7.4zM14.4 13.8C23.4 5.3 35.5 0 48.9 0 76 0 100 24 100 51.1c0 13.4-5.3 25.5-13.8 34.5z" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke-width="2.6" stroke-linecap="round"><path stroke="#36c5f0" d="M9 3.5v6" /><path stroke="#2eb67d" d="M20.5 9h-6" /><path stroke="#ecb22e" d="M15 20.5v-6" /><path stroke="#e01e5a" d="M3.5 15h6" /></g></svg>
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

function Avatar({ who }: { who: string }) {
  const initials = who.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?'
  let h = 0
  for (const c of who) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span style={{ width: '16px', height: '16px', borderRadius: '50%', display: 'inline-grid', placeItems: 'center', fontSize: '8.5px', fontWeight: 700, color: '#fff', background: `var(${AVATARS[h % AVATARS.length]})` }}>{initials}</span>
  )
}

const Sep = () => <span style={{ color: 'var(--ink-3)' }}>·</span>
const strong = (t: string) => <b style={{ color: 'var(--ink)', fontWeight: 550 }}>{t}</b>

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

function ProjectPicker({ projects, value, onChange }: { projects: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Project" value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)} style={{ font: 'inherit', fontSize: '12px', padding: '4px 6px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--card)', color: 'var(--ink)' }}>
      <option value="">Project…</option>
      {projects.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  )
}

function outcome(item: Item): ComponentChildren {
  const s = item.startedSession
  const where = s ? `${s.project} / ${s.sessionDir}` : ''
  if (item.kind === 'research') return <LiveChip label={`Researching${where ? ` · ${where}` : ''}`} />
  if (item.kind === 'to-task') return <span style={{ fontSize: '11.5px', color: 'var(--green)' }}>Sent</span>
  return <span style={{ fontSize: '11.5px', color: 'var(--green)' }}>Started{where ? ` · ${where}` : ''}</span>
}

export const Row: FunctionComponent<{ item: Item; projects?: string[]; acting: Acting; forge: PanelClient }> = ({ item, projects = [], acting, forge }) => {
  const [project, setProject] = useState(item.project ?? '')
  const open = item.state === 'proposed' || item.state === 'failed'
  const needsProject = (item.kind === 'issue' || item.kind === 'request' || item.kind === 'review') && !item.project
  const verb = item.kind === 'to-task' ? 'Send' : item.kind === 'research' ? 'Research' : item.kind === 'review' ? 'Review' : 'Start'
  const op = opFor(item, project)
  const where = item.source === 'slack' ? 'in' : 'on'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: '12px', alignItems: 'center', padding: '10px 12px', borderRadius: '11px', background: soft('--ink', 3), border: '1px solid var(--hair)', opacity: item.state === 'dismissed' ? 0.55 : 1, transition: 'background .2s var(--ease)' }}>
      <SourceIcon source={item.source} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 560, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {item.issueKey && <span style={{ fontFamily: 'var(--mono, ui-monospace, monospace)', fontSize: '11.5px', color: 'var(--ink-2)', fontWeight: 500 }}>{item.issueKey}</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', fontSize: '11.5px', color: 'var(--ink-2)', flexWrap: 'wrap' }}>
          <Avatar who={item.who} />
          <span>{item.who} {where} {strong(item.where)}</span>
          <Sep />
          <span>{ago(item.when)}</span>
          {item.account && <><Sep /><AccountChip account={item.account} /></>}
          <Sep />
          <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-2)', textDecoration: 'none', borderBottom: '1px dotted var(--ink-3)' }}>View in {SOURCE_LABEL[item.source]} ↗</a>
          {item.kind === 'to-task' && item.targetSession && <><Sep /><span>goes to {strong(item.targetSession.sessionDir)}</span></>}
          {item.project && item.kind !== 'to-task' && <><Sep /><span>project {strong(item.project)}</span></>}
        </div>
        {item.quote && <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--ink-2)', borderLeft: '2px solid var(--hair-2)', paddingLeft: '8px', fontStyle: 'italic' }}>“{item.quote}”</div>}
        {item.error && <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--red)' }}>{item.error}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <KindPill kind={item.kind} />
        {open && needsProject && <ProjectPicker projects={projects} value={project} onChange={setProject} />}
        {open && <Btn label={item.state === 'failed' ? 'Retry' : verb} disabled={acting.busy || !op} onClick={() => op && acting.act(item, op, needsProject ? project : undefined)} />}
        {open && <Btn label="Dismiss" style={ghostStyle} disabled={acting.busy} onClick={() => acting.act(item, 'dismiss')} />}
        {item.state === 'done' && outcome(item)}
        {item.state === 'done' && item.startedSession && <Btn label="Open session" onClick={() => forge.openSession(item.startedSession!.project, item.startedSession!.sessionDir)} />}
        {item.state === 'dismissed' && <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>Dismissed</span>}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { PanelClient } from '@forge-dev/sdk'
import { ageShort, canHide, canResearch, EMPTY_PROJECTS, initialSelection, isGroupFolded, isUnread, keyCommand, moveFor, moveSelection, needsProject, opFor, projectsFor, safeHref, titleFor, visibleEntries, whoOf, type Command, type Entry, type InboxGroup, type ProjectList } from './ops'
import { ago, AccountChip, Avatar, Btn, ghostStyle, KindPill, outcome, PENDING_TOKEN, primaryStyle, ProjectPicker, Quote, Sep, soft, sourceOf, SourceIcon, strong, type Acting } from './rows'

const mono = { fontFamily: 'var(--mono, ui-monospace, monospace)', fontSize: '11.5px', color: 'var(--ink-2)', fontWeight: 500 }
const label = { fontSize: '10px', fontWeight: 650, letterSpacing: '.06em', textTransform: 'uppercase' as const, color: 'var(--ink-3)' }

// what the buttons and keys do to an entry; each answers whether it ran
export interface EntryApi {
  primary: (e: Entry, project: string) => Promise<boolean>
  hide: (e: Entry) => Promise<boolean>
  research: (e: Entry) => Promise<boolean>
  open: (e: Entry) => void
}

export function entryApi(acting: Acting, forge: PanelClient): EntryApi {
  return {
    async primary(e, project) {
      const move = moveFor(e, project)
      if (!move?.ready) return false
      if (e.kind === 'pending') {
        const t = e.item.targetSession
        if (move.kind === 'task' && t) {
          forge.openSession(t.project, t.sessionDir)
          return true
        }
        return acting.startPending(e.item, e.item.project ? undefined : project)
      }
      const s = e.item.startedSession
      if (move.kind === 'session' && s) {
        forge.openSession(s.project, s.sessionDir)
        return true
      }
      const op = opFor(e.item, project)
      return op ? acting.act(e.item, op, needsProject(e) ? project : undefined) : false
    },
    hide: async e => (!canHide(e) ? false : e.kind === 'pending' ? acting.hidePending(e.item) : acting.act(e.item, 'dismiss')),
    research: async e => (e.kind === 'pending' && canResearch(e) ? acting.researchPending(e.item) : false),
    open(e) {
      const href = safeHref(e.item.link)
      if (href) window.open(href, '_blank', 'noopener,noreferrer')
    },
  }
}

// is a key press going to a field the person is typing in
export function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

// the line under the title: where it came from, who wrote it
function Where({ e }: { e: Entry }) {
  const i = e.item
  const age = <span title={i.when}>{ago(i.when)}</span>
  const account = i.account ? <AccountChip account={i.account} /> : null
  let place: ComponentChildren
  if (e.kind === 'news') {
    const who = whoOf(e.item)
    place = <>{who && <Avatar who={who} />}<span>{who ? <>{who} {e.item.source === 'slack' ? 'in' : 'on'} {strong(e.item.where)}</> : strong(e.item.where)}</span></>
  } else if (e.item.kind === 'reply') {
    place = <span>{e.item.who} in {strong(e.item.where ?? '')}</span>
  } else {
    place = <span>{e.item.repo ? strong(e.item.repo) : e.item.issueKey ? strong(e.item.issueKey) : null}{(e.item.repo || e.item.issueKey) && e.item.state ? ' · ' : ''}{e.item.kind === 'ci' ? '' : e.item.state}</span>
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', color: 'var(--ink-2)', fontSize: '12px' }}>
      <SourceIcon source={i.source} />
      <b style={{ fontWeight: 600, color: 'var(--ink)' }}>{sourceOf(i)}</b>
      <Sep />
      {place}
      <Sep />
      {age}
      {account}
    </div>
  )
}

// text written by other people, shown as text only
function ContextBlock({ e }: { e: Entry }) {
  const i = e.item
  const slack = i.source === 'slack'
  if (i.context) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={label}>{slack ? 'Thread' : 'Details'}</span>
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12.5px', lineHeight: 1.55, color: 'var(--ink-2)', padding: '10px 12px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--hair)' }}>{i.context}</div>
      </div>
    )
  }
  if (e.kind === 'pending' && e.item.source === 'github') {
    const p = e.item
    const checks = p.kind === 'ci' ? p.state?.replace(/^failing:\s*/, '') : ''
    const rows: [string, string | undefined][] = [['Repository', p.repo], [p.kind === 'ci' ? 'Failing checks' : 'State', p.kind === 'ci' ? checks : p.state], ['Updated', ago(p.when)]]
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: '12.5px', padding: '10px 12px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--hair)' }}>
        {rows.filter(([, v]) => v).map(([k, v]) => <><span style={{ color: 'var(--ink-3)' }}>{k}</span><span style={{ overflowWrap: 'anywhere' }}>{v}</span></>)}
      </div>
    )
  }
  return i.quote ? <Quote text={i.quote} /> : null
}

const pillStyle = (token: string) => ({ fontSize: '10.5px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px', whiteSpace: 'nowrap' as const, color: `var(${token})`, background: soft(token, 15) })

function KindTag({ e }: { e: Entry }) {
  if (e.kind === 'news') return <KindPill kind={e.item.kind} />
  const p = e.item
  const text = p.kind === 'reply' ? 'Waiting on you' : p.kind === 'ci' ? 'CI failing' : p.kind === 'review' ? 'Review requested' : p.source === 'linear' ? (p.started ? 'In progress' : 'To do') : 'Assigned'
  return <span style={pillStyle(PENDING_TOKEN[p.kind])}>{text}</span>
}

// the entry as a person reads it: where it came from, the title, what was said
export function EntryBody({ e, big }: { e: Entry; big?: boolean }) {
  const i = e.item
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <Where e={e} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <KindTag e={e} />
        {i.issueKey && <span style={mono}>{i.issueKey}</span>}
      </div>
      <h3 style={{ margin: 0, fontSize: big ? '20px' : '17px', lineHeight: 1.3, fontWeight: 650, letterSpacing: '-.01em', overflowWrap: 'anywhere' }}>{titleFor(i)}</h3>
      {e.kind === 'news' && e.item.project && e.item.kind !== 'to-task' && <div style={{ fontSize: '12px', color: 'var(--ink-2)' }}>project {strong(e.item.project)}</div>}
      {e.kind === 'news' && e.item.kind === 'to-task' && e.item.targetSession && <div style={{ fontSize: '12px', color: 'var(--ink-2)' }}>goes to {strong(e.item.targetSession.sessionDir)}</div>}
      {e.kind === 'pending' && e.item.project && <div style={{ fontSize: '12px', color: 'var(--ink-2)' }}>project {strong(e.item.project)}</div>}
      <ContextBlock e={e} />
      {e.kind === 'news' && e.item.error && <div style={{ color: 'var(--red)', fontSize: '12px' }}>{e.item.error}</div>}
      {e.kind === 'news' && e.item.state === 'done' && outcome(e.item)}
    </div>
  )
}

const hintFor = (e: Entry): string[] => {
  const move = moveFor(e)
  return ['↑↓ move', '↵ open link', ...(move ? [`S ${move.label.toLowerCase()}`] : []), ...(canHide(e) ? ['H hide'] : []), ...(canResearch(e) ? ['R research'] : []), '/ search']
}

const Kbd = ({ children }: { children: ComponentChildren }) => <span style={{ fontFamily: 'var(--mono, ui-monospace, monospace)', fontSize: '10.5px', padding: '1px 5px', borderRadius: '4px', border: '1px solid var(--hair-2)', color: 'var(--ink-2)' }}>{children}</span>

function Hint({ e }: { e: Entry }) {
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', color: 'var(--ink-3)', fontSize: '11px' }}>
      {hintFor(e).map(h => <span key={h}><Kbd>{h.split(' ')[0]}</Kbd> {h.slice(h.indexOf(' ') + 1)}</span>)}
    </div>
  )
}

// the buttons for an entry: the main move (with a project picker when one is needed), the link, Research and Hide
export function EntryActions({ e, project, setProject, projects, acting, api }: { e: Entry; project: string; setProject: (p: string) => void; projects: ProjectList; acting: Acting; api: EntryApi }) {
  const move = moveFor(e, project)
  const link = safeHref(e.item.link)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      {needsProject(e) && <ProjectPicker projects={projectsFor(projects, e.item.account)} value={project} onChange={setProject} />}
      {move && <Btn label={move.label} style={primaryStyle} disabled={acting.busy || !move.ready} onClick={() => void api.primary(e, project)} />}
      {link && <a href={link} target="_blank" rel="noopener noreferrer" style={{ font: 'inherit', fontSize: '12px', fontWeight: 550, borderRadius: '8px', padding: '5px 11px', border: '1px solid var(--hair-2)', background: 'var(--card-2, var(--elev))', color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Open in {sourceOf(e.item)} ↗</a>}
      {canResearch(e) && <Btn label="Research" disabled={acting.busy} onClick={() => void api.research(e)} />}
      {canHide(e) && <Btn label="Hide" style={ghostStyle} disabled={acting.busy} onClick={() => void api.hide(e)} />}
    </div>
  )
}

function ListRow({ e, selected, unread, onSelect }: { e: Entry; selected: boolean; unread: boolean; onSelect: () => void }) {
  const i = e.item
  return (
    <button type="button" role="option" aria-selected={selected} data-id={i.id} onClick={onSelect} style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'left', font: 'inherit', fontSize: '12.5px', padding: '7px 12px 7px 10px', border: 0, borderLeft: `2px solid ${selected ? 'var(--blue)' : 'transparent'}`, background: selected ? soft('--blue', 14) : 'transparent', color: 'var(--ink)', cursor: 'pointer' }}>
      <i aria-label={unread ? 'New' : undefined} style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: unread ? 'var(--blue)' : 'transparent' }} />
      <SourceIcon source={i.source} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: unread ? 650 : 530 }}>{titleFor(i)}</span>
      {i.account && <span style={{ flexShrink: 0 }}><AccountChip account={i.account} /></span>}
      <span title={i.when} style={{ fontSize: '11px', color: 'var(--ink-3)', minWidth: '26px', textAlign: 'right', flexShrink: 0 }}>{ageShort(i.when)}</span>
    </button>
  )
}

export interface InboxProps {
  forge: PanelClient
  groups: InboxGroup[]
  folds: Record<string, boolean>
  setFold: (id: string, folded: boolean) => void
  searching: boolean
  projects: ProjectList
  acting: Acting
  lastSeen: number | null
  // the search box, filter pills and Accept button above the list
  header: ComponentChildren
  empty: string
  footer?: ComponentChildren
  focusSearch: () => void
  clearSearch: () => void
  // off while another layer (the triage overlay) takes the keys
  keys: boolean
}

// the list on the left, the selected entry on the right; under 900px one at a time
export function Inbox(p: InboxProps) {
  const { groups, folds, searching, acting, projects } = p
  const base = entryApi(acting, p.forge)
  const visible = visibleEntries(groups, folds, searching)
  const [selected, select] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const currentId = visible.some(e => e.item.id === selected) ? selected : initialSelection(visible)
  const current = visible.find(e => e.item.id === currentId) ?? null

  // a hide, by button or key, moves to the neighbour
  const api: EntryApi = {
    ...base,
    hide: async e => {
      const ids = visible.map(v => v.item.id)
      const at = ids.indexOf(e.item.id)
      const next = ids[at + 1] ?? ids[at - 1] ?? null
      const ok = await base.hide(e)
      if (ok) select(next)
      return ok
    },
  }
  const pick = (id: string, project: string) => setPicks(prev => ({ ...prev, [id]: project }))
  const project = current ? picks[current.item.id] ?? current.item.project ?? '' : ''

  // the key handler always sees the latest render
  const latest = useRef<(c: Command) => void>(() => {})
  latest.current = (c: Command) => {
    const ids = visible.map(e => e.item.id)
    if (c === 'next' || c === 'prev') return select(moveSelection(ids, currentId, c === 'next' ? 1 : -1))
    if (c === 'search') return p.focusSearch()
    if (c === 'clear') return p.clearSearch()
    if (!current) return
    if (c === 'open') return api.open(current)
    if (c === 'start') return void api.primary(current, project)
    if (c === 'research') return void api.research(current)
    if (c === 'hide' && canHide(current)) void api.hide(current)
  }
  useEffect(() => {
    if (!p.keys) return
    const onKey = (ev: KeyboardEvent) => {
      // keys under a drawer or modal are theirs
      const t = ev.target as HTMLElement | null
      if (ev.defaultPrevented || (t !== document.body && !t?.closest?.('.today-inbox'))) return
      const c = keyCommand(ev, 'inbox', typingIn(ev.target))
      if (!c) return
      // a held key repeats only the arrows
      if (ev.repeat && c !== 'next' && c !== 'prev') return
      // a focused button or link keeps Enter for itself
      if (c === 'open' && /^(BUTTON|A)$/.test(t?.tagName ?? '')) return
      ev.preventDefault()
      latest.current(c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.keys])

  // the selected row stays in view when the arrows move it
  useEffect(() => {
    if (currentId) document.querySelector(`.today-list [data-id="${currentId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  return (
    <div class="today-inbox" data-open={open ? 'true' : 'false'}>
      <div class="today-list">
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid var(--hair)', flexShrink: 0 }}>{p.header}</div>
        <div role="listbox" aria-label="Today" style={{ overflowY: 'auto', flex: 1, paddingBottom: '8px' }}>
          {groups.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--ink-2)', padding: '12px' }}>{p.empty}</div>}
          {groups.map(g => {
            // a search shows the matches, so no group stays folded
            const folded = !searching && isGroupFolded(g, folds)
            return (
              <div key={g.id}>
                <button type="button" aria-expanded={!folded} onClick={() => p.setFold(g.id, !folded)} style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', fontSize: '10px', fontWeight: 650, letterSpacing: '.06em', textTransform: 'uppercase', padding: '10px 12px 4px', border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>
                  {folded ? '▸' : '▾'} {g.title} · {g.entries.length}
                </button>
                {!folded && g.entries.map(e => <ListRow key={e.item.id} e={e} selected={e.item.id === currentId} unread={isUnread(e.item.when, p.lastSeen)} onSelect={() => { select(e.item.id); setOpen(true) }} />)}
              </div>
            )
          })}
          {p.footer}
        </div>
      </div>
      <div class="today-detail">
        {current ? (
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button type="button" class="today-back" onClick={() => setOpen(false)} style={{ alignSelf: 'flex-start', font: 'inherit', fontSize: '12px', padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--blue)' }}>← Back</button>
            <EntryBody e={current} />
            <EntryActions e={current} project={project} setProject={v => pick(current.item.id, v)} projects={projects ?? EMPTY_PROJECTS} acting={acting} api={api} />
            <Hint e={current} />
          </div>
        ) : (
          <div style={{ padding: '22px', fontSize: '12.5px', color: 'var(--ink-3)' }}>Nothing selected.</div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'preact/hooks'
import type { PanelClient } from '@forge-dev/sdk'
import { canHide, keyCommand, moveFor, needsProject, projectsFor, triageCounts, triageDeck, triageNext, triageProgress, triageSummary, type Command, type Decision, type Decisions, type Entry, type InboxGroup, type ProjectList } from './ops'
import { Btn, ghostStyle, primaryStyle, ProjectPicker, soft, useReadingStyles, type Acting } from './rows'
import { entryApi, EntryBody, typingIn } from './inbox'

interface Props {
  forge: PanelClient
  groups: InboxGroup[]
  done: Decisions
  decide: (id: string, d: Decision) => void
  reset: () => void
  projects: ProjectList
  acting: Acting
  onClose: () => void
}

const keyTile = (key: string, label: string, disabled: boolean, onClick: () => void, primary = false) => (
  <button type="button" disabled={disabled} onClick={onClick} style={{ font: 'inherit', textAlign: 'center', padding: '9px 6px', borderRadius: '10px', border: `1px solid ${primary && !disabled ? 'transparent' : 'var(--hair)'}`, background: primary && !disabled ? 'var(--blue)' : 'var(--elev)', color: primary && !disabled ? '#fff' : 'var(--ink-2)', fontSize: '11.5px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
    <b style={{ display: 'block', fontSize: '13px', color: primary && !disabled ? '#fff' : 'var(--ink)', marginBottom: '2px' }}>{key}</b>
    {label}
  </button>
)

// a focused pass over what needs you: one card at a time, each decided with a key
export function Triage({ forge, groups, done, decide, reset, projects, acting, onClose }: Props) {
  useReadingStyles()
  const [withTodo, setWithTodo] = useState(false)
  const [skipTodo, setSkipTodo] = useState(false)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const deck = triageDeck(groups, withTodo)
  const current = triageNext(deck, done)
  const { sorted, total } = triageProgress(deck, done)
  const counts = triageCounts(groups, done)
  const todoLeft = counts.find(c => c.id === 'todo')?.left ?? 0
  const api = entryApi(acting, forge)
  const project = current ? picks[current.item.id] ?? current.item.project ?? '' : ''
  const move = current ? moveFor(current, project) : null
  const summary = triageSummary(done)
  const finished = !current && (withTodo || skipTodo || todoLeft === 0)
  const dialog = useRef<HTMLDivElement>(null)

  const take = async (e: Entry, what: 'start' | 'hide') => {
    if (acting.busy) return
    const ok = what === 'start' ? await api.primary(e, picks[e.item.id] ?? e.item.project ?? '') : await api.hide(e)
    if (ok) decide(e.item.id, what === 'start' ? 'started' : 'hidden')
  }

  const latest = useRef<(c: Command) => void>(() => {})
  latest.current = c => {
    if (c === 'close') return onClose()
    if (!current) return
    if (c === 'start' && move?.ready) void take(current, 'start')
    else if (c === 'open') api.open(current)
    else if (c === 'later') decide(current.item.id, 'later')
    else if (c === 'hide' && canHide(current)) void take(current, 'hide')
  }
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const c = keyCommand(ev, 'triage', typingIn(ev.target))
      if (!c) return
      ev.preventDefault()
      latest.current(c)
    }
    window.addEventListener('keydown', onKey)
    dialog.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pct = total ? Math.round((sorted / total) * 100) : 0
  return (
    <div role="dialog" aria-modal="true" aria-label="Start the day" ref={dialog} tabIndex={-1} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: 'color-mix(in srgb, var(--bg, #000) 82%, transparent)', backdropFilter: 'blur(6px)', outline: 'none' }}>
      <div style={{ width: 'min(960px, 100%)', maxHeight: '100%', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: '18px', alignItems: 'start' }} class="today-triage">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--ink-2)' }}>
            <b style={{ color: 'var(--ink)', fontSize: '13px' }}>Start the day</b>
            <span>{sorted} of {total} sorted</span>
            <button type="button" onClick={onClose} style={{ marginLeft: 'auto', font: 'inherit', fontSize: '12px', padding: '2px 8px', borderRadius: '7px', border: '1px solid var(--hair-2)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>Close · Esc</button>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={sorted} style={{ height: '6px', borderRadius: '4px', background: soft('--ink', 8), overflow: 'hidden' }}>
            <i style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--blue), var(--purple))', transition: 'width .3s var(--ease)' }} />
          </div>

          {current ? (
            <div key={current.item.id} class="today-slide" style={{ padding: '20px 22px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair-2)', boxShadow: '0 20px 50px rgba(0,0,0,.35)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <EntryBody e={current} big />
              {needsProject(current) && <div><ProjectPicker projects={projectsFor(projects, current.item.account)} value={project} onChange={v => setPicks({ ...picks, [current.item.id]: v })} /></div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                {keyTile('S', move?.label ?? 'Start', acting.busy || !move?.ready, () => void take(current, 'start'), true)}
                {keyTile('O', 'Open link', false, () => api.open(current))}
                {keyTile('L', 'Later', false, () => decide(current.item.id, 'later'))}
                {keyTile('H', 'Hide', acting.busy || !canHide(current), () => void take(current, 'hide'))}
              </div>
            </div>
          ) : finished ? (
            <div class="today-slide" style={{ padding: '26px 22px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair-2)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 650 }}>All sorted — {summary.started} started, {summary.hidden} hidden, {summary.later} for later</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Btn label="Close" style={primaryStyle} onClick={onClose} />
                {summary.later > 0 && <Btn label="Start over" style={ghostStyle} onClick={reset} />}
              </div>
            </div>
          ) : (
            <div class="today-slide" style={{ padding: '26px 22px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair-2)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 650 }}>Needs you and In progress are sorted</h3>
              <div style={{ fontSize: '13px', color: 'var(--ink-2)' }}>Continue with To do ({todoLeft})?</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Btn label="Continue" style={primaryStyle} onClick={() => setWithTodo(true)} />
                <Btn label="Finish" style={ghostStyle} onClick={() => setSkipTodo(true)} />
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--hair)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
          <div style={{ width: '96px', height: '96px', borderRadius: '50%', margin: '4px auto 10px', display: 'grid', placeItems: 'center', background: `conic-gradient(var(--green) 0 ${pct}%, ${soft('--ink', 8)} ${pct}% 100%)` }}>
            <span style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: '18px', fontWeight: 700, color: 'var(--ink)' }}>{pct}%</span>
          </div>
          {counts.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{c.title}</span><b style={{ color: 'var(--ink)' }}>{c.left}</b></div>)}
        </div>
      </div>
    </div>
  )
}

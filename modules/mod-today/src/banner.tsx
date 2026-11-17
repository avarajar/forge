import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import type { Item, PendingItem } from './digest'
import { accountsOf, failedLine, FIRST_READING_NOTE, pendingIn, groupProblems, inAccount, loadFailedLine, notesLine, opFor, problemsLabel, startsTask } from './ops'
import { accountToken, Btn, clock, dayLabel, foldedNow, ghostStyle, primaryStyle, PendingRow, ProblemRow, readLine, ReadingLine, Row, SkeletonRows, shortDay, soft, useAccountFilter, useActing, useDigest, useProjects } from './rows'

const pill = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--ink-2)', padding: '3px 9px', borderRadius: '20px', background: 'var(--elev)', border: '1px solid var(--hair)' }

function Count({ token, n, label }: { token: string; n: number; label: string }) {
  if (n === 0) return null
  return (
    <span style={pill}>
      <i style={{ width: '7px', height: '7px', borderRadius: '50%', background: `var(${token})` }} />
      {n} {label}
    </span>
  )
}

function FilterChip({ label, n, on, token, onClick }: { label: string; n: number; on: boolean; token?: string; onClick: () => void }) {
  const tint = token ?? '--blue'
  return (
    <button type="button" aria-pressed={on} onClick={onClick} style={{ ...pill, font: 'inherit', fontSize: '11.5px', cursor: 'pointer', color: on ? 'var(--ink)' : 'var(--ink-2)', borderColor: on ? `var(${tint})` : 'var(--hair)', background: on ? soft(tint, 15) : 'var(--elev)' }}>
      {token && <i style={{ width: '7px', height: '7px', borderRadius: '50%', background: `var(${token})` }} />}
      {label} · {n}
    </button>
  )
}

const live = (items: Item[]) => items.filter(i => i.state !== 'dismissed')
const done = (items: Item[], pick: (kind: Item['kind']) => boolean) => items.filter(i => i.state === 'done' && pick(i.kind)).length

function shell(children: ComponentChildren) {
  return (
    <div style={{ position: 'relative', borderRadius: '16px', padding: '1px', background: `linear-gradient(135deg, ${soft('--blue', 55)}, ${soft('--purple', 40)} 45%, var(--hair) 80%)`, boxShadow: `0 10px 40px ${soft('--blue', 10)}` }}>
      <div style={{ borderRadius: '15px', background: 'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--blue) 14%, var(--card)) 0%, var(--card) 55%)' }}>{children}</div>
    </div>
  )
}

const PENDING_SHOWN = 5

// a compact "Pending · N" line that opens to the first few open items
function PendingFold({ pending, projects, acting, forge }: { pending: PendingItem[]; projects: Parameters<typeof PendingRow>[0]['projects']; acting: Parameters<typeof PendingRow>[0]['acting']; forge: Parameters<typeof PendingRow>[0]['forge'] }) {
  const [open, setOpen] = useState(false)
  if (pending.length === 0) return null
  return (
    <div style={{ marginTop: '10px' }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ font: 'inherit', fontSize: '12px', fontWeight: 600, padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}>
        {open ? '▾' : '▸'} Pending · {pending.length}
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          {pending.slice(0, PENDING_SHOWN).map(p => <PendingRow key={p.id} item={p} projects={projects} acting={acting} forge={forge} compact />)}
          <div><Btn label="See all →" style={ghostStyle} onClick={() => forge.openPage()} /></div>
        </div>
      )}
    </div>
  )
}

// the one-line states: a title, what follows it, and the buttons at the end
function Strip({ title, children, actions, below }: { title: string; children?: ComponentChildren; actions: ComponentChildren; below?: ComponentChildren }) {
  return shell(
    <>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
      <span style={{ color: 'var(--orange)' }}>☀︎</span>
      <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{title}</b>
      {children}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>{actions}</span>
    </div>
    {below && <div style={{ padding: '0 16px 10px' }}>{below}</div>}
    </>,
  )
}

function Banner({ forge }: PanelProps) {
  const { reply, error, reload, hurry } = useDigest(forge)
  const projects = useProjects(forge)
  const [chosen, choose] = useAccountFilter()
  const digest = reply?.digest
  const allPending = reply?.pending ?? []
  const pendingText = (list: PendingItem[]) => (list.length ? ` · ${list.length} pending` : '')
  const acting = useActing(forge, digest?.date, reload, hurry)
  const reading = reply?.reading
  const isReading = acting.refreshing || !!reading
  const refreshBtn = <Btn label={isReading ? 'Reading…' : 'Refresh'} style={ghostStyle} disabled={isReading} onClick={acting.refresh} />
  const failure = (text: string) => <span style={{ color: 'var(--red)' }}>· {text}</span>
  const notes = notesLine(digest?.notes)
  const note = notes && <span style={{ color: 'var(--ink-3)' }}>· {notes}</span>
  const problems = groupProblems(digest?.problems ?? [])
  const problemRows = problems.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
      {problems.map(g => <ProblemRow key={g.account} group={g} acting={acting} />)}
    </div>
  )
  const problemsLink = problems.length > 0 && <button type="button" onClick={() => forge.openPage()} style={{ font: 'inherit', fontSize: 'inherit', padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--orange)' }}>· {problemsLabel(problems.length)}</button>
  if (!reply && !error) return null
  if (reply && !reply.enabled) {
    return (
      <Strip title="Today" actions={<Btn label="Turn on" style={primaryStyle} disabled={acting.busy} onClick={() => acting.run(() => forge.action('enable'))} />}>
        <span>· Linear, Slack and GitHub each morning</span>
      </Strip>
    )
  }
  // a first reading: the reading line over placeholder rows
  if (reply && isReading && (!digest || digest.items.length === 0)) {
    return shell(
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--orange)' }}>☀︎</span>
          <ReadingLine reading={reading} />
          <span style={{ marginLeft: 'auto' }}>{refreshBtn}</span>
        </div>
        {!digest && <SkeletonRows />}
        {problemRows}
      </div>,
    )
  }
  if (!reply || !digest || digest.items.length === 0) {
    return (
      <Strip title={reply && !digest ? 'Not read yet' : shortDay(new Date(), digest?.date)} actions={refreshBtn} below={reply && <PendingFold pending={allPending} projects={projects} acting={acting} forge={forge} />}>
        {!reply ? failure(loadFailedLine(error!)) : digest?.error ? failure(failedLine(digest.error)) : digest && <span>· {reply.firstReading ? FIRST_READING_NOTE : `nothing new since ${clock(new Date(digest.readAt))}`}{pendingText(allPending)}</span>}
        {problemsLink}
        {note}
      </Strip>
    )
  }

  const items = digest.items
  const accounts = accountsOf(items)
  // a filter on an account that has no items today shows everything
  const account = accounts.includes(chosen) ? chosen : ''
  const seen = (list: Item[]) => inAccount(list, account)
  const shown = seen(live(items))
  const folded = foldedNow(reply.folded, items)
  const fold = (value: boolean) => acting.run(() => forge.action('fold', { date: digest.date, folded: value }))

  if (folded) {
    return (
      <Strip title={shortDay(new Date(), digest.date)} actions={<>{refreshBtn}<Btn label="See all →" style={ghostStyle} onClick={() => forge.openPage()} /></>} below={<PendingFold pending={pendingIn(allPending, account)} projects={projects} acting={acting} forge={forge} />}>
        <span>· {done(items, startsTask)} started · {done(items, k => k === 'research')} researching · {done(items, k => k === 'to-task')} sent{pendingText(pendingIn(allPending, account))}</span>
        {digest.error && failure(failedLine(digest.error))}
        {problemsLink}
        {note}
      </Strip>
    )
  }

  const waiting = seen(items).filter(i => i.state === 'proposed' || i.state === 'failed')
  const ready = waiting.filter(i => opFor(i)).length
  const acceptAll = () => acting.run(() => forge.action('accept-all', { date: digest.date, ...(account ? { account } : {}) }))

  return shell(
    <div style={{ padding: '16px 18px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg, #ffb340, #ff7a1a)', boxShadow: '0 4px 14px rgba(255, 140, 30, .35)', fontSize: '17px' }}>☀︎</div>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 650, letterSpacing: '-.01em' }}>{dayLabel(new Date(), digest.date)}</h3>
          <div style={{ color: 'var(--ink-2)', fontSize: '12px', marginTop: '1px' }}>{isReading ? <ReadingLine reading={reading} /> : readLine(digest)}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {refreshBtn}
          <Btn label="Fold ⌃" style={ghostStyle} disabled={acting.busy} onClick={() => fold(true)} />
          {ready > 0 && <Btn label={`Accept ${ready === 1 ? 'it' : `the ${ready}`}`} style={primaryStyle} disabled={acting.busy} onClick={acceptAll} />}
        </div>
      </div>

      {accounts.length > 1 && (
        <div role="group" aria-label="Account" style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
          <FilterChip label="All" n={live(items).length} on={!account} onClick={() => choose('')} />
          {accounts.map(a => <FilterChip key={a} label={a} token={accountToken(a)} n={inAccount(live(items), a).length} on={account === a} onClick={() => choose(a)} />)}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', margin: '14px 0 10px', flexWrap: 'wrap' }}>
        <Count token="--orange" n={shown.filter(i => i.kind === 'to-task').length} label="for open tasks" />
        <Count token="--green" n={shown.filter(i => i.kind === 'issue' || i.kind === 'request').length} label="new tasks" />
        <Count token="--blue" n={shown.filter(i => i.kind === 'review').length} label="to review" />
        <Count token="--purple" n={shown.filter(i => i.kind === 'research').length} label="researching" />
        <span style={{ ...pill, marginLeft: 'auto', borderColor: 'transparent', background: 'none', color: 'var(--ink-3)' }}>{seen(items).length} read · {seen(items).length - shown.length} dismissed</span>
      </div>

      {digest.error && <div style={{ marginBottom: '8px', fontSize: '11.5px', color: 'var(--red)' }}>{failedLine(digest.error)}</div>}
      {notes && <div style={{ marginBottom: '8px', fontSize: '11.5px', color: 'var(--ink-3)' }}>{notes}</div>}

      {problemRows}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {shown.map(i => <Row key={i.id} item={i} projects={projects} acting={acting} forge={forge} />)}
      </div>

      <PendingFold pending={pendingIn(allPending, account)} projects={projects} acting={acting} forge={forge} />

      <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--ink-3)' }}>Research starts on its own (limited per day). The rest waits for your ok.</div>
    </div>,
  )
}

export default definePanel({ id: 'banner', title: 'Today', component: Banner })

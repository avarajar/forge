import type { ComponentChildren } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import type { Item } from './digest'
import { opFor, readingProblem } from './ops'
import { Btn, clock, dayLabel, foldedNow, ghostStyle, isToday, primaryStyle, readLine, Row, soft, useActing, useDigest, useProjects } from './rows'

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

const live = (items: Item[]) => items.filter(i => i.state !== 'dismissed')
const done = (items: Item[], kinds: Item['kind'][]) => items.filter(i => i.state === 'done' && kinds.includes(i.kind)).length

function Banner({ forge }: PanelProps) {
  const { reply, error, reload } = useDigest(forge)
  const projects = useProjects(forge)
  const digest = reply?.digest
  const acting = useActing(forge, digest?.date, reload)
  const refresh = () => acting.run(() => forge.action('refresh'))
  const refreshBtn = <Btn label={acting.busy ? 'Reading…' : 'Refresh'} style={ghostStyle} disabled={acting.busy} onClick={refresh} />
  const shell = (children: ComponentChildren) => (
    <div style={{ position: 'relative', borderRadius: '16px', padding: '1px', background: `linear-gradient(135deg, ${soft('--blue', 55)}, ${soft('--purple', 40)} 45%, var(--hair) 80%)`, boxShadow: `0 10px 40px ${soft('--blue', 10)}` }}>
      <div style={{ borderRadius: '15px', background: 'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--blue) 14%, var(--card)) 0%, var(--card) 55%)' }}>{children}</div>
    </div>
  )
  const line = { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px', fontSize: '12.5px', color: 'var(--ink-2)' }

  const failure = (text: string) => <span style={{ color: 'var(--red)' }}>· {text}</span>
  if (!reply && !error) return null
  if (!reply || !digest || digest.items.length === 0) {
    return shell(
      <div style={line}>
        <span style={{ color: 'var(--orange)' }}>☀︎</span>
        <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{digest || !reply ? 'Today' : 'Not read yet'}</b>
        {!reply ? failure(`Can't load Today: ${error}`) : digest?.error ? failure(readingProblem(digest.error)) : digest && <span>· nothing new since {clock(new Date(digest.readAt))}</span>}
        <span style={{ marginLeft: 'auto' }}>{refreshBtn}</span>
      </div>,
    )
  }

  const items = digest.items
  const shown = live(items)
  const folded = foldedNow(reply.folded, items)
  const fold = (value: boolean) => acting.run(() => forge.action('fold', { date: digest.date, folded: value }))

  if (folded) {
    return shell(
      <div style={line}>
        <span style={{ color: 'var(--orange)' }}>☀︎</span>
        <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{isToday(digest.date, new Date()) ? 'Today' : dayLabel(new Date(), digest.date)}</b>
        <span>· {done(items, ['issue', 'request', 'review'])} started · {done(items, ['research'])} researching · {done(items, ['to-task'])} sent</span>
        {digest.error && failure(readingProblem(digest.error))}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>{refreshBtn}<Btn label="See all →" style={ghostStyle} onClick={() => forge.openPage()} /></span>
      </div>,
    )
  }

  const waiting = items.filter(i => i.state === 'proposed' || i.state === 'failed')
  const ready = waiting.filter(i => opFor(i)).length
  const acceptAll = () => acting.run(() => forge.action('accept-all', { date: digest.date }))

  return shell(
    <div style={{ padding: '16px 18px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '34px', height: '34px', borderRadius: '10px', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg, #ffb340, #ff7a1a)', boxShadow: '0 4px 14px rgba(255, 140, 30, .35)', fontSize: '17px' }}>☀︎</div>
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 650, letterSpacing: '-.01em' }}>{dayLabel(new Date(), digest.date)}</h3>
          <div style={{ color: 'var(--ink-2)', fontSize: '12px', marginTop: '1px' }}>{readLine(digest)}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {refreshBtn}
          <Btn label="Fold ⌃" style={ghostStyle} disabled={acting.busy} onClick={() => fold(true)} />
          {ready > 0 && <Btn label={`Accept ${ready === 1 ? 'it' : `the ${ready}`}`} style={primaryStyle} disabled={acting.busy} onClick={acceptAll} />}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', margin: '14px 0 10px', flexWrap: 'wrap' }}>
        <Count token="--orange" n={shown.filter(i => i.kind === 'to-task').length} label="for open tasks" />
        <Count token="--green" n={shown.filter(i => i.kind === 'issue' || i.kind === 'request').length} label="new tasks" />
        <Count token="--blue" n={shown.filter(i => i.kind === 'review').length} label="to review" />
        <Count token="--purple" n={shown.filter(i => i.kind === 'research').length} label="researching" />
        <span style={{ ...pill, marginLeft: 'auto', borderColor: 'transparent', background: 'none', color: 'var(--ink-3)' }}>{items.length} read · {items.length - shown.length} dismissed</span>
      </div>

      {digest.error && <div style={{ marginBottom: '8px', fontSize: '11.5px', color: 'var(--red)' }}>{readingProblem(digest.error)}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {shown.map(i => <Row key={i.id} item={i} projects={projects} acting={acting} forge={forge} />)}
      </div>

      <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--ink-3)' }}>Research starts on its own (limited per day). The rest waits for your ok.</div>
    </div>,
  )
}

export default definePanel({ id: 'banner', title: 'Today', component: Banner })

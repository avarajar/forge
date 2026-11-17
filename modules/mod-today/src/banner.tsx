import type { ComponentChildren } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { bannerSummary, inboxGroups, failedLine, FIRST_READING_NOTE, groupLine, groupProblems, loadFailedLine, notesLine, problemsLabel, summaryText, urgentRows } from './ops'
import { Btn, ghostStyle, PendingRow, primaryStyle, readLine, ReadingLine, requestStartDay, Row, shortDay, soft, useActing, useDigest, useProjects } from './rows'

function shell(children: ComponentChildren) {
  return (
    <div style={{ position: 'relative', borderRadius: '14px', padding: '1px', background: `linear-gradient(135deg, ${soft('--blue', 55)}, ${soft('--purple', 40)} 45%, var(--hair) 80%)`, boxShadow: `0 8px 30px ${soft('--blue', 8)}` }}>
      <div style={{ borderRadius: '13px', background: 'radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--blue) 12%, var(--card)) 0%, var(--card) 55%)' }}>{children}</div>
    </div>
  )
}

// the one-line states: a title, what follows it, and the buttons at the end
function Strip({ title, children, actions, below }: { title: string; children?: ComponentChildren; actions: ComponentChildren; below?: ComponentChildren }) {
  return shell(
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', fontSize: '12.5px', color: 'var(--ink-2)', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--orange)' }}>☀︎</span>
        <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{title}</b>
        {children}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>{actions}</span>
      </div>
      {below && <div style={{ padding: '0 10px 8px' }}>{below}</div>}
    </>,
  )
}

const small = { ...ghostStyle, border: '1px solid var(--hair-2)', fontSize: '11.5px', padding: '2px 8px', color: 'var(--ink)' }
const linkStyle = { font: 'inherit', fontSize: 'inherit', padding: 0, border: 0, background: 'none', cursor: 'pointer' }

function Banner({ forge }: PanelProps) {
  const { reply, error, reload, hurry } = useDigest(forge)
  const projects = useProjects(forge)
  const digest = reply?.digest
  const acting = useActing(forge, digest?.date, reload, hurry)
  const reading = reply?.reading
  const isReading = acting.refreshing || !!reading
  const refreshBtn = <Btn label={isReading ? 'Reading…' : 'Refresh'} style={ghostStyle} disabled={isReading} onClick={acting.refresh} />
  const failure = (text: string) => <span style={{ color: 'var(--red)' }}>· {text}</span>
  if (!reply && !error) return null
  if (reply && !reply.enabled) {
    return (
      <Strip title="Today" actions={<Btn label="Turn on" style={primaryStyle} disabled={acting.busy} onClick={() => acting.run(() => forge.action('enable'))} />}>
        <span>· Linear, Slack and GitHub each morning</span>
      </Strip>
    )
  }
  // a first reading: the reading line in place of the summary
  if (reply && isReading && !digest) {
    return (
      <Strip title="Today" actions={refreshBtn}>
        <ReadingLine reading={reading} />
      </Strip>
    )
  }
  if (!reply || !digest) {
    return (
      <Strip title="Not read yet" actions={refreshBtn}>
        {error ? failure(loadFailedLine(error)) : <span>· use Refresh to read now</span>}
      </Strip>
    )
  }

  const pending = reply.pending ?? []
  const summary = bannerSummary(digest.items, pending)
  const rows = urgentRows(digest.items, pending)
  const needing = inboxGroups(digest.items.filter(i => i.state !== 'dismissed'), pending).find(g => g.id === 'needs')?.entries.length ?? 0
  const problems = groupProblems(digest.problems ?? [])
  const notes = notesLine(digest.notes)
  const status = [isReading ? null : readLine(digest), reply.firstReading ? FIRST_READING_NOTE : null, notes].filter(Boolean).join(' · ')
  const statusLine = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: 'var(--ink-3)', padding: '2px 6px 0', minWidth: 0 }}>
      {isReading ? <ReadingLine reading={reading} /> : <span title={status} style={{ minWidth: 0, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status}</span>}
      {digest.error && <span style={{ color: 'var(--red)' }}>{failedLine(digest.error)}</span>}
      {problems.length === 1 && (
        <span role="alert" title={problems[0].reasons.join('\n')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--ink-2)' }}>
          <span style={{ color: 'var(--orange)' }}>⚠</span>
          {groupLine(problems[0])}
          <Btn label={acting.retrying === problems[0].account ? 'Reading…' : 'Retry'} style={small} disabled={acting.busy} onClick={() => acting.retry(problems[0].account)} />
          <Btn label="Reconnect" style={{ ...small, ...ghostStyle, padding: '2px 8px' }} disabled={acting.busy} onClick={() => acting.reconnect(problems[0].account)} />
        </span>
      )}
      {problems.length > 1 && <button type="button" onClick={() => forge.openPage()} style={{ ...linkStyle, color: 'var(--orange)' }}>{problemsLabel(problems.length)} · Fix on Today →</button>}
    </div>
  )

  return (
    <Strip
      title={shortDay(new Date(), digest.date)}
      actions={refreshBtn}
      below={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {rows.map(r => (r.kind === 'pending'
            ? <PendingRow key={r.item.id} item={r.item} projects={projects} acting={acting} forge={forge} />
            : <Row key={r.item.id} item={r.item} projects={projects} acting={acting} forge={forge} />))}
          {statusLine}
        </div>
      }
    >
      <span>· {summaryText(summary)} ·</span>
      <button type="button" onClick={() => forge.openPage()} style={{ ...linkStyle, fontWeight: 600, color: 'var(--blue)' }}>Open Today →</button>
      {needing > 0 && <button type="button" onClick={() => { requestStartDay(); forge.openPage() }} style={{ ...linkStyle, fontWeight: 600, color: 'var(--purple)' }}>Start the day →</button>}
    </Strip>
  )
}

export default definePanel({ id: 'banner', title: 'Today', component: Banner })

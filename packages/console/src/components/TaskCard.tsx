import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'
import { PRIMARY_FILL, getTypeStyle, inkOf, projectOf, sessionLabel, shortAgo, soft, ticketLink } from '../config/types.js'
import { rowStatus, rowTone } from '../config/review.js'
import { copyText } from '../config/api.js'
import { HarnessBadge } from './HarnessBadge.js'
import { MemoryPill } from './MemoryPill.js'
import { Dot } from './Dot.js'
import { useTaskReview } from '../hooks/useTaskReview.js'

/* ── Small pieces ── */

export const TypeTile: FunctionComponent<{ type: string; size?: number; radius?: number; font?: number }> = ({ type, size = 28, radius = 9, font = 11 }) => {
  const s = getTypeStyle(type)
  return (
    <span
      class="grid place-items-center shrink-0"
      title={s.label}
      style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, background: s.fill, color: s.ink, fontSize: `${font}px`, fontWeight: 700 }}
    >
      {s.glyph}
    </span>
  )
}

export const LivePill: FunctionComponent = () => (
  <span class="inline-flex items-center shrink-0" style={{ gap: '5px', height: '20px', padding: '0 8px', borderRadius: 'var(--r-pill)', background: soft('--green'), color: inkOf('--green'), fontSize: '11px', fontWeight: 600 }}>
    <Dot size={5} color="var(--green)" live glow={false} />
    live
  </span>
)

export const Chip: FunctionComponent<{ label: string; href?: string }> = ({ label, href }) => {
  const style = { height: '20px', padding: '0 8px', borderRadius: 'var(--r-pill)', background: 'var(--well)', color: 'var(--ink-2)', fontSize: '11px' }
  return href
    ? (
      <a
        class="inline-flex items-center gap-1 shrink-0 hover:text-ink"
        style={style}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={href}
        onClick={(e: Event) => e.stopPropagation()}
        onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
      >
        {label} <span class="i-lucide-external-link" style={{ width: '10px', height: '10px' }} />
      </a>
    )
    : <span class="inline-flex items-center shrink-0" style={style}>{label}</span>
}

const TicketChip: FunctionComponent<{ session: CWSession }> = ({ session }) => {
  const ticket = ticketLink(session)
  return ticket && <Chip label={ticket.label} href={ticket.url} />
}

// a ticket stays reachable at every width, other sources hide with the row's meta
const SourceChip: FunctionComponent<{ session: CWSession }> = ({ session }) =>
  ticketLink(session) ? <TicketChip session={session} />
  : session.source ? <span class="task-chip contents"><Chip label={session.source} href={session.source_url} /></span>
  : null

const fallbackBranch = (s: CWSession): string | null =>
  s.type === 'review' ? `review/pr-${s.pr}` : s.type === 'loop' ? `loop/${s.task ?? 'loop'}` : s.type === 'task' ? `task/${s.task}` : null

// only task and review rows read review state
const ReviewedLine: FunctionComponent<{ session: CWSession; project?: string }> = ({ session, project }) => {
  const entry = useTaskReview(session)
  const branch = entry?.state?.branch ?? fallbackBranch(session)
  const status = !entry ? 'checking…' : entry.error !== null ? 'changes unknown' : rowStatus(entry.state)
  const tone = entry?.state && entry.error === null ? rowTone(entry.state) : null
  return <MetaLine branch={branch} status={status} project={project} tone={tone} />
}

const Sep: FunctionComponent = () => <span aria-hidden="true" style={{ color: 'var(--ink-4)' }}>·</span>

const StatusText: FunctionComponent<{ status: string; tone: string | null }> = ({ status, tone }) => {
  const dot = tone ? `var(${tone})` : status.includes('uncommitted') ? 'var(--ink-3)' : null
  return (
    <span class="inline-flex items-center whitespace-nowrap min-w-0" style={{ gap: '6px', fontSize: '12px', color: tone ? inkOf(tone) : 'var(--ink-2)' }}>
      {dot && <span class="shrink-0" style={{ width: '6px', height: '6px', borderRadius: '50%', background: dot }} />}
      <span class="truncate">{status}</span>
    </span>
  )
}

const MetaLine: FunctionComponent<{ branch: string | null; status: string; project?: string; tone?: string | null }> = ({ branch, status, project, tone = null }) => (
  <div class="task-meta flex items-center min-w-0" style={{ gap: '6px', marginTop: '2px' }}>
    {project && <><span class="shrink-0" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ink-2)' }}>{project}</span><Sep /></>}
    {branch === null
      ? <span class="mono" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>—</span>
      : (
        <button
          type="button"
          class="mono truncate min-w-0 cursor-copy hover:text-ink transition-colors duration-160"
          style={{ fontSize: '11px', color: 'var(--ink-3)', padding: 0, border: 0, background: 'transparent' }}
          title="Copy branch name"
          onClick={(e: Event) => { e.stopPropagation(); copyText(branch, 'Branch') }}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
        >
          {branch}
        </button>
      )}
    <Sep />
    <StatusText status={status} tone={tone} />
  </div>
)

const plainStatus = (s: CWSession): string =>
  s.type === 'loop' ? (s.loop_interval ? `every ${s.loop_interval}` : 'self-paced')
  : `${s.opens} session${s.opens === 1 ? '' : 's'}`

/* ── Active task row ── */

export const TaskRow: FunctionComponent<{
  session: CWSession
  isOpenInTab: boolean
  onSelect: () => void
  onMarkDone?: () => void | Promise<void>
  showProject?: boolean
  // the card's common harness; a row on it shows no badge
  defaultHarness?: string
}> = ({ session, isOpenInTab, onSelect, onMarkDone, showProject, defaultHarness }) => {
  const project = showProject ? projectOf(session) || 'no project' : undefined
  const [closing, setClosing] = useState(false)
  const reviewed = session.type === 'task' || session.type === 'review'
  // closing waits for cw --done, so the button stays busy and cannot send a second close
  const markDone = async () => {
    if (!onMarkDone || closing) return
    setClosing(true)
    try {
      await onMarkDone()
    } finally {
      setClosing(false)
    }
  }
  return (
    <div
      class="task-row group flex items-center cursor-pointer transition-colors duration-160 hover:bg-elev"
      style={{ gap: '13px', padding: '11px 15px' }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`${isOpenInTab ? 'Open' : 'Resume'} ${sessionLabel(session)}`}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() }
      }}
    >
      <TypeTile type={session.type} />
      <div class="flex-1 min-w-0">
        <div class="flex items-center min-w-0" style={{ gap: '8px' }}>
          <span class="truncate" style={{ fontSize: '14px', fontWeight: 600 }}>{sessionLabel(session)}</span>
          {isOpenInTab && session.status === 'active' && <LivePill />}
          <SourceChip session={session} />
        </div>
        {reviewed
          ? <ReviewedLine session={session} project={project} />
          : <MetaLine branch={fallbackBranch(session)} status={plainStatus(session)} project={project} />}
      </div>
      <MemoryPill project={projectOf(session)} />
      {(defaultHarness === undefined || (session.harness ?? 'claude') !== defaultHarness) && <HarnessBadge session={session} />}
      <span class="mono num shrink-0 text-right" style={{ width: '48px', fontSize: '12px', color: 'var(--ink-3)' }} title={new Date(session.last_opened).toLocaleString()}>
        {shortAgo(session.last_opened)}
      </span>
      {onMarkDone && (
        <button
          type="button"
          class={`task-done grid place-items-center shrink-0 cursor-pointer transition-all duration-180 ease-spring hover:text-green disabled:cursor-wait ${closing ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
          style={{ width: '28px', height: '28px', borderRadius: 'var(--r-sm)', border: 0, background: 'var(--card)', color: 'var(--ink-2)', boxShadow: 'var(--shadow-s)' }}
          onClick={(e: Event) => { e.stopPropagation(); void markDone() }}
          disabled={closing}
          title={closing ? 'Closing…' : 'Mark done'}
          aria-label="Mark done"
        >
          <span class={closing ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-check'} style={{ width: '14px', height: '14px' }} />
        </button>
      )}
      {/* decorative: the row itself is the button */}
      <span
        class={`${isOpenInTab ? '' : 'task-resume '}shrink-0 whitespace-nowrap`}
        style={isOpenInTab
          ? { padding: '5px 12px', borderRadius: 'var(--r-sm)', background: PRIMARY_FILL, color: 'var(--on-accent)', fontSize: '12.5px', fontWeight: 600, boxShadow: 'var(--shadow-primary)' }
          : { padding: '5px 10px', borderRadius: 'var(--r-sm)', background: 'transparent', color: 'var(--blue-ink)', fontSize: '12.5px', fontWeight: 600 }}
      >
        {isOpenInTab ? 'Open' : 'Resume'}
      </span>
    </div>
  )
}

/* ── Done row — quieter ── */

export const DoneRow: FunctionComponent<{ session: CWSession; onSelect: () => void }> = ({ session, onSelect }) => (
  <div
    class="done-row flex items-center cursor-pointer transition-colors duration-160 hover:bg-elev"
    style={{ gap: '12px', padding: '9px 15px', color: 'var(--ink-2)' }}
    onClick={onSelect}
    role="button"
    tabIndex={0}
    onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
  >
    <span class="grid place-items-center shrink-0" style={{ width: '22px', height: '22px', borderRadius: 'var(--r-xs)', background: 'var(--well)' }}>
      <span class="i-lucide-check" style={{ width: '12px', height: '12px' }} />
    </span>
    <span class="flex-1 min-w-0 truncate" style={{ fontSize: '13px' }}>
      {sessionLabel(session)} <span class="mono" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{projectOf(session)}</span>
    </span>
    <TicketChip session={session} />
    <span class="mono num shrink-0" style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{shortAgo(session.closed ?? session.last_opened)}</span>
  </div>
)

import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'
import { getTypeStyle, projectOf, sessionLabel, shortAgo, soft } from '../config/types.js'
import { rowStatus } from '../config/review.js'
import { copyText } from '../config/api.js'
import { HarnessBadge } from './HarnessBadge.js'
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
  <span class="inline-flex items-center shrink-0" style={{ gap: '5px', padding: '1px 8px', borderRadius: '99px', background: soft('--green'), color: 'var(--green)', fontSize: '11px', fontWeight: 600 }}>
    <Dot size={5} color="var(--green)" live glow={false} />
    live
  </span>
)

export const Chip: FunctionComponent<{ label: string; href?: string }> = ({ label, href }) => {
  const style = { padding: '1px 7px', borderRadius: '99px', background: 'var(--elev)', border: '1px solid var(--hair)', color: 'var(--ink-2)', fontSize: '11px' }
  return href
    ? <a class="shrink-0 hover:text-ink" style={style} href={href} target="_blank" rel="noopener noreferrer" onClick={(e: Event) => e.stopPropagation()}>{label}</a>
    : <span class="shrink-0" style={style}>{label}</span>
}

const fallbackBranch = (s: CWSession): string | null =>
  s.type === 'review' ? `review/pr-${s.pr}` : s.type === 'loop' ? `loop/${s.task ?? 'loop'}` : s.type === 'task' ? `task/${s.task}` : null

// only task and review rows read review state
const ReviewedLine: FunctionComponent<{ session: CWSession; project?: string }> = ({ session, project }) => {
  const entry = useTaskReview(session)
  const branch = entry?.state?.branch ?? fallbackBranch(session)
  const status = !entry ? 'checking…' : entry.error !== null ? 'changes unknown' : rowStatus(entry.state)
  return <MetaLine branch={branch} status={status} project={project} />
}

const MetaLine: FunctionComponent<{ branch: string | null; status: string; project?: string }> = ({ branch, status, project }) => (
  <div class="task-meta flex items-center min-w-0" style={{ gap: '9px', marginTop: '2px' }}>
    {project && <span class="shrink-0" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-2)' }}>{project}</span>}
    {branch === null
      ? <span class="mono" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>—</span>
      : (
        <button
          type="button"
          class="mono truncate min-w-0 cursor-copy hover:text-ink transition-colors duration-160"
          style={{ fontSize: '11.5px', color: 'var(--ink-3)', padding: 0, border: 0, background: 'transparent' }}
          title="Copy branch name"
          onClick={(e: Event) => { e.stopPropagation(); copyText(branch, 'Branch') }}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
        >
          {branch}
        </button>
      )}
    <span class="whitespace-nowrap truncate" style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{status}</span>
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
}> = ({ session, isOpenInTab, onSelect, onMarkDone, showProject }) => {
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
      style={{ gap: '13px', padding: '11px 15px', borderBottom: '1px solid var(--hair)' }}
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
          {session.source && <span class="task-chip contents"><Chip label={session.source} href={session.source_url} /></span>}
        </div>
        {reviewed
          ? <ReviewedLine session={session} project={project} />
          : <MetaLine branch={fallbackBranch(session)} status={plainStatus(session)} project={project} />}
      </div>
      <HarnessBadge session={session} />
      <span class="mono shrink-0 text-right" style={{ width: '52px', fontSize: '11.5px', color: 'var(--ink-3)' }} title={new Date(session.last_opened).toLocaleString()}>
        {shortAgo(session.last_opened)}
      </span>
      {onMarkDone && (
        <button
          type="button"
          class={`task-done grid place-items-center shrink-0 cursor-pointer transition-all duration-180 ease-spring hover:text-green disabled:cursor-wait ${closing ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
          style={{ width: '28px', height: '28px', borderRadius: '9px', border: '1px solid var(--hair)', background: 'var(--card)', color: 'var(--ink-2)' }}
          onClick={(e: Event) => { e.stopPropagation(); void markDone() }}
          disabled={closing}
          title={closing ? 'Closing…' : 'Mark done'}
          aria-label="Mark done"
        >
          <span class={closing ? 'i-lucide-loader-2 animate-spin' : 'i-lucide-check'} style={{ width: '14px', height: '14px' }} />
        </button>
      )}
      <span
        class="shrink-0 whitespace-nowrap"
        style={isOpenInTab
          ? { padding: '5px 11px', borderRadius: '9px', background: 'linear-gradient(180deg, var(--blue-2), var(--blue))', color: '#fff', fontSize: '12.5px', fontWeight: 600, boxShadow: 'var(--shadow-m)' }
          : { padding: '5px 11px', borderRadius: '9px', background: 'var(--elev)', color: 'var(--ink)', fontSize: '12.5px', fontWeight: 600 }}
      >
        {isOpenInTab ? 'Open' : 'Resume'}
      </span>
    </div>
  )
}

/* ── Done row — quieter ── */

export const DoneRow: FunctionComponent<{ session: CWSession; onSelect: () => void }> = ({ session, onSelect }) => (
  <div
    class="flex items-center cursor-pointer transition-colors duration-160 hover:bg-elev"
    style={{ gap: '12px', padding: '9px 15px', borderBottom: '1px solid var(--hair)', color: 'var(--ink-2)' }}
    onClick={onSelect}
    role="button"
    tabIndex={0}
    onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
  >
    <span class="grid place-items-center shrink-0" style={{ width: '22px', height: '22px', borderRadius: '7px', background: 'var(--elev)' }}>
      <span class="i-lucide-check" style={{ width: '12px', height: '12px' }} />
    </span>
    <span class="flex-1 min-w-0 truncate" style={{ fontSize: '13px' }}>
      {sessionLabel(session)} <span class="mono" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>{projectOf(session)}</span>
    </span>
    <span class="mono shrink-0" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>{shortAgo(session.closed ?? session.last_opened)}</span>
  </div>
)

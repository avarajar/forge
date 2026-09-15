import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import type { CWSession } from '@forge-dev/core'
import { getTypeStyle, sessionLabel, timeAgo } from '../config/types.js'
import { HarnessBadge } from './HarnessBadge.js'
import { reviewEntries, reviewKeyOf, useTaskReview } from '../hooks/useTaskReview.js'

/* ── Small UI pieces ── */

export const TypeBadge: FunctionComponent<{ type: string }> = ({ type }) => {
  const s = getTypeStyle(type)
  return (
    <span
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border"
      style={{ backgroundColor: s.bgVar, borderColor: s.borderVar, color: s.color }}
    >
      <span class={`w-1.5 h-1.5 rounded-full ${s.dotClass}`} />
      {s.label}
    </span>
  )
}

export const AccountBadge: FunctionComponent<{ account: string }> = ({ account }) => (
  <span
    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-forge-muted"
    style={{ backgroundColor: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}
  >
    {account}
  </span>
)

export const ProjectPill: FunctionComponent<{ name: string }> = ({ name }) => (
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-forge-surface text-forge-muted truncate max-w-[160px]"
    style={{ border: '1px solid var(--forge-ghost-border)' }}
  >
    {name}
  </span>
)

export const LoopIntervalChip: FunctionComponent<{ interval?: string }> = ({ interval }) => (
  <span
    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
    style={{ color: getTypeStyle('loop').color, backgroundColor: 'var(--forge-tint-rose-bg)', border: '1px solid var(--forge-tint-rose-border)' }}
  >
    ⟳ {interval || 'auto'}
  </span>
)

const SourceLink: FunctionComponent<{ source?: string; url?: string }> = ({ source, url }) => {
  if (!source && !url) return null
  const label = source ?? 'link'
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        class="text-[11px] text-forge-accent hover:underline underline-offset-2 transition-colors"
        style={{ opacity: 0.7 }}
        onClick={(e: Event) => e.stopPropagation()}
      >
        {label}
      </a>
    )
  }
  return <span class="text-[11px] text-forge-muted">{label}</span>
}

/* ── Pull request chip ── */

const PR_CHIP_STYLES = {
  OPEN: { color: 'var(--forge-success)', bg: 'var(--forge-tint-emerald-bg)' },
  DRAFT: { color: 'var(--forge-muted)', bg: 'var(--forge-ghost-bg)' },
  MERGED: { color: '#a855f7', bg: 'var(--forge-tint-purple-bg)' },
  CLOSED: { color: 'var(--forge-error)', bg: 'var(--forge-tint-rose-bg)' },
} as const

const CHECKS_MARK = { passing: ' ✓', failing: ' ✗', pending: ' …', none: '' } as const

// its own component so only task and review cards fetch review state
const PrChip: FunctionComponent<{ session: CWSession }> = ({ session }) => {
  const entry = useTaskReview(session)
  const pr = entry?.state?.pr
  if (!pr || pr.status !== 'found') return null
  const kind = pr.state === 'OPEN' && pr.isDraft ? 'DRAFT' : pr.state
  const style = PR_CHIP_STYLES[kind]
  return (
    <span
      class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
      style={{ color: style.color, backgroundColor: style.bg }}
      title={pr.url}
    >
      PR #{pr.number}{pr.state === 'MERGED' ? ' merged' : ''}{CHECKS_MARK[pr.checks]}
    </span>
  )
}

/* ── Active task card ── */

export const TaskCard: FunctionComponent<{
  session: CWSession
  showAccount: boolean
  isOpenInTab: boolean
  onSelect: () => void
  onMarkDone?: () => void
}> = ({ session, showAccount, isOpenInTab, onSelect, onMarkDone }) => {
  const style = getTypeStyle(session.type)
  const [hovered, setHovered] = useState(false)
  const reviewed = session.type === 'task' || session.type === 'review'
  const reviewPr = reviewEntries.value[reviewKeyOf(session)]?.state?.pr
  const merged = reviewPr?.status === 'found' && reviewPr.state === 'MERGED'
  return (
    <div
      class="group relative flex items-center gap-4 p-4 rounded-xl bg-forge-surface cursor-pointer transition-all"
      style={{
        border: `1px solid ${hovered ? style.borderVar : 'var(--forge-ghost-border)'}`,
        boxShadow: hovered ? '0 10px 15px -3px rgba(99,102,241,0.05)' : undefined,
      }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onSelect() }}
    >
      <div class="shrink-0">
        <TypeBadge type={session.type} />
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2.5 mb-1">
          <span class="font-semibold text-sm text-forge-text truncate">
            {sessionLabel(session)}
          </span>
          <ProjectPill name={session.project} />
          {session.type === 'loop' && <LoopIntervalChip interval={session.loop_interval} />}
          {showAccount && session.account && (
            <AccountBadge account={session.account} />
          )}
        </div>
        <div class="flex items-center gap-3">
          {session.opens > 0 && (
            <span class="text-[11px] text-forge-muted">
              {session.opens} session{session.opens !== 1 ? 's' : ''}
            </span>
          )}
          <SourceLink source={session.source} url={session.source_url} />
          {reviewed && <PrChip session={session} />}
        </div>
      </div>

      <div class="shrink-0 flex items-center gap-4">
        <HarnessBadge session={session} />
        <span class="text-xs text-forge-muted whitespace-nowrap">
          {timeAgo(session.last_opened)}
        </span>
        {onMarkDone && (
          <button
            class={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors text-forge-muted hover:text-forge-success ${merged ? '' : 'opacity-0 group-hover:opacity-100'}`}
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={(e: Event) => { e.stopPropagation(); onMarkDone() }}
            title="Mark as done"
          >
            ✓ Done
          </button>
        )}
        {isOpenInTab ? (
          <span
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
            style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: 'var(--forge-accent)', borderColor: 'rgba(99,102,241,0.25)' }}
          >
            <span class="w-1.5 h-1.5 rounded-full bg-forge-accent animate-pulse" />
            Open
          </span>
        ) : (
          <span
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
            style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--forge-success)', borderColor: 'rgba(16,185,129,0.2)' }}
          >
            &#9658; Resume
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Done task row — quieter style ── */

export const DoneTaskRow: FunctionComponent<{
  session: CWSession
  showAccount: boolean
  onSelect: () => void
}> = ({ session, showAccount, onSelect }) => {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      class="group flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all"
      style={{ backgroundColor: hovered ? 'var(--forge-ghost-hover)' : undefined }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onSelect() }}
    >
      <div class="shrink-0 opacity-50">
        <TypeBadge type={session.type} />
      </div>
      <div class="flex-1 min-w-0 flex items-center gap-2.5">
        <span class="text-sm text-forge-muted truncate">{sessionLabel(session)}</span>
        <ProjectPill name={session.project} />
        {session.type === 'loop' && <LoopIntervalChip interval={session.loop_interval} />}
        {showAccount && session.account && (
          <AccountBadge account={session.account} />
        )}
      </div>
      <div class="shrink-0 flex items-center gap-3">
        <HarnessBadge session={session} muted />
        <span class="text-[11px] text-forge-muted">
          {session.opens} session{session.opens !== 1 ? 's' : ''}
        </span>
        <span class="text-xs text-forge-muted">
          {timeAgo(session.last_opened)}
        </span>
      </div>
    </div>
  )
}

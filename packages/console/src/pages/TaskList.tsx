import { type FunctionComponent } from 'preact'
import { useMemo } from 'preact/hooks'
import { ActionButton } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TaskListProps {
  spaces: CWSession[]
  allSpaces: CWSession[]
  loading: boolean
  onNewTask: (type?: string) => void
  onSelectTask: (session: CWSession) => void
  onRefresh: () => void
  projectNames: string[]
  filterProject: string | null
  onFilterProject: (p: string | null) => void
  filterType: string | null
  onFilterType: (t: string | null) => void
  showDone: boolean
  onShowDone: (v: boolean) => void
}

/* ------------------------------------------------------------------ */
/*  Type config — colors, labels                                       */
/* ------------------------------------------------------------------ */

interface TypeStyle {
  label: string
  bg: string
  text: string
  border: string
  dot: string
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  task: {
    label: 'DEV',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
    dot: 'bg-amber-400',
  },
  review: {
    label: 'REVIEW',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
    dot: 'bg-blue-400',
  },
  design: {
    label: 'DESIGN',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
    dot: 'bg-purple-400',
  },
  plan: {
    label: 'PLAN',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/20',
    dot: 'bg-cyan-400',
  },
}

const getTypeStyle = (type: string): TypeStyle =>
  TYPE_STYLES[type] ?? TYPE_STYLES['task']

/* ------------------------------------------------------------------ */
/*  Quick‑launch type pills                                            */
/* ------------------------------------------------------------------ */

const QUICK_TYPES = [
  { key: 'dev', label: 'Dev', style: TYPE_STYLES['task'] },
  { key: 'design', label: 'Design', style: TYPE_STYLES['design'] },
  { key: 'review', label: 'Review', style: TYPE_STYLES['review'] },
  { key: 'plan', label: 'Plan', style: TYPE_STYLES['plan'] },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const taskName = (s: CWSession): string => {
  if (s.type === 'review') return `PR #${s.pr}`
  return s.task ?? 'unknown'
}

const timeAgo = (date: string): string => {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/* ------------------------------------------------------------------ */
/*  Sub‑components                                                     */
/* ------------------------------------------------------------------ */

/** Colored type badge */
const TypeBadge: FunctionComponent<{ type: string }> = ({ type }) => {
  const s = getTypeStyle(type)
  return (
    <span
      class={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${s.bg} ${s.text} ${s.border} border`}
    >
      <span class={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

/** Project pill */
const ProjectPill: FunctionComponent<{ name: string }> = ({ name }) => (
  <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-forge-surface text-forge-muted border border-forge-border/60 truncate max-w-[160px]">
    {name}
  </span>
)

/** Source link (Linear / GitHub) */
const SourceLink: FunctionComponent<{ source?: string; url?: string }> = ({ source, url }) => {
  if (!source && !url) return null
  const label = source ?? 'link'
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        class="text-[11px] text-forge-accent/70 hover:text-forge-accent underline-offset-2 hover:underline transition-colors"
        onClick={(e: Event) => e.stopPropagation()}
      >
        {label}
      </a>
    )
  }
  return <span class="text-[11px] text-forge-muted">{label}</span>
}

/** Active task card */
const TaskCard: FunctionComponent<{
  session: CWSession
  onSelect: () => void
}> = ({ session, onSelect }) => {
  const style = getTypeStyle(session.type)
  return (
    <div
      class={`group relative flex items-center gap-4 p-4 rounded-xl bg-forge-surface border border-forge-border/60 hover:border-${style.text.replace('text-', '')}/40 cursor-pointer transition-all hover:shadow-lg hover:shadow-forge-accent/5`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onSelect() }}
    >
      {/* Left: type badge */}
      <div class="shrink-0">
        <TypeBadge type={session.type} />
      </div>

      {/* Center: title + meta */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2.5 mb-1">
          <span class="font-semibold text-sm text-forge-text truncate">
            {taskName(session)}
          </span>
          <ProjectPill name={session.project} />
        </div>
        <div class="flex items-center gap-3">
          {session.opens > 0 && (
            <span class="text-[11px] text-forge-muted">
              {session.opens} session{session.opens !== 1 ? 's' : ''}
            </span>
          )}
          <SourceLink source={session.source} url={session.source_url} />
        </div>
      </div>

      {/* Right: time + resume */}
      <div class="shrink-0 flex items-center gap-4">
        <span class="text-xs text-forge-muted whitespace-nowrap">
          {timeAgo(session.last_opened)}
        </span>
        <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-forge-success/10 text-forge-success border border-forge-success/20 group-hover:bg-forge-success/20 transition-colors">
          &#9654; Resume
        </span>
      </div>
    </div>
  )
}

/** Done task row — quieter style */
const DoneTaskRow: FunctionComponent<{
  session: CWSession
  onSelect: () => void
}> = ({ session, onSelect }) => (
  <div
    class="group flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-forge-surface/60 cursor-pointer transition-all"
    onClick={onSelect}
    role="button"
    tabIndex={0}
    onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onSelect() }}
  >
    <div class="shrink-0 opacity-50">
      <TypeBadge type={session.type} />
    </div>
    <div class="flex-1 min-w-0 flex items-center gap-2.5">
      <span class="text-sm text-forge-muted truncate">{taskName(session)}</span>
      <ProjectPill name={session.project} />
    </div>
    <div class="shrink-0 flex items-center gap-3">
      <span class="text-[11px] text-forge-muted">
        {session.opens} session{session.opens !== 1 ? 's' : ''}
      </span>
      <span class="text-xs text-forge-muted">
        {timeAgo(session.last_opened)}
      </span>
    </div>
  </div>
)

/** Filter pill toggle */
const FilterPill: FunctionComponent<{
  label: string
  active: boolean
  onClick: () => void
  style?: TypeStyle
}> = ({ label, active, onClick, style }) => {
  if (active && style) {
    return (
      <button
        class={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${style.bg} ${style.text} ${style.border}`}
        onClick={onClick}
      >
        {label}
      </button>
    )
  }
  return (
    <button
      class={`px-3 py-1.5 text-xs rounded-lg border transition-all
        ${active
          ? 'bg-forge-accent/10 text-forge-accent border-forge-accent/30 font-semibold'
          : 'bg-forge-surface/50 border-forge-border/60 text-forge-muted hover:text-forge-text hover:border-forge-border'
        }`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const TaskList: FunctionComponent<TaskListProps> = ({
  spaces,
  allSpaces,
  loading: _loading,
  onNewTask,
  onSelectTask,
  onRefresh,
  projectNames,
  filterProject,
  onFilterProject,
  filterType,
  onFilterType,
  showDone,
  onShowDone,
}) => {
  const active = useMemo(() => spaces.filter(s => s.status === 'active'), [spaces])
  const done = useMemo(() => spaces.filter(s => s.status === 'done').slice(0, 15), [spaces])

  // Counts (from all spaces, before filtering)
  const totalActive = useMemo(() => allSpaces.filter(s => s.status === 'active').length, [allSpaces])
  const totalDone = useMemo(() => allSpaces.filter(s => s.status === 'done').length, [allSpaces])

  if (allSpaces.length === 0) {
    return null // onboarding shown by parent
  }

  const hasActiveFilters = filterProject !== null || filterType !== null

  return (
    <div>
      {/* ---- Header row: title + new task ---- */}
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-forge-text">Tasks</h2>
          <p class="text-sm text-forge-muted mt-0.5">
            {totalActive} active{totalDone > 0 ? ` \u00B7 ${totalDone} done` : ''}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="px-3 py-2 text-xs rounded-lg text-forge-muted hover:text-forge-text hover:bg-forge-surface border border-forge-border/40 hover:border-forge-border transition-all"
            onClick={onRefresh}
          >
            Refresh
          </button>
          <ActionButton label="+ New Task" variant="primary" onClick={() => onNewTask()} />
        </div>
      </div>

      {/* ---- Quick-launch type pills ---- */}
      <div class="flex items-center gap-2 mb-5">
        <span class="text-[11px] text-forge-muted uppercase tracking-wider mr-1">Quick:</span>
        {QUICK_TYPES.map(t => (
          <button
            key={t.key}
            class={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${t.style.bg} ${t.style.text} ${t.style.border} hover:opacity-80`}
            onClick={() => onNewTask(t.key)}
          >
            + {t.label}
          </button>
        ))}
      </div>

      {/* ---- Filter bar ---- */}
      <div class="flex flex-wrap items-center gap-2.5 mb-6 pb-5 border-b border-forge-border/40">
        {/* Project filter */}
        <select
          class="px-3 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border/60 text-forge-text appearance-none cursor-pointer min-w-[140px] hover:border-forge-border transition-colors"
          value={filterProject ?? ''}
          onChange={(e: Event) => {
            const val = (e.target as HTMLSelectElement).value
            onFilterProject(val || null)
          }}
        >
          <option value="">All projects</option>
          {projectNames.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Type filter pills */}
        <div class="flex items-center gap-1.5 ml-1">
          {QUICK_TYPES.map(t => (
            <FilterPill
              key={t.key}
              label={t.label}
              active={filterType === t.key}
              style={t.style}
              onClick={() => onFilterType(filterType === t.key ? null : t.key)}
            />
          ))}
        </div>

        {/* Spacer */}
        <div class="flex-1" />

        {/* Show done toggle */}
        <button
          class={`px-3 py-1.5 text-xs rounded-lg border transition-all
            ${showDone
              ? 'bg-forge-accent/10 text-forge-accent border-forge-accent/30 font-semibold'
              : 'bg-forge-surface/50 border-forge-border/60 text-forge-muted hover:text-forge-text hover:border-forge-border'
            }`}
          onClick={() => onShowDone(!showDone)}
        >
          {showDone ? 'Hide done' : 'Show done'}
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            class="px-2.5 py-1.5 text-[11px] text-forge-muted hover:text-forge-error transition-colors"
            onClick={() => { onFilterProject(null); onFilterType(null) }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ---- Active tasks ---- */}
      {active.length > 0 && (
        <div class="mb-8">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2 h-2 rounded-full bg-forge-success animate-pulse" />
            <span class="text-xs font-semibold text-forge-muted uppercase tracking-wider">
              Active
            </span>
            <span class="text-xs text-forge-muted">
              {active.length} task{active.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div class="space-y-2.5">
            {active.map(s => (
              <TaskCard
                key={`${s.project}-${s.task ?? s.pr}-active`}
                session={s}
                onSelect={() => onSelectTask(s)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- No active results ---- */}
      {active.length === 0 && !showDone && (
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <span class="text-3xl mb-3 opacity-40">&#128269;</span>
          <p class="text-sm text-forge-muted">
            {hasActiveFilters
              ? 'No active tasks match your filters.'
              : 'No active tasks. Start something new!'}
          </p>
          {hasActiveFilters && (
            <button
              class="mt-3 text-xs text-forge-accent hover:underline"
              onClick={() => { onFilterProject(null); onFilterType(null) }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ---- Done tasks ---- */}
      {showDone && done.length > 0 && (
        <div>
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2 h-2 rounded-full bg-forge-muted" />
            <span class="text-xs font-semibold text-forge-muted uppercase tracking-wider">
              Done
            </span>
            <span class="text-xs text-forge-muted">
              {done.length}{totalDone > done.length ? ` of ${totalDone}` : ''}
            </span>
          </div>
          <div class="space-y-0.5">
            {done.map(s => (
              <DoneTaskRow
                key={`${s.project}-${s.task ?? s.pr}-done`}
                session={s}
                onSelect={() => onSelectTask(s)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

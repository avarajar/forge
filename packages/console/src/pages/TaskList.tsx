import { type FunctionComponent } from 'preact'
import { useMemo, useState, useEffect } from 'preact/hooks'
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
  onCreateProject: () => void
  onSelectTask: (session: CWSession) => void
  onRefresh: () => void
  accountNames: string[]
  filterAccount: string | null
  onFilterAccount: (a: string | null) => void
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
  bgRgba: string
  borderRgba: string
  textColor: string
}

const TYPE_STYLES: Record<string, TypeStyle> = {
  task: {
    label: 'DEV',
    bg: 'bg-amber-500/10',
    text: '',
    border: 'border-amber-500/20',
    dot: 'bg-amber-500',
    bgRgba: 'var(--forge-tint-amber-bg)',
    borderRgba: 'var(--forge-tint-amber-border)',
    textColor: '#d97706',
  },
  review: {
    label: 'REVIEW',
    bg: 'bg-blue-500/10',
    text: '',
    border: 'border-blue-500/20',
    dot: 'bg-blue-500',
    bgRgba: 'var(--forge-tint-blue-bg)',
    borderRgba: 'var(--forge-tint-blue-border)',
    textColor: '#2563eb',
  },
  design: {
    label: 'DESIGN',
    bg: 'bg-purple-500/10',
    text: '',
    border: 'border-purple-500/20',
    dot: 'bg-purple-500',
    bgRgba: 'var(--forge-tint-purple-bg)',
    borderRgba: 'var(--forge-tint-purple-border)',
    textColor: '#7c3aed',
  },
  plan: {
    label: 'PLAN',
    bg: 'bg-cyan-500/10',
    text: '',
    border: 'border-cyan-500/20',
    dot: 'bg-cyan-500',
    bgRgba: 'var(--forge-tint-cyan-bg)',
    borderRgba: 'var(--forge-tint-cyan-border)',
    textColor: '#0891b2',
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
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border"
      style={{ backgroundColor: s.bgRgba, borderColor: s.borderRgba, color: s.textColor }}
    >
      <span class={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

/** Account badge — small pill shown on task cards */
const AccountBadge: FunctionComponent<{ account: string }> = ({ account }) => (
  <span
    class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-forge-muted"
    style={{ backgroundColor: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}
  >
    {account}
  </span>
)

/** Project pill */
const ProjectPill: FunctionComponent<{ name: string }> = ({ name }) => (
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-forge-surface text-forge-muted truncate max-w-[160px]"
    style={{ border: '1px solid var(--forge-ghost-border)' }}
  >
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

/** Active task card */
const TaskCard: FunctionComponent<{
  session: CWSession
  showAccount: boolean
  onSelect: () => void
}> = ({ session, showAccount, onSelect }) => {
  const style = getTypeStyle(session.type)
  const [hovered, setHovered] = useState(false)
  return (
    <div
      class="group relative flex items-center gap-4 p-4 rounded-xl bg-forge-surface cursor-pointer transition-all"
      style={{
        border: `1px solid ${hovered ? style.borderRgba : 'var(--forge-ghost-border)'}`,
        boxShadow: hovered ? '0 10px 15px -3px rgba(99,102,241,0.05)' : undefined,
      }}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
        </div>
      </div>

      {/* Right: time + resume */}
      <div class="shrink-0 flex items-center gap-4">
        <span class="text-xs text-forge-muted whitespace-nowrap">
          {timeAgo(session.last_opened)}
        </span>
        <span
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
          style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: 'var(--forge-success)', borderColor: 'rgba(16,185,129,0.2)' }}
        >
          &#9658; Resume
        </span>
      </div>
    </div>
  )
}

/** Done task row — quieter style */
const DoneTaskRow: FunctionComponent<{
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
        <span class="text-sm text-forge-muted truncate">{taskName(session)}</span>
        <ProjectPill name={session.project} />
        {showAccount && session.account && (
          <AccountBadge account={session.account} />
        )}
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
}

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
        class="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all"
        style={{ backgroundColor: style.bgRgba, borderColor: style.borderRgba, color: style.textColor }}
        onClick={onClick}
      >
        {label}
      </button>
    )
  }
  if (active) {
    // active but no type style (e.g. "All" pill): use forge-accent
    return (
      <button
        class="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all text-forge-accent"
        style={{ backgroundColor: 'var(--forge-tint-accent-bg)', borderColor: 'var(--forge-tint-accent-border)' }}
        onClick={onClick}
      >
        {label}
      </button>
    )
  }
  return (
    <button
      class="px-3 py-1.5 text-xs rounded-lg border transition-all text-forge-muted hover:text-forge-text hover:border-forge-border"
      style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Project info banner (shown when a project is filtered)            */
/* ------------------------------------------------------------------ */

interface ProjectInfo {
  stack: Record<string, unknown> | null
  mcps: { global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] } | null
}

const ProjectBanner: FunctionComponent<{ project: string; account?: string; onDeleted?: () => void }> = ({ project, account, onDeleted }) => {
  const [info, setInfo] = useState<ProjectInfo>({ stack: null, mcps: null })
  const [showDelete, setShowDelete] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/cw/detect/${project}`).then(r => r.json()).catch(() => null),
      fetch(`/api/cw/mcps?project=${project}`).then(r => r.json()).catch(() => null),
    ]).then(([stack, mcps]) => {
      if (!cancelled) setInfo({ stack, mcps })
    })
    return () => { cancelled = true }
  }, [project])

  const stackParts: string[] = []
  if (info.stack) {
    if (info.stack.framework) stackParts.push(String(info.stack.framework))
    if (info.stack.testRunner) stackParts.push(String(info.stack.testRunner))
    if (info.stack.hasTailwind) stackParts.push('Tailwind')
    if (info.stack.hasShadcn) stackParts.push('shadcn')
    if (info.stack.hasPlaywright) stackParts.push('Playwright')
    if (info.stack.hasDockerfile) stackParts.push('Docker')
  }

  const globalMcps = info.mcps ? Object.keys(info.mcps.global) : []
  const projectMcps = info.mcps?.project ?? []
  const cwMcps = info.mcps?.cw ?? []
  const plugins = info.mcps?.plugins ?? []
  const allMcps = [...projectMcps.map(m => `${m} (project)`), ...globalMcps, ...cwMcps.map(m => `${m} (CW)`)]

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/cw/delete-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, deleteFiles })
      })
      const result = await res.json() as { ok: boolean }
      if (result.ok) {
        const { showToast } = await import('@forge-dev/ui')
        showToast(`Project "${project}" deleted${deleteFiles ? ' (files removed)' : ''}`, 'info')
        onDeleted?.()
      }
    } catch {
      const { showToast } = await import('@forge-dev/ui')
      showToast('Failed to delete project', 'error')
    } finally {
      setDeleting(false)
      setShowDelete(false)
    }
  }

  if (!info.stack && !info.mcps) return null

  return (
    <div
      class="rounded-xl px-4 py-3 mb-5 text-sm"
      style={{ backgroundColor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}
    >
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-forge-accent uppercase tracking-wider">Project:</span>
          <span class="font-semibold text-forge-text">{project}</span>
          {account && (
            <span class="text-xs text-forge-muted" style={{ opacity: 0.7 }}>({account})</span>
          )}
        </div>
        <button
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors"
          style={showDelete
            ? { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--forge-error)' }
            : { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)', color: 'var(--forge-error)', opacity: 0.75 }
          }
          onClick={() => setShowDelete(!showDelete)}
        >
          ⚠ Delete project
        </button>
      </div>

      {/* Delete confirmation */}
      {showDelete && (
        <div class="rounded-lg p-3 mb-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p class="text-xs text-forge-text mb-2">Are you sure? This will unregister "{project}" from CW.</p>
          <label class="flex items-center gap-2 text-xs text-forge-muted mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles((e.target as HTMLInputElement).checked)}
            />
            Also delete project files from disk
          </label>
          {deleteFiles && (
            <p class="text-xs mb-3" style={{ color: 'var(--forge-error)' }}>
              This will permanently delete all files. This cannot be undone.
            </p>
          )}
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 text-xs rounded-lg text-white font-medium transition-colors"
              style={{ backgroundColor: 'var(--forge-error)' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : deleteFiles ? 'Delete project + files' : 'Unregister project'}
            </button>
            <button
              class="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
              style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
              onClick={() => { setShowDelete(false); setDeleteFiles(false) }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {stackParts.length > 0 && (
        <div class="flex items-center gap-1.5 text-xs text-forge-muted flex-wrap">
          <span class="text-forge-muted opacity-70">Stack:</span>
          {stackParts.map((s, i) => (
            <span key={s}>
              <span class="text-forge-text">{s}</span>
              {i < stackParts.length - 1 && <span class="text-forge-muted">,</span>}
            </span>
          ))}
        </div>
      )}
      {allMcps.length > 0 && (
        <div class="flex items-center gap-1.5 text-xs text-forge-muted mt-0.5 flex-wrap">
          <span class="text-forge-muted opacity-70">MCPs:</span>
          <span class="text-forge-text">{allMcps.join(' | ')}</span>
        </div>
      )}
      {plugins.length > 0 && (
        <div class="flex items-center gap-1.5 text-xs text-forge-muted mt-0.5 flex-wrap">
          <span class="text-forge-muted opacity-70">Plugins:</span>
          <span class="text-forge-text">{plugins.join(' | ')}</span>
        </div>
      )}
    </div>
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
  onCreateProject,
  onSelectTask,
  onRefresh,
  accountNames,
  filterAccount,
  onFilterAccount,
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

  // Show account badge when not filtered to a single account
  const showAccount = filterAccount === null && accountNames.length > 1

  // Find account for the currently selected project (for banner)
  const projectAccount = useMemo(() => {
    if (!filterProject) return undefined
    return spaces.find(s => s.project === filterProject)?.account
  }, [filterProject, spaces])

  if (allSpaces.length === 0) {
    return null // onboarding shown by parent
  }

  const hasActiveFilters = filterAccount !== null || filterProject !== null || filterType !== null

  return (
    <div>
      {/* ---- Header row: title + actions ---- */}
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-forge-text">Tasks</h2>
          <p class="text-sm text-forge-muted mt-0.5">
            {totalActive} active{totalDone > 0 ? ` \u00B7 ${totalDone} done` : ''}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <button
            class="px-3 py-2 text-xs rounded-lg text-forge-muted hover:text-forge-text hover:bg-forge-surface border border-forge-border hover:border-forge-border transition-all"
            style={{ borderColor: 'var(--forge-ghost-border)' }}
            onClick={onRefresh}
          >
            Refresh
          </button>
          {/* Create Project — separate from task creation */}
          <button
            class="px-3 py-2 text-xs rounded-lg border transition-all text-forge-muted hover:text-forge-text hover:bg-forge-surface"
            style={{ borderColor: 'var(--forge-ghost-border)' }}
            onClick={onCreateProject}
          >
            + Project
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
            class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:opacity-80"
            style={{ backgroundColor: t.style.bgRgba, borderColor: t.style.borderRgba, color: t.style.textColor }}
            onClick={() => onNewTask(t.key)}
          >
            + {t.label}
          </button>
        ))}
      </div>

      {/* ---- Filter bar ---- */}
      <div
        class="flex flex-wrap items-center gap-2.5 mb-6 pb-5"
        style={{ borderBottom: '1px solid var(--forge-ghost-border)' }}
      >
        {/* Account filter — shown only when there are multiple accounts */}
        {accountNames.length > 1 && (
          <select
            class="px-3 py-1.5 text-xs rounded-lg bg-forge-surface border text-forge-text appearance-none cursor-pointer min-w-[130px] hover:border-forge-border transition-colors"
            style={filterAccount
              ? { borderColor: 'rgba(99,102,241,0.4)', backgroundColor: 'rgba(99,102,241,0.06)' }
              : { borderColor: 'var(--forge-ghost-border)' }
            }
            value={filterAccount ?? ''}
            onChange={(e: Event) => {
              const val = (e.target as HTMLSelectElement).value
              onFilterAccount(val || null)
            }}
          >
            <option value="">All accounts</option>
            {accountNames.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        )}

        {/* Project filter */}
        <select
          class="px-3 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-text appearance-none cursor-pointer min-w-[140px] hover:border-forge-border transition-colors"
          style={{ borderColor: 'var(--forge-ghost-border)' }}
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
          class={`px-3 py-1.5 text-xs rounded-lg border transition-all ${showDone ? 'text-forge-accent font-semibold' : 'text-forge-muted hover:text-forge-text hover:border-forge-border'}`}
          style={showDone
            ? { backgroundColor: 'var(--forge-tint-accent-bg)', borderColor: 'var(--forge-tint-accent-border)' }
            : { backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }
          }
          onClick={() => onShowDone(!showDone)}
        >
          {showDone ? 'Hide done' : 'Show done'}
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            class="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={() => { onFilterAccount(null); onFilterProject(null); onFilterType(null) }}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {/* ---- Project info banner (when project is filtered) ---- */}
      {filterProject && <ProjectBanner project={filterProject} account={projectAccount} onDeleted={() => { onFilterProject(null); onRefresh() }} />}

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
                showAccount={showAccount}
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
              class="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
              style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
              onClick={() => { onFilterAccount(null); onFilterProject(null); onFilterType(null) }}
            >
              ✕ Clear filters
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
                showAccount={showAccount}
                onSelect={() => onSelectTask(s)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

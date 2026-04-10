import { type FunctionComponent } from 'preact'
import { useState, useMemo } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { TYPE_STYLES, QUICK_TYPES, sessionKey, type TypeStyle } from '../config/types.js'
import { TaskCard, DoneTaskRow } from '../components/TaskCard.js'
import { ProjectBanner } from '../components/ProjectBanner.js'

const AccountBanner: FunctionComponent<{ account: string; onDeleted: () => void }> = ({ account, onDeleted }) => {
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/cw/accounts/${encodeURIComponent(account)}`, { method: 'DELETE' })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast(`Account "${account}" removed`, 'info')
        onDeleted()
      } else {
        showToast(result.error ?? 'Failed to remove account', 'error')
      }
    } catch {
      showToast('Failed to remove account', 'error')
    } finally {
      setDeleting(false)
      setShowDelete(false)
    }
  }

  return (
    <div
      class="rounded-xl px-4 py-3 mb-5 text-sm"
      style={{ backgroundColor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-forge-accent uppercase tracking-wider">Account:</span>
          <span class="font-semibold text-forge-text">{account}</span>
        </div>
        <button
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors"
          style={showDelete
            ? { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--forge-error)' }
            : { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)', color: 'var(--forge-error)', opacity: 0.75 }
          }
          onClick={() => setShowDelete(!showDelete)}
        >
          ⚠ Remove account
        </button>
      </div>
      {showDelete && (
        <div class="rounded-lg p-3 mt-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p class="text-xs text-forge-text mb-3">
            Remove account "{account}"? This deletes the account profile and Claude config.
            Projects registered under this account are not deleted.
          </p>
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 text-xs rounded-lg text-white font-medium"
              style={{ backgroundColor: 'var(--forge-error)' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Removing...' : 'Remove account'}
            </button>
            <button
              class="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
              style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
              onClick={() => setShowDelete(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const QuickTypePills: FunctionComponent<{ onNewTask: (type: string) => void }> = ({ onNewTask }) => (
  <div class="flex items-center gap-2">
    {QUICK_TYPES.map(t => (
      <button
        key={t.key}
        class="px-3 py-1.5 text-xs font-medium rounded-lg border transition-all hover:opacity-80"
        style={{ backgroundColor: t.style.bgVar, borderColor: t.style.borderVar, color: t.style.color }}
        onClick={() => onNewTask(t.key)}
      >
        + {t.label}
      </button>
    ))}
  </div>
)

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TaskListProps {
  spaces: CWSession[]
  allSpaces: CWSession[]
  loading: boolean
  onNewTask: (type?: string) => void
  onCreateProject: () => void
  onCreateAccount: () => void
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
  openTabKeys?: Set<string>
  onMarkDone?: (session: CWSession) => void
  onSkills?: () => void
}

/* ------------------------------------------------------------------ */
/*  Filter pill                                                        */
/* ------------------------------------------------------------------ */

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
        style={{ backgroundColor: style.bgVar, borderColor: style.borderVar, color: style.color }}
        onClick={onClick}
      >
        {label}
      </button>
    )
  }
  if (active) {
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
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const TaskList: FunctionComponent<TaskListProps> = ({
  spaces,
  allSpaces,
  loading: _loading,
  onNewTask,
  onCreateProject,
  onCreateAccount,
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
  openTabKeys,
  onMarkDone,
  onSkills,
}) => {
  const active = useMemo(() => spaces.filter(s => s.status === 'active'), [spaces])
  const done = useMemo(() => spaces.filter(s => s.status === 'done').slice(0, 15), [spaces])

  const totalActive = useMemo(() => allSpaces.filter(s => s.status === 'active').length, [allSpaces])
  const totalDone = useMemo(() => allSpaces.filter(s => s.status === 'done').length, [allSpaces])

  const showAccount = filterAccount === null && accountNames.length > 1

  const projectAccount = useMemo(() => {
    if (!filterProject) return undefined
    return spaces.find(s => s.project === filterProject)?.account
  }, [filterProject, spaces])

  if (allSpaces.length === 0) {
    return null
  }

  const hasActiveFilters = filterAccount !== null || filterProject !== null || filterType !== null

  return (
    <div>
      {/* Header row */}
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
          <button
            class="px-3 py-2 text-xs rounded-lg border transition-all text-forge-muted hover:text-forge-text hover:bg-forge-surface"
            style={{ borderColor: 'var(--forge-ghost-border)' }}
            onClick={onCreateAccount}
          >
            + Account
          </button>
          <button
            class="px-3 py-2 text-xs rounded-lg border transition-all text-forge-muted hover:text-forge-text hover:bg-forge-surface"
            style={{ borderColor: 'var(--forge-ghost-border)' }}
            onClick={onCreateProject}
          >
            + Project
          </button>
          {onSkills && <ActionButton label="Skills" variant="secondary" onClick={onSkills} />}
          <ActionButton label="+ New Task" variant="primary" onClick={() => onNewTask()} />
        </div>
      </div>

      {/* Quick-launch type pills */}
      <div class="flex items-center gap-2 mb-5">
        <span class="text-[11px] text-forge-muted uppercase tracking-wider mr-1">Quick:</span>
        <QuickTypePills onNewTask={onNewTask} />
      </div>

      {/* Filter bar */}
      <div
        class="flex flex-wrap items-center gap-2.5 mb-6 pb-5"
        style={{ borderBottom: '1px solid var(--forge-ghost-border)' }}
      >
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

        <div class="flex-1" />

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

      {/* Account / project banners */}
      {filterAccount && <AccountBanner account={filterAccount} onDeleted={() => { onFilterAccount(null); onRefresh() }} />}
      {filterProject && <ProjectBanner project={filterProject} account={projectAccount} accounts={accountNames} onDeleted={() => { onFilterProject(null); onRefresh() }} onMoved={onRefresh} />}

      {/* Active tasks */}
      {active.length > 0 && (
        <div class="mb-8">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2 h-2 rounded-full bg-forge-success animate-pulse" />
            <span class="text-xs font-semibold text-forge-muted uppercase tracking-wider">Active</span>
            <span class="text-xs text-forge-muted">{active.length} task{active.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="space-y-2.5">
            {active.map(s => (
              <TaskCard
                key={`${s.project}-${s.task ?? s.pr}-active`}
                session={s}
                showAccount={showAccount}
                isOpenInTab={openTabKeys?.has(sessionKey(s)) ?? false}
                onSelect={() => onSelectTask(s)}
                onMarkDone={onMarkDone ? () => onMarkDone(s) : undefined}
              />
            ))}
          </div>
          {filterProject && (
            <div class="mt-4 flex items-center gap-3">
              <QuickTypePills onNewTask={onNewTask} />
            </div>
          )}
        </div>
      )}

      {/* No active results */}
      {active.length === 0 && !showDone && (
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <span class="text-3xl mb-3 opacity-40">&#128269;</span>
          <p class="text-sm text-forge-muted">
            {hasActiveFilters
              ? 'No active tasks match your filters.'
              : 'No active tasks. Start something new!'}
          </p>
          {filterProject && (
            <div class="mt-4 flex flex-col items-center gap-3">
              <ActionButton label="+ New Task" variant="primary" onClick={() => onNewTask()} />
              <QuickTypePills onNewTask={onNewTask} />
            </div>
          )}
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

      {/* Done tasks */}
      {showDone && done.length > 0 && (
        <div>
          <div class="flex items-center gap-2 mb-3">
            <span class="w-2 h-2 rounded-full bg-forge-muted" />
            <span class="text-xs font-semibold text-forge-muted uppercase tracking-wider">Done</span>
            <span class="text-xs text-forge-muted">{done.length}{totalDone > done.length ? ` of ${totalDone}` : ''}</span>
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

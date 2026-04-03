import { type FunctionComponent } from 'preact'
import { ActionButton, Badge, EmptyState } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface TaskListProps {
  spaces: CWSession[]
  loading: boolean
  onNewTask: (type?: string) => void
  onSelectTask: (session: CWSession) => void
  onRefresh: () => void
}

export const TaskList: FunctionComponent<TaskListProps> = ({
  spaces, loading, onNewTask, onSelectTask, onRefresh
}) => {
  const active = spaces.filter(s => s.status === 'active')
  const done = spaces.filter(s => s.status === 'done').slice(0, 10)

  const typeColor: Record<string, string> = {
    task: 'var(--forge-warning)',
    review: 'var(--forge-accent)',
  }

  const typeLabel = (s: CWSession) => {
    if (s.type === 'review') return 'REVIEW'
    return 'DEV'
  }

  const taskName = (s: CWSession) => {
    if (s.type === 'review') return `PR #${s.pr}`
    return s.task ?? 'unknown'
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'just now'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  if (!loading && spaces.length === 0) {
    return null // onboarding shown by parent
  }

  return (
    <div>
      {/* Quick launch */}
      <div class="flex items-center gap-3 mb-6">
        <ActionButton label="+ New Task" variant="primary" onClick={() => onNewTask()} />
        <div class="flex gap-2">
          {['Dev', 'Design', 'Review', 'Plan'].map(t => (
            <button
              key={t}
              class="px-3 py-1.5 text-xs rounded-lg bg-forge-surface border border-forge-border text-forge-muted hover:text-forge-text hover:border-forge-accent/40 transition-colors"
              onClick={() => onNewTask(t.toLowerCase())}
            >
              {t}
            </button>
          ))}
        </div>
        <div class="flex-1" />
        <ActionButton label="Refresh" variant="secondary" onClick={onRefresh} />
      </div>

      {/* Active tasks */}
      {active.length > 0 && (
        <div class="mb-8">
          <div class="text-xs font-medium text-forge-muted uppercase tracking-wider mb-3">
            Active · {active.length} task{active.length !== 1 ? 's' : ''}
          </div>
          <div class="space-y-2">
            {active.map(s => (
              <div
                key={`${s.project}-${s.task ?? s.pr}`}
                class="flex items-center justify-between p-3 rounded-lg bg-forge-surface border border-forge-border hover:border-forge-accent/40 cursor-pointer transition-colors"
                onClick={() => onSelectTask(s)}
              >
                <div class="flex items-center gap-3 min-w-0">
                  <Badge label={typeLabel(s)} color={typeColor[s.type]} />
                  <span class="font-medium text-sm truncate">{taskName(s)}</span>
                  <span class="text-xs text-forge-muted">{s.project}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-forge-muted">{timeAgo(s.last_opened)}</span>
                  <span class="text-xs text-forge-success">▶ Resume</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Done tasks */}
      {done.length > 0 && (
        <div>
          <div class="text-xs font-medium text-forge-muted uppercase tracking-wider mb-3">
            Recent (done)
          </div>
          <div class="space-y-1">
            {done.map(s => (
              <div
                key={`${s.project}-${s.task ?? s.pr}-done`}
                class="flex items-center justify-between p-2.5 rounded-lg text-forge-muted hover:bg-forge-surface/50 cursor-pointer transition-colors"
                onClick={() => onSelectTask(s)}
              >
                <div class="flex items-center gap-3 min-w-0">
                  <Badge label={typeLabel(s)} color="var(--forge-muted)" variant="outline" />
                  <span class="text-sm truncate">{taskName(s)}</span>
                  <span class="text-xs">{s.project}</span>
                </div>
                <span class="text-xs">{s.opens} session{s.opens !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

interface ActionLogEntry {
  id: string
  moduleId: string
  actionId: string
  command: string
  exitCode: number | null
  startedAt: string
  finishedAt: string | null
}

function ActivityPanel(_props: PanelProps) {
  const [logs, setLogs] = useState<ActionLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/action-logs?limit=50')
      setLogs(await res.json() as ActionLogEntry[])
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [])

  if (!loading && logs.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="No Activity Yet"
        description="Run some actions from any module to see activity here."
      />
    )
  }

  const items: DataListItem[] = logs.map(log => {
    const isRunning = log.exitCode === null
    const isSuccess = log.exitCode === 0
    const badgeColor = isRunning
      ? 'var(--forge-accent)'
      : isSuccess
        ? 'var(--forge-success)'
        : 'var(--forge-error)'
    const badgeLabel = isRunning ? 'running' : isSuccess ? 'ok' : `exit ${log.exitCode}`

    return {
      id: log.id,
      title: `${log.moduleId} / ${log.actionId}`,
      subtitle: log.startedAt,
      badge: { label: badgeLabel, color: badgeColor }
    }
  })

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">
          {logs.length} action{logs.length !== 1 ? 's' : ''}
        </h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchLogs} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({
  id: 'activity',
  title: 'Activity',
  component: ActivityPanel
})

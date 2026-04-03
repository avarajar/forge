import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

interface ActionLogEntry { id: string; moduleId: string; actionId: string; exitCode: number | null; startedAt: string; finishedAt: string | null }

function ReportsPanel({ moduleId }: PanelProps) {
  const [logs, setLogs] = useState<ActionLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReports = async () => {
    setLoading(true)
    try { const res = await fetch(`/api/action-logs?moduleId=${moduleId}&limit=30`); setLogs(await res.json() as ActionLogEntry[]) }
    catch { setLogs([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchReports() }, [moduleId])

  if (!loading && logs.length === 0) {
    return (<EmptyState icon="file-text" title="No Test Reports" description="Run some tests to see results history here." />)
  }

  const items: DataListItem[] = logs.map(log => ({
    id: log.id,
    title: log.actionId.replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
    subtitle: log.startedAt,
    badge: {
      label: log.exitCode === null ? 'running' : log.exitCode === 0 ? 'pass' : 'fail',
      color: log.exitCode === null ? 'var(--forge-accent)' : log.exitCode === 0 ? 'var(--forge-success)' : 'var(--forge-error)'
    }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{logs.length} test run{logs.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchReports} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'reports', title: 'Reports', component: ReportsPanel })

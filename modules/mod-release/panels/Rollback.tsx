import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function RollbackPanel({ moduleId, projectId }: PanelProps) {
  const [releases, setReleases] = useState<{ tag: string; title: string; date: string }[]>([])
  const [loading, setLoading] = useState(true)

  const fetchReleases = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const result = await res.json() as { output: string }
      const lines = result.output.trim().split('\n').filter(Boolean)
      setReleases(lines.map(line => { const parts = line.split('\t'); return { tag: parts[0] ?? line, title: parts[1] ?? '', date: parts[2] ?? '' } }))
    } catch { setReleases([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchReleases() }, [moduleId, projectId])

  if (!loading && releases.length === 0) {
    return (<EmptyState icon="history" title="No Releases" description="Create releases using GitHub CLI or git tags. They will appear here for rollback." />)
  }

  const items: DataListItem[] = releases.map((r, i) => ({
    id: r.tag, title: r.tag, subtitle: r.title || r.date,
    badge: i === 0 ? { label: 'latest', color: 'var(--forge-success)' } : { label: 'previous' }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{releases.length} release{releases.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchReleases} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'rollback', title: 'Rollback', component: RollbackPanel })

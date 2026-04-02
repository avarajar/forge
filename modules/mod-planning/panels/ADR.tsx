import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function ADRPanel({ moduleId, projectId }: PanelProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchADRs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-adrs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      setFiles(result.output.trim().split('\n').filter(Boolean))
    } catch { setFiles([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchADRs() }, [moduleId, projectId])

  if (!loading && files.length === 0) {
    return (<EmptyState icon="file-check" title="No Decision Records" description="Add Architecture Decision Records as markdown files in docs/adr/ to track important decisions." />)
  }

  const items: DataListItem[] = files.map((f, i) => {
    const filename = f.split('/').pop() ?? f
    const title = filename.replace(/^\d+-/, '').replace('.md', '').replace(/-/g, ' ')
    return {
      id: f, title: title.charAt(0).toUpperCase() + title.slice(1), subtitle: f,
      badge: { label: `ADR-${String(i + 1).padStart(3, '0')}` }
    }
  })

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{files.length} decision record{files.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchADRs} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'adr', title: 'ADR', component: ADRPanel })

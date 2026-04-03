import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function TokensPanel({ moduleId, projectId }: PanelProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTokens = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-tokens`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const result = await res.json() as { output: string }
      setFiles(result.output.trim().split('\n').filter(Boolean))
    } catch { setFiles([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchTokens() }, [moduleId, projectId])

  if (!loading && files.length === 0) {
    return (<EmptyState icon="swatch-book" title="No Design Tokens" description="Add token files in tokens/ or src/tokens/ directory. Supports Style Dictionary JSON format." />)
  }

  const items: DataListItem[] = files.map(f => ({ id: f, title: f.split('/').pop() ?? f, subtitle: f, badge: { label: f.endsWith('.json') ? 'JSON' : 'TS', color: 'var(--forge-accent)' } }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{files.length} token file{files.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchTokens} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'tokens', title: 'Tokens', component: TokensPanel })

import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function WireframesPanel({ moduleId, projectId }: PanelProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWireframes = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-wireframes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const result = await res.json() as { output: string }
      setFiles(result.output.trim().split('\n').filter(Boolean))
    } catch { setFiles([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchWireframes() }, [moduleId, projectId])

  if (!loading && files.length === 0) {
    return (<EmptyState icon="pencil-ruler" title="No Wireframes" description="Add Excalidraw files (.excalidraw.json) to your project to browse wireframes here." />)
  }

  const items: DataListItem[] = files.map(f => ({ id: f, title: f.split('/').pop()?.replace('.excalidraw.json', '').replace('.excalidraw', '') ?? f, subtitle: f, badge: { label: 'excalidraw', color: 'var(--forge-accent)' } }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{files.length} wireframe{files.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchWireframes} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'wireframes', title: 'Wireframes', component: WireframesPanel })

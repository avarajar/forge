import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

function ArchitecturePanel({ moduleId, projectId }: PanelProps) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  const fetchDiagrams = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-diagrams`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      setFiles(result.output.trim().split('\n').filter(Boolean))
    } catch { setFiles([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchDiagrams() }, [moduleId, projectId])

  if (!loading && files.length === 0) {
    return (<EmptyState icon="shapes" title="No Diagrams Found" description="Add Mermaid (.mmd) or D2 (.d2) files to docs/diagrams/ or docs/architecture/ to view them here." />)
  }

  const items: DataListItem[] = files.map(f => ({
    id: f, title: f.split('/').pop() ?? f, subtitle: f,
    badge: { label: f.endsWith('.mmd') ? 'mermaid' : 'd2', color: 'var(--forge-accent)' }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{files.length} diagram{files.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchDiagrams} />
      </div>
      <DataList items={items} loading={loading} onItemClick={setSelectedFile} />
      {selectedFile && (
        <div class="mt-4 p-4 rounded-lg bg-forge-surface border border-forge-border">
          <div class="text-xs text-forge-muted mb-2">{selectedFile}</div>
          <p class="text-sm text-forge-text">Open this file in your editor to view or edit the diagram.</p>
        </div>
      )}
    </div>
  )
}

export default definePanel({ id: 'architecture', title: 'Architecture', component: ArchitecturePanel })

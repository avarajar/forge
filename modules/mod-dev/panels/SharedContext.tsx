import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState, ActionButton } from '@forge-dev/ui'

function SharedContextPanel({ moduleId, projectId }: PanelProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchContext = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/read-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      setContent(result.output)
    } catch {
      setContent(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchContext() }, [moduleId, projectId])

  if (loading) {
    return <div class="animate-pulse h-40 bg-forge-surface rounded-lg" />
  }

  if (!content || content.includes('No CLAUDE.md found')) {
    return (
      <EmptyState
        icon="file-text"
        title="No Shared Context"
        description="No CLAUDE.md file found in the current project directory. Create one to share context between Claude sessions."
      />
    )
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">CLAUDE.md</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchContext} />
      </div>
      <pre class="p-4 rounded-lg bg-forge-surface border border-forge-border text-sm font-mono overflow-auto max-h-96 whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  )
}

export default definePanel({
  id: 'shared-context',
  title: 'Shared Context',
  component: SharedContextPanel
})

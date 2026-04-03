import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState, ActionButton } from '@forge-dev/ui'

function ChangelogPanel({ moduleId, projectId }: PanelProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchChangelog = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/read-changelog`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const result = await res.json() as { output: string }
      setContent(result.output)
    } catch { setContent(null) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchChangelog() }, [moduleId, projectId])

  if (loading) return <div class="animate-pulse h-40 bg-forge-surface rounded-lg" />

  if (!content || content.includes('No CHANGELOG.md found')) {
    return (<EmptyState icon="scroll-text" title="No Changelog" description="Generate a changelog from your git history using git-cliff or conventional-changelog." />)
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">CHANGELOG.md</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchChangelog} />
      </div>
      <pre class="p-4 rounded-lg bg-forge-surface border border-forge-border text-sm font-mono overflow-auto max-h-96 whitespace-pre-wrap">{content}</pre>
    </div>
  )
}

export default definePanel({ id: 'changelog', title: 'Changelog', component: ChangelogPanel })

import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

interface GitHubIssue { number: number; title: string; state: string; labels: { name: string }[] }

function BoardPanel({ moduleId, projectId }: PanelProps) {
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [noGh, setNoGh] = useState(false)

  const fetchIssues = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-issues`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      if (result.exitCode !== 0 || result.output.trim() === '[]' || !result.output.trim()) {
        setNoGh(true); setIssues([])
      } else {
        try { setIssues(JSON.parse(result.output)) } catch { setNoGh(true) }
      }
    } catch { setNoGh(true) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchIssues() }, [moduleId, projectId])

  if (noGh && !loading) {
    return (<EmptyState icon="kanban" title="No Issues Found" description="Connect GitHub CLI (gh) to view issues, or configure Linear in module settings for full board functionality." />)
  }

  const items: DataListItem[] = issues.map(issue => ({
    id: String(issue.number),
    title: `#${issue.number} ${issue.title}`,
    subtitle: issue.labels.map(l => l.name).join(', ') || 'No labels',
    badge: { label: issue.state, color: issue.state === 'open' ? 'var(--forge-success)' : 'var(--forge-muted)' }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{issues.length} issue{issues.length !== 1 ? 's' : ''}</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchIssues} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'board', title: 'Board', component: BoardPanel })

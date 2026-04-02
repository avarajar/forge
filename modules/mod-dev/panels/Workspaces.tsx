import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, ActionButton, type DataListItem } from '@forge-dev/ui'

interface WorktreeInfo {
  path: string
  head: string
  branch: string
  bare: boolean
}

function parseWorktreeOutput(output: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = []
  const blocks = output.trim().split('\n\n')

  for (const block of blocks) {
    if (!block.trim()) continue
    const lines = block.trim().split('\n')
    const wt: Partial<WorktreeInfo> = { bare: false }

    for (const line of lines) {
      if (line.startsWith('worktree ')) wt.path = line.slice(9)
      else if (line.startsWith('HEAD ')) wt.head = line.slice(5)
      else if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '')
      else if (line === 'bare') wt.bare = true
    }

    if (wt.path) {
      worktrees.push({
        path: wt.path,
        head: wt.head ?? 'unknown',
        branch: wt.branch ?? '(detached)',
        bare: wt.bare ?? false
      })
    }
  }

  return worktrees
}

function WorkspacesPanel({ moduleId, projectId }: PanelProps) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWorktrees = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/actions/${moduleId}/list-worktrees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      })
      const result = await res.json() as { output: string; exitCode: number }
      if (result.exitCode === 0) {
        setWorktrees(parseWorktreeOutput(result.output))
      } else {
        setError('Not a git repository or git not available')
      }
    } catch {
      setError('Failed to fetch worktree data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchWorktrees() }, [moduleId, projectId])

  if (error) {
    return (
      <EmptyState
        icon="git-branch"
        title="No Git Repository"
        description={error}
      />
    )
  }

  const items: DataListItem[] = worktrees.map((wt, i) => ({
    id: wt.path,
    title: wt.branch,
    subtitle: wt.path,
    badge: i === 0
      ? { label: 'main', color: 'var(--forge-success)' }
      : { label: 'worktree', color: 'var(--forge-accent)' }
  }))

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">
          {worktrees.length} worktree{worktrees.length !== 1 ? 's' : ''}
        </h3>
        <ActionButton label="Refresh" variant="secondary" onClick={fetchWorktrees} />
      </div>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({
  id: 'workspaces',
  title: 'Workspaces',
  component: WorkspacesPanel
})

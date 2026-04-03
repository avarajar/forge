import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, EmptyState, type DataListItem } from '@forge-dev/ui'

interface ProjectEntry { id: string; name: string; path: string; createdAt: string }

function RecentPanel(_props: PanelProps) {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((data: ProjectEntry[]) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  if (!loading && projects.length === 0) {
    return (<EmptyState icon="folder-plus" title="No Projects Yet" description="Create your first project using the New Project wizard or register an existing project." />)
  }

  const items: DataListItem[] = projects.map(p => ({
    id: p.id, title: p.name, subtitle: p.path,
    badge: { label: new Date(p.createdAt).toLocaleDateString() }
  }))

  return (
    <div>
      <h3 class="text-sm font-medium text-forge-muted mb-4">{projects.length} project{projects.length !== 1 ? 's' : ''}</h3>
      <DataList items={items} loading={loading} />
    </div>
  )
}

export default definePanel({ id: 'recent', title: 'Recent', component: RecentPanel })

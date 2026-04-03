import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { StatusCard, ActionButton, Modal, DataList, Badge, showToast, type DataListItem } from '@forge-dev/ui'
import { useApi } from '../hooks/useApi.js'

interface HealthResponse {
  status: string
  modules: number
}

interface ProjectEntry {
  id: string
  name: string
  path: string
}

interface DirEntry {
  name: string
  path: string
  hasPackageJson: boolean
  hasGit: boolean
}

interface BrowseResponse {
  current: string
  name: string
  parent: string
  directories: DirEntry[]
}

export const Home: FunctionComponent = () => {
  const projects = useApi<ProjectEntry[]>('/api/projects')
  const health = useApi<HealthResponse>('/api/health')
  const [showBrowser, setShowBrowser] = useState(false)
  const [browsePath, setBrowsePath] = useState<string | null>(null)
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)

  const browse = async (path?: string) => {
    setBrowseLoading(true)
    try {
      const url = path ? `/api/filesystem/browse?path=${encodeURIComponent(path)}` : '/api/filesystem/browse'
      const res = await fetch(url)
      const data = await res.json() as BrowseResponse
      setBrowseData(data)
      setBrowsePath(data.current)
    } catch {
      showToast('Failed to browse directory', 'error')
    } finally {
      setBrowseLoading(false)
    }
  }

  const openBrowser = () => {
    setShowBrowser(true)
    browse()
  }

  const registerDir = async (path: string, name: string) => {
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path })
      })
      showToast(`Project "${name}" registered`, 'success')
      setShowBrowser(false)
      projects.refetch()
    } catch {
      showToast('Failed to register project', 'error')
    }
  }

  const registerCurrent = async () => {
    if (!browseData) return
    await registerDir(browseData.current, browseData.name)
  }

  const removeProject = async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      showToast('Project removed', 'info')
      projects.refetch()
    } catch {
      showToast('Failed to remove project', 'error')
    }
  }

  const projectItems: DataListItem[] = (projects.data.value ?? []).map(p => ({
    id: p.id,
    title: p.name,
    subtitle: p.path,
    trailing: (
      <ActionButton label="Remove" variant="danger" onClick={() => removeProject(p.id)} />
    )
  }))

  return (
    <div>
      <h2 class="text-2xl font-bold mb-6">Welcome to Forge</h2>

      <div class="grid grid-cols-3 gap-4 mb-8">
        <StatusCard
          icon="folder"
          label="Projects"
          value={projects.data.value?.length ?? 0}
          status="neutral"
        />
        <StatusCard
          icon="puzzle"
          label="Modules"
          value={health.data.value?.modules ?? 0}
          status="neutral"
        />
        <StatusCard
          icon="zap"
          label="Status"
          value={health.data.value?.status === 'ok' ? 'Online' : 'Offline'}
          status={health.data.value?.status === 'ok' ? 'good' : 'bad'}
        />
      </div>

      <div class="flex gap-3 mb-6">
        <ActionButton label="+ Add Project" variant="primary" onClick={openBrowser} />
      </div>

      {/* Registered projects list */}
      {projectItems.length > 0 && (
        <div>
          <h3 class="text-sm font-medium text-forge-muted mb-3">Registered Projects</h3>
          <DataList items={projectItems} />
        </div>
      )}

      {/* Directory Browser Modal */}
      <Modal
        open={showBrowser}
        title="Add Project"
        onClose={() => setShowBrowser(false)}
        onConfirm={registerCurrent}
        confirmLabel={`Register "${browseData?.name ?? '...'}"`}
      >
        <div>
          {/* Current path */}
          <div class="flex items-center gap-2 mb-3">
            <span class="text-xs text-forge-muted truncate flex-1">{browsePath ?? 'Loading...'}</span>
            {browseData && browseData.current !== browseData.parent && (
              <ActionButton label=".." variant="secondary" onClick={() => browse(browseData.parent)} />
            )}
          </div>

          {/* Directory list */}
          <div class="max-h-64 overflow-auto space-y-1">
            {browseLoading ? (
              <div class="py-8 text-center text-forge-muted text-sm">Loading...</div>
            ) : (
              (browseData?.directories ?? []).map(dir => (
                <div
                  key={dir.path}
                  class="flex items-center justify-between p-2 rounded-lg hover:bg-forge-surface cursor-pointer border border-transparent hover:border-forge-border"
                >
                  <div
                    class="flex-1 min-w-0"
                    onClick={() => browse(dir.path)}
                  >
                    <div class="text-sm font-medium truncate">{dir.name}</div>
                    <div class="flex gap-1 mt-0.5">
                      {dir.hasGit && <Badge label="git" color="var(--forge-success)" variant="outline" />}
                      {dir.hasPackageJson && <Badge label="npm" color="var(--forge-accent)" variant="outline" />}
                    </div>
                  </div>
                  {(dir.hasPackageJson || dir.hasGit) && (
                    <ActionButton
                      label="Add"
                      variant="secondary"
                      onClick={() => registerDir(dir.path, dir.name)}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

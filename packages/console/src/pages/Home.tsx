import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { StatusCard, ActionButton, Modal, DataList, Badge, EmptyState, showToast, type DataListItem } from '@forge-dev/ui'
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

interface HomeProps {
  onProjectAdded: () => void
  onProjectRemoved: () => void
}

export const Home: FunctionComponent<HomeProps> = ({ onProjectAdded, onProjectRemoved }) => {
  const projects = useApi<ProjectEntry[]>('/api/projects')
  const health = useApi<HealthResponse>('/api/health')
  const [showBrowser, setShowBrowser] = useState(false)
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)

  const browse = async (path?: string) => {
    setBrowseLoading(true)
    try {
      const url = path ? `/api/filesystem/browse?path=${encodeURIComponent(path)}` : '/api/filesystem/browse'
      const res = await fetch(url)
      setBrowseData(await res.json() as BrowseResponse)
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
      showToast(`Project "${name}" added`, 'success')
      setShowBrowser(false)
      projects.refetch()
      onProjectAdded()
    } catch {
      showToast('Failed to add project', 'error')
    }
  }

  const removeProject = async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      showToast('Project removed', 'info')
      projects.refetch()
      onProjectRemoved()
    } catch {
      showToast('Failed to remove project', 'error')
    }
  }

  const projectList = projects.data.value ?? []
  const hasProjects = projectList.length > 0

  // --- Onboarding (no projects) ---
  if (!hasProjects) {
    return (
      <div>
        <div class="flex flex-col items-center justify-center py-20 text-center">
          <div class="text-5xl mb-6 opacity-80">&#128296;</div>
          <h2 class="text-2xl font-bold mb-2">Welcome to Forge</h2>
          <p class="text-forge-muted max-w-md mb-8">
            Add a project to get started. Forge will detect your tech stack and activate the right tools automatically.
          </p>
          <ActionButton label="+ Add Project" variant="primary" onClick={openBrowser} />
        </div>

        <BrowserModal
          open={showBrowser}
          data={browseData}
          loading={browseLoading}
          onClose={() => setShowBrowser(false)}
          onBrowse={browse}
          onRegister={registerDir}
        />
      </div>
    )
  }

  // --- Dashboard (has projects) ---
  return (
    <div>
      <div class="grid grid-cols-3 gap-4 mb-8">
        <StatusCard
          icon="folder"
          label="Projects"
          value={projectList.length}
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

      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium text-forge-muted">Your Projects</h3>
        <ActionButton label="+ Add" variant="secondary" onClick={openBrowser} />
      </div>

      <DataList
        items={projectList.map(p => ({
          id: p.id,
          title: p.name,
          subtitle: p.path,
          trailing: (
            <ActionButton label="Remove" variant="danger" onClick={() => removeProject(p.id)} />
          )
        }))}
      />

      <p class="text-xs text-forge-muted mt-6">
        Select a project from the dropdown above, then use the modules in the sidebar to run tests, deploy, and more.
      </p>

      <BrowserModal
        open={showBrowser}
        data={browseData}
        loading={browseLoading}
        onClose={() => setShowBrowser(false)}
        onBrowse={browse}
        onRegister={registerDir}
      />
    </div>
  )
}

// --- Directory Browser Modal (extracted) ---
interface BrowserModalProps {
  open: boolean
  data: BrowseResponse | null
  loading: boolean
  onClose: () => void
  onBrowse: (path?: string) => void
  onRegister: (path: string, name: string) => void
}

const BrowserModal: FunctionComponent<BrowserModalProps> = ({
  open, data, loading, onClose, onBrowse, onRegister
}) => {
  return (
    <Modal
      open={open}
      title="Add Project"
      onClose={onClose}
      onConfirm={() => data && onRegister(data.current, data.name)}
      confirmLabel={`Register "${data?.name ?? '...'}"`}
    >
      <div>
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs text-forge-muted truncate flex-1">{data?.current ?? 'Loading...'}</span>
          {data && data.current !== data.parent && (
            <ActionButton label=".." variant="secondary" onClick={() => onBrowse(data.parent)} />
          )}
        </div>
        <div class="max-h-64 overflow-auto space-y-1">
          {loading ? (
            <div class="py-8 text-center text-forge-muted text-sm">Loading...</div>
          ) : (
            (data?.directories ?? []).map(dir => (
              <div
                key={dir.path}
                class="flex items-center justify-between p-2 rounded-lg hover:bg-forge-surface cursor-pointer border border-transparent hover:border-forge-border"
              >
                <div class="flex-1 min-w-0" onClick={() => onBrowse(dir.path)}>
                  <div class="text-sm font-medium truncate">{dir.name}</div>
                  <div class="flex gap-1 mt-0.5">
                    {dir.hasGit && <Badge label="git" color="var(--forge-success)" variant="outline" />}
                    {dir.hasPackageJson && <Badge label="npm" color="var(--forge-accent)" variant="outline" />}
                  </div>
                </div>
                {(dir.hasPackageJson || dir.hasGit) && (
                  <ActionButton label="Add" variant="secondary" onClick={() => onRegister(dir.path, dir.name)} />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}

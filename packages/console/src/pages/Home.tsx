import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { StatusCard, ActionButton, Modal, showToast } from '@forge-dev/ui'
import { useApi } from '../hooks/useApi.js'

interface HealthResponse {
  status: string
  modules: number
}

export const Home: FunctionComponent = () => {
  const projects = useApi<unknown[]>('/api/projects')
  const health = useApi<HealthResponse>('/api/health')
  const [showModal, setShowModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectPath, setProjectPath] = useState('')

  const createProject = async () => {
    if (!projectName.trim() || !projectPath.trim()) return
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName.trim(), path: projectPath.trim() })
      })
      setShowModal(false)
      setProjectName('')
      setProjectPath('')
      showToast(`Project "${projectName}" created`, 'success')
      projects.refetch()
    } catch {
      showToast('Failed to create project', 'error')
    }
  }

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

      <div class="flex gap-3">
        <ActionButton label="+ New Project" variant="primary" onClick={() => setShowModal(true)} />
      </div>

      <Modal
        open={showModal}
        title="New Project"
        onClose={() => setShowModal(false)}
        onConfirm={createProject}
        confirmLabel="Create"
      >
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Project Name</label>
            <input
              type="text"
              value={projectName}
              onInput={(e) => setProjectName((e.target as HTMLInputElement).value)}
              placeholder="my-app"
              class="w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Project Path</label>
            <input
              type="text"
              value={projectPath}
              onInput={(e) => setProjectPath((e.target as HTMLInputElement).value)}
              placeholder="/Users/you/projects/my-app"
              class="w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

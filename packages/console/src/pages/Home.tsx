import { type FunctionComponent } from 'preact'
import { StatusCard, ActionButton } from '@forge-dev/ui'
import { useApi } from '../hooks/useApi.js'

interface HealthResponse {
  status: string
  modules: number
}

export const Home: FunctionComponent = () => {
  const projects = useApi<unknown[]>('/api/projects')
  const health = useApi<HealthResponse>('/api/health')

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
        <ActionButton label="+ New Project" variant="primary" onClick={() => {}} />
        <ActionButton label="Open Project" variant="secondary" onClick={() => {}} />
      </div>
    </div>
  )
}

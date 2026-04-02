import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard, ActionButton, EmptyState } from '@forge-dev/ui'

interface HealthCheck {
  name: string
  url: string
  status: 'up' | 'down' | 'slow' | 'unchecked'
  responseTime: number | null
  statusCode: number | null
}

function HealthPanel({ moduleId }: PanelProps) {
  const [checks, setChecks] = useState<HealthCheck[]>([])
  const [loading, setLoading] = useState(true)

  const defaultEndpoints = [
    { name: 'Forge API', url: '/api/health' }
  ]

  const runChecks = async () => {
    setLoading(true)
    const results: HealthCheck[] = []

    for (const endpoint of defaultEndpoints) {
      const start = Date.now()
      try {
        const res = await fetch(endpoint.url)
        const elapsed = Date.now() - start
        results.push({
          name: endpoint.name,
          url: endpoint.url,
          status: res.ok ? (elapsed > 2000 ? 'slow' : 'up') : 'down',
          responseTime: elapsed,
          statusCode: res.status
        })
      } catch {
        results.push({
          name: endpoint.name,
          url: endpoint.url,
          status: 'down',
          responseTime: null,
          statusCode: null
        })
      }
    }

    setChecks(results)
    setLoading(false)
  }

  useEffect(() => { runChecks() }, [])

  const statusToCardStatus = (s: HealthCheck['status']): 'good' | 'warn' | 'bad' | 'neutral' => {
    switch (s) {
      case 'up': return 'good'
      case 'slow': return 'warn'
      case 'down': return 'bad'
      default: return 'neutral'
    }
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-medium text-forge-muted">Service Health</h3>
        <ActionButton label="Refresh" variant="secondary" onClick={runChecks} />
      </div>

      {loading ? (
        <div class="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} class="h-24 rounded-lg bg-forge-surface animate-pulse" />
          ))}
        </div>
      ) : checks.length === 0 ? (
        <EmptyState
          icon="heart-pulse"
          title="No Endpoints Configured"
          description="Add health check endpoints in module settings to monitor service availability."
        />
      ) : (
        <div class="grid grid-cols-3 gap-4">
          {checks.map(check => (
            <StatusCard
              key={check.name}
              icon="heart-pulse"
              label={check.name}
              value={check.status === 'up' ? 'Online' : check.status === 'slow' ? 'Slow' : 'Offline'}
              trend={check.responseTime !== null ? `${check.responseTime}ms` : undefined}
              status={statusToCardStatus(check.status)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default definePanel({
  id: 'health',
  title: 'Health',
  component: HealthPanel
})

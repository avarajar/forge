import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState, ToggleSwitch } from '@forge-dev/ui'

interface Flag { id: string; name: string; enabled: boolean; description: string }

function FeatureFlagsPanel(_props: PanelProps) {
  const [flags, setFlags] = useState<Flag[]>([
    { id: 'dark-mode', name: 'Dark Mode', enabled: true, description: 'Enable dark mode toggle for users' },
    { id: 'new-dashboard', name: 'New Dashboard', enabled: false, description: 'Beta dashboard layout' },
    { id: 'api-v2', name: 'API v2', enabled: false, description: 'Route traffic to v2 API endpoints' },
  ])
  const [connected, setConnected] = useState(false)

  const toggleFlag = (flagId: string) => {
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, enabled: !f.enabled } : f))
  }

  if (!connected) {
    return (<EmptyState icon="toggle-right" title="Feature Flags" description="Connect Flipt or a feature flag service to manage flags remotely. For now, use local flags below." action={{ label: 'Use Local Flags', onClick: () => setConnected(true) }} />)
  }

  return (
    <div>
      <h3 class="text-sm font-medium text-forge-muted mb-4">{flags.length} flag{flags.length !== 1 ? 's' : ''}</h3>
      <div class="space-y-3">
        {flags.map(flag => (
          <div key={flag.id} class="flex items-center justify-between p-3 rounded-lg bg-forge-surface border border-forge-border">
            <div>
              <div class="font-medium text-sm">{flag.name}</div>
              <div class="text-xs text-forge-muted">{flag.description}</div>
            </div>
            <ToggleSwitch checked={flag.enabled} onChange={() => toggleFlag(flag.id)} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default definePanel({ id: 'feature-flags', title: 'Feature Flags', component: FeatureFlagsPanel })

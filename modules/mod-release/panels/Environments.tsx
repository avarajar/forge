import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { StatusCard } from '@forge-dev/ui'

function EnvironmentsPanel(_props: PanelProps) {
  return (
    <div>
      <h3 class="text-sm font-medium text-forge-muted mb-4">Environments</h3>
      <div class="grid grid-cols-3 gap-4">
        <StatusCard icon="code" label="Development" value="Local" status="good" />
        <StatusCard icon="eye" label="Preview" value="Not configured" status="neutral" />
        <StatusCard icon="globe" label="Production" value="Not configured" status="neutral" />
      </div>
      <p class="text-xs text-forge-muted mt-4">Deploy platform detection configures environments automatically. Run "Deploy" to set up.</p>
    </div>
  )
}

export default definePanel({ id: 'environments', title: 'Environments', component: EnvironmentsPanel })

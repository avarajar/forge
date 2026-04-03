import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function CostsPanel(_props: PanelProps) {
  return (
    <EmptyState
      icon="dollar-sign"
      title="Cost Tracking"
      description="Connect CW stats or a cloud billing API to track AI and infrastructure costs. Configure API keys in module settings."
    />
  )
}

export default definePanel({
  id: 'costs',
  title: 'Costs',
  component: CostsPanel
})

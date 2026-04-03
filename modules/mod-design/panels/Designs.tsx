import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function DesignsPanel(_props: PanelProps) {
  return (<EmptyState icon="palette" title="Design Library" description="Connect Figma or Penpot to browse and import design frames. Configure the Figma API token in module settings." />)
}

export default definePanel({ id: 'designs', title: 'Designs', component: DesignsPanel })

import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function VisualDiffPanel(_props: PanelProps) {
  return (<EmptyState icon="eye" title="Visual Diff" description="Run visual regression tests with Lost Pixel to see pixel-level differences. Configure Lost Pixel and run the Visual Regression action." />)
}

export default definePanel({ id: 'visual-diff', title: 'Visual Diff', component: VisualDiffPanel })

import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function DocsPanel(_props: PanelProps) {
  return (<EmptyState icon="book-open" title="Documentation Hub" description="Connect Notion to browse and search your project documentation. Configure the Notion integration in module settings." />)
}

export default definePanel({ id: 'docs', title: 'Docs', component: DocsPanel })

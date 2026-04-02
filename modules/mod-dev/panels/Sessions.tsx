import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { EmptyState } from '@forge-dev/ui'

function SessionsPanel(_props: PanelProps) {
  return (
    <EmptyState
      icon="terminal"
      title="Claude Sessions"
      description="Connect CW (Claude Worktrees) to view active Claude Code sessions, token usage, and session history. Install CW and configure it in module settings."
      action={{
        label: 'Learn about CW',
        onClick: () => { window.open('https://github.com/anthropics/claude-code', '_blank') }
      }}
    />
  )
}

export default definePanel({
  id: 'sessions',
  title: 'Sessions',
  component: SessionsPanel
})

import { type FunctionComponent } from 'preact'
import { Modal, ActionButton } from '@forge-dev/ui'
import type { CloseWarning, CWSession, TaskReviewState } from '@forge-dev/core'
import { unpushedCount } from '../config/review.js'

export interface CloseRequest {
  session: CWSession
  state: TaskReviewState | null
  error: string | null
  onClosed?: () => void
}

export function closeWarningText(warning: CloseWarning, state: TaskReviewState | null): string {
  switch (warning) {
    case 'uncommitted': {
      const n = state?.uncommitted ?? 0
      return `${n} file${n === 1 ? ' has' : 's have'} uncommitted changes. Closing deletes them.`
    }
    case 'unpushed': {
      const n = state ? unpushedCount(state) : 0
      return `${n} commit${n === 1 ? ' is' : 's are'} not pushed. They stay on ${state?.branch ?? 'the task branch'} on this machine only.`
    }
    case 'pr-open': {
      const number = state?.pr.status === 'found' ? state.pr.number : ''
      return `PR #${number} is still open. If changes are requested, reopening starts the agent without this conversation.`
    }
    case 'state-unknown':
      return "Forge could not read this task's changes."
  }
}

export const CloseTaskDialog: FunctionComponent<{
  request: CloseRequest | null
  onCancel: () => void
  onConfirm: () => Promise<void>
}> = ({ request, onCancel, onConfirm }) => {
  if (!request) return null
  const warnings: CloseWarning[] = request.state ? request.state.closeWarnings : ['state-unknown']
  const destructive = warnings.includes('uncommitted')

  return (
    <Modal open title="Close this task?" onClose={onCancel}>
      <div class="space-y-4">
        <ul class="space-y-2 text-sm text-forge-text list-disc pl-5">
          {warnings.map(warning => <li key={warning}>{closeWarningText(warning, request.state)}</li>)}
        </ul>
        {request.error && <p class="text-xs text-forge-muted">{request.error}</p>}
        <div class="flex justify-end gap-2">
          <button
            autoFocus
            class="px-4 py-2 rounded-lg text-sm bg-forge-surface border border-forge-border hover:bg-forge-border"
            onClick={onCancel}
          >
            Cancel
          </button>
          <ActionButton label="Close task" variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} />
        </div>
      </div>
    </Modal>
  )
}

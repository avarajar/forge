import { type FunctionComponent } from 'preact'
import { ActionButton } from './ActionButton.js'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export const EmptyState: FunctionComponent<EmptyStateProps> = ({
  icon, title, description, action
}) => {
  return (
    <div class="flex flex-col items-center justify-center py-16 text-center">
      {icon && <span class="text-4xl mb-4 opacity-50">{icon}</span>}
      <h3 class="text-base font-medium text-forge-text mb-1">{title}</h3>
      {description && (
        <p class="text-sm text-forge-muted max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <ActionButton label={action.label} variant="secondary" onClick={action.onClick} />
      )}
    </div>
  )
}

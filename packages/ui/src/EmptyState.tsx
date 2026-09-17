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
    <div
      class="flex flex-col items-center justify-center text-center mx-auto"
      style={{
        maxWidth: '520px', padding: '36px 28px', borderRadius: '16px', background: 'var(--card)',
        border: '1px solid var(--hair)', boxShadow: 'var(--shadow-m)', animation: 'riseIn .34s var(--ease) both',
      }}
    >
      {icon && <span class={icon} style={{ width: '28px', height: '28px', color: 'var(--ink-3)', marginBottom: '14px' }} />}
      <h3 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '6px' }}>{title}</h3>
      {description && (
        <p style={{ fontSize: '13px', color: 'var(--ink-2)', maxWidth: '40ch', marginBottom: action ? '16px' : 0 }}>{description}</p>
      )}
      {action && (
        <ActionButton label={action.label} variant="primary" onClick={action.onClick} />
      )}
    </div>
  )
}

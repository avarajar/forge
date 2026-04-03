import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'

interface ActionButtonProps {
  label: string
  icon?: string
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  loading?: boolean
  onClick: () => void | Promise<void>
}

export const ActionButton: FunctionComponent<ActionButtonProps> = ({
  label, icon, variant = 'primary', disabled, loading: externalLoading, onClick
}) => {
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = externalLoading ?? internalLoading

  const handleClick = async () => {
    if (loading || disabled) return
    setInternalLoading(true)
    try {
      await onClick()
    } finally {
      setInternalLoading(false)
    }
  }

  const variantClasses = {
    primary: 'bg-forge-accent hover:bg-forge-accent/80 text-white',
    secondary: 'bg-forge-surface border border-forge-border hover:bg-forge-border text-forge-text',
    danger: 'bg-forge-error hover:bg-forge-error/80 text-white'
  }

  return (
    <button
      class={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]}`}
      disabled={disabled || loading}
      onClick={handleClick}
    >
      {loading ? (
        <span class="i-lucide-loader-2 animate-spin" />
      ) : icon ? (
        <span>{icon}</span>
      ) : null}
      <span>{label}</span>
    </button>
  )
}

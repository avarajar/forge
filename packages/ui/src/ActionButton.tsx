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

  const variantStyles: Record<string, { bg: string; hover: string; text: string; border?: string }> = {
    primary: { bg: 'var(--forge-accent)', hover: 'var(--forge-accent)', text: '#ffffff' },
    secondary: { bg: 'var(--forge-surface)', hover: 'var(--forge-border)', text: 'var(--forge-text)', border: 'var(--forge-border)' },
    danger: { bg: 'var(--forge-error)', hover: 'var(--forge-error)', text: '#ffffff' }
  }

  const s = variantStyles[variant]

  return (
    <button
      class="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        backgroundColor: s.bg,
        color: s.text,
        border: s.border ? `1px solid ${s.border}` : 'none'
      }}
      disabled={disabled || loading}
      onClick={handleClick}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
    >
      {loading ? (
        <span class="i-lucide-loader-2 animate-spin" />
      ) : null}
      <span>{label}</span>
    </button>
  )
}

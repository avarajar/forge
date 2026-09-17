import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'

type Variant = 'primary' | 'secondary' | 'danger' | 'destructive'
type Size = 'sm' | 'md' | 'lg'

interface ActionButtonProps {
  label: string
  icon?: string
  variant?: Variant
  size?: Size
  block?: boolean
  title?: string
  disabled?: boolean
  loading?: boolean
  onClick: () => void | Promise<void>
}

const SIZES: Record<Size, { pad: string; primaryPad: string; font: string; radius: string }> = {
  sm: { pad: '6px 12px', primaryPad: '6px 14px', font: '12.5px', radius: '9px' },
  md: { pad: '7px 13px', primaryPad: '7px 15px', font: '13px', radius: '9px' },
  lg: { pad: '12px 16px', primaryPad: '12px 16px', font: '14.5px', radius: '12px' },
}

const VARIANTS: Record<Variant, Record<string, string>> = {
  primary: { background: 'linear-gradient(180deg, var(--blue-2), var(--blue))', color: '#fff', border: '0', boxShadow: 'var(--shadow-m)', fontWeight: '600' },
  secondary: { background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', fontWeight: '500' },
  // a quiet secondary with red ink, for deletes that sit next to other actions
  danger: { background: 'var(--card)', color: 'var(--red)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', fontWeight: '500' },
  destructive: { background: 'var(--red)', color: '#fff', border: '0', boxShadow: 'var(--shadow-m)', fontWeight: '600' },
}

const DISABLED = { background: 'var(--elev)', color: 'var(--ink-3)', border: '1px solid transparent', boxShadow: 'none', opacity: '.8' }

export const ActionButton: FunctionComponent<ActionButtonProps> = ({
  label, icon, variant = 'primary', size = 'md', block, title, disabled, loading: externalLoading, onClick
}) => {
  const [internalLoading, setInternalLoading] = useState(false)
  const loading = externalLoading ?? internalLoading
  const inactive = Boolean(disabled || loading)

  const handleClick = async () => {
    if (inactive) return
    setInternalLoading(true)
    try {
      await onClick()
    } finally {
      setInternalLoading(false)
    }
  }

  const s = SIZES[size]
  const filled = variant === 'primary' || variant === 'destructive'
  const look = disabled && !loading ? { ...VARIANTS[variant], ...DISABLED } : VARIANTS[variant]

  return (
    <button
      type="button"
      class={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-all duration-180 ease-spring ${
        inactive ? 'cursor-not-allowed' : `cursor-pointer hover:-translate-y-px hover:shadow-m${filled ? ' hover:brightness-106' : ''}`
      }${block ? ' w-full' : ''}`}
      style={{ ...look, padding: filled ? s.primaryPad : s.pad, fontSize: s.font, borderRadius: s.radius }}
      disabled={inactive}
      title={title}
      onClick={handleClick}
    >
      {loading ? <span class="i-lucide-loader-2 animate-spin" /> : icon ? <span class={icon} /> : null}
      <span>{label}</span>
    </button>
  )
}

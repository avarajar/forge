import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'

type Variant = 'primary' | 'secondary' | 'danger' | 'destructive' | 'ghost'
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
  sm: { pad: '6px 12px', primaryPad: '6px 14px', font: '12.5px', radius: 'var(--r-sm)' },
  md: { pad: '7px 13px', primaryPad: '7px 15px', font: '13px', radius: 'var(--r-sm)' },
  lg: { pad: '10px 18px', primaryPad: '10px 18px', font: '14px', radius: 'var(--r-md)' },
}

const VARIANTS: Record<Variant, Record<string, string>> = {
  primary: { background: 'linear-gradient(180deg, var(--accent-top), var(--accent-bot))', color: 'var(--on-accent)', border: '0', boxShadow: 'var(--shadow-primary)', fontWeight: '600' },
  secondary: { background: 'var(--card)', color: 'var(--ink)', border: '0', boxShadow: 'var(--shadow-s)', fontWeight: '500' },
  // a quiet secondary with red ink, for deletes that sit next to other actions
  danger: { background: 'var(--card)', color: 'var(--red-ink, var(--red))', border: '0', boxShadow: 'var(--shadow-s)', fontWeight: '500' },
  destructive: { background: 'var(--red-fill, var(--red))', color: '#fff', border: '0', boxShadow: 'var(--shadow-s)', fontWeight: '600' },
  // text only, for a third action that should not compete
  ghost: { background: 'transparent', color: 'var(--blue-ink)', border: '0', boxShadow: 'none', fontWeight: '600' },
}

const DISABLED = { background: 'var(--well)', color: 'var(--ink-4)', border: '0', boxShadow: 'var(--inset-s)', opacity: '1' }

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
  const hover = variant === 'ghost' ? 'hover:bg-elev' : `hover:-translate-y-px ${filled ? 'hover:brightness-106' : 'hover:shadow-m'}`
  const look = disabled && !loading ? { ...VARIANTS[variant], ...DISABLED } : VARIANTS[variant]

  return (
    <button
      type="button"
      class={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-all duration-180 ease-spring ${
        inactive ? 'cursor-not-allowed' : `cursor-pointer ${hover}`
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

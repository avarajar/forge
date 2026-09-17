import { type FunctionComponent } from 'preact'

interface BadgeProps {
  label: string
  color?: string
  variant?: 'tint' | 'neutral'
  dot?: boolean
}

export const Badge: FunctionComponent<BadgeProps> = ({
  label, color = 'var(--ink-2)', variant = 'tint', dot
}) => {
  const style = variant === 'tint'
    ? { background: `color-mix(in srgb, ${color} 18%, transparent)`, color }
    : { background: 'var(--elev)', color: 'var(--ink-2)', border: '1px solid var(--hair)' }

  return (
    <span
      class="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
      style={{ ...style, padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 600 }}
    >
      {dot && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />}
      {label}
    </span>
  )
}

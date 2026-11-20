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
    ? { background: `color-mix(in srgb, ${color} var(--tint, 18%), transparent)`, color }
    : { background: 'var(--well)', color: 'var(--ink-2)' }

  return (
    <span
      class="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
      style={{ ...style, height: '20px', padding: '0 8px', borderRadius: 'var(--r-pill)', fontSize: '11px', lineHeight: '20px', fontWeight: 600 }}
    >
      {dot && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />}
      {label}
    </span>
  )
}

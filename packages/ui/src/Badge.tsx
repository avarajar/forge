import { type FunctionComponent } from 'preact'

interface BadgeProps {
  label: string
  color?: string
  variant?: 'solid' | 'outline'
}

export const Badge: FunctionComponent<BadgeProps> = ({
  label, color = 'var(--forge-muted)', variant = 'solid'
}) => {
  const baseClass = 'px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center'
  const variantStyle = variant === 'solid'
    ? { backgroundColor: color, color: 'white' }
    : { border: `1px solid ${color}`, color }

  return (
    <span class={baseClass} style={variantStyle}>
      {label}
    </span>
  )
}

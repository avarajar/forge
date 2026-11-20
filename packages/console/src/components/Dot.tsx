import { type FunctionComponent } from 'preact'

import type { DotShape } from '../config/types.js'

// a status dot; live solid dots glow and breathe, the other shapes tell states apart without hue
export const Dot: FunctionComponent<{ size?: number; color?: string; live?: boolean; glow?: boolean; shape?: DotShape }> = ({
  size = 7, color, live, glow = live, shape = 'solid',
}) => {
  const c = color ?? (live ? 'var(--green)' : 'var(--ink-3)')
  const solid = shape === 'solid'
  return (
    <span
      aria-hidden="true"
      class={`shrink-0 inline-block${live && solid ? ' breathe' : ''}${solid ? '' : ` dot-${shape}`}`}
      style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', color: c, background: c, boxShadow: glow && solid ? `0 0 8px ${c}` : 'none' }}
    />
  )
}

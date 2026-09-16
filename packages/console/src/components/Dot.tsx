import { type FunctionComponent } from 'preact'

// a status dot; live dots glow and breathe
export const Dot: FunctionComponent<{ size?: number; color?: string; live?: boolean; glow?: boolean }> = ({
  size = 7, color, live, glow = live,
}) => {
  const c = color ?? (live ? 'var(--green)' : 'var(--ink-3)')
  return (
    <span
      aria-hidden="true"
      class={`shrink-0 inline-block${live ? ' breathe' : ''}`}
      style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', background: c, boxShadow: glow ? `0 0 8px ${c}` : 'none' }}
    />
  )
}

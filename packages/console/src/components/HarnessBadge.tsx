import { type FunctionComponent } from 'preact'
import type { CWSession } from '@forge-dev/core'
import { getHarnessStyle, harnessLabel } from '../config/types.js'

export const HarnessBadge: FunctionComponent<{
  session: Pick<CWSession, 'harness' | 'provider' | 'model'>
  muted?: boolean
  // dot and ink-2 text, no tint: for a header that names the common harness
  quiet?: boolean
}> = ({ session, muted, quiet }) => {
  const style = getHarnessStyle(session.harness)
  if (quiet) {
    return (
      <span
        class={`harness-pill inline-flex items-center shrink-0 whitespace-nowrap${muted ? ' opacity-60' : ''}`}
        style={{ gap: '6px', fontSize: '12px', fontWeight: 500, color: 'var(--ink-2)' }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: style.color }} />
        {harnessLabel(session)}
      </span>
    )
  }
  return (
    <span
      class={`harness-pill inline-flex items-center shrink-0 whitespace-nowrap${muted ? ' opacity-60' : ''}`}
      style={{ gap: '6px', height: '20px', padding: '0 8px', borderRadius: 'var(--r-pill)', background: style.bg, color: style.ink, fontSize: '11px', fontWeight: 600 }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: style.color }} />
      {harnessLabel(session)}
    </span>
  )
}

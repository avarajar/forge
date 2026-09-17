import { type FunctionComponent } from 'preact'
import type { CWSession } from '@forge-dev/core'
import { getHarnessStyle, harnessLabel } from '../config/types.js'

export const HarnessBadge: FunctionComponent<{
  session: Pick<CWSession, 'harness' | 'provider' | 'model'>
  muted?: boolean
}> = ({ session, muted }) => {
  const style = getHarnessStyle(session.harness)
  return (
    <span
      class={`harness-pill inline-flex items-center shrink-0 whitespace-nowrap${muted ? ' opacity-60' : ''}`}
      style={{ gap: '6px', padding: '3px 9px', borderRadius: '99px', background: style.bg, color: style.color, fontSize: '11.5px', fontWeight: 600 }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: style.color }} />
      {harnessLabel(session)}
    </span>
  )
}

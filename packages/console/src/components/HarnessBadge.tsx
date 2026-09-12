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
      class={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap${muted ? ' opacity-60' : ''}`}
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      <span class="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: style.color }} />
      {harnessLabel(session)}
    </span>
  )
}

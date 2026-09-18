import { type ComponentChildren, type FunctionComponent } from 'preact'
import { UsageMeter } from '@forge-dev/ui'
import { usageBars } from '../config/types.js'
import { usageFor } from '../hooks/useUsage.js'

// indented to the harness name column of the row above
const Row: FunctionComponent<{ children: ComponentChildren }> = ({ children }) => (
  <div class="flex" style={{ padding: '0 15px 11px' }}>
    <span class="shrink-0" style={{ width: '144px' }} />
    <span class="flex flex-col flex-1" style={{ gap: '5px', minWidth: 0 }}>{children}</span>
  </div>
)

const Note: FunctionComponent<{ warn?: boolean }> = ({ warn, children }) => (
  <span style={{ fontSize: '11.5px', color: warn ? 'var(--orange)' : 'var(--ink-3)' }}>{children}</span>
)

export const AccountLimits: FunctionComponent<{ account: string; harness: string }> = ({ account, harness }) => {
  const state = usageFor(account, harness)
  if (!state || state.state === 'not_connected') return null
  if (state.state === 'expired') return <Row><Note warn>Reconnect to see usage limits</Note></Row>
  if (state.state === 'error') return <Row><Note>Limits unavailable — {state.detail ?? 'the request failed'}</Note></Row>
  if (state.windows.length === 0) return null
  return (
    <Row>
      <UsageMeter bars={usageBars(state.windows)} />
      {state.stale && <Note>Last known values — {state.detail ?? 'the refresh failed'}</Note>}
    </Row>
  )
}

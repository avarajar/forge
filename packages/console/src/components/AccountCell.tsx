import { type FunctionComponent, type ComponentChildren } from 'preact'
import type { CWDoctorCell } from '@forge-dev/core'

export type CellView =
  | { kind: 'connecting' }
  | { kind: 'not_installed'; detail: string }
  | { kind: 'error'; detail: string }
  | { kind: 'local'; providerModel: string; reachable: boolean | null; pulled: boolean | null }
  | { kind: 'api_key'; providerModel: string | null }
  | { kind: 'connected' }
  | { kind: 'connect' }

export const cellView = (cell: CWDoctorCell, connecting: boolean): CellView => {
  if (connecting) return { kind: 'connecting' }
  const detail = typeof cell.detail === 'string' ? cell.detail : ''
  const providerModel = [cell.provider, cell.model].filter(Boolean).join(' · ')
  if (cell.status === 'not_installed') return { kind: 'not_installed', detail }
  if (cell.status === 'error') return { kind: 'error', detail }
  if (cell.status === 'local') {
    const local = cell.detail && typeof cell.detail === 'object' ? cell.detail : null
    return { kind: 'local', providerModel, reachable: local?.reachable ?? null, pulled: local?.model_pulled ?? null }
  }
  if (cell.status === 'connected' && (cell.provider_kind === 'api' || cell.has_api_key)) {
    return { kind: 'api_key', providerModel: cell.provider !== 'native' ? providerModel : null }
  }
  if (cell.status === 'connected') return { kind: 'connected' }
  return { kind: 'connect' }
}

const Status: FunctionComponent<{ color: string; label: string }> = ({ color, label }) => (
  <span class="inline-flex items-center gap-1.5 font-semibold" style={{ color }}>
    <span class="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </span>
)

const Sub: FunctionComponent<{ children: ComponentChildren }> = ({ children }) => (
  <span class="text-[11px] text-forge-muted">{children}</span>
)

export const AccountCell: FunctionComponent<{
  cell: CWDoctorCell
  connecting: boolean
  onConnect: () => void
  onCancel: () => void
}> = ({ cell, connecting, onConnect, onCancel }) => {
  const view = cellView(cell, connecting)
  return (
    <div class="grid gap-0.5 justify-items-start text-xs">
      {view.kind === 'connecting' && (
        <>
          <Status color="var(--forge-accent)" label="Connecting…" />
          <button class="text-[11px] text-forge-muted underline" onClick={onCancel}>Cancel</button>
        </>
      )}
      {view.kind === 'not_installed' && (
        <>
          <span class="text-forge-muted">Not installed</span>
          {view.detail && <Sub>{view.detail}</Sub>}
        </>
      )}
      {view.kind === 'error' && (
        <>
          <Status color="var(--forge-error)" label="Error" />
          {view.detail && <Sub>{view.detail}</Sub>}
        </>
      )}
      {view.kind === 'local' && (
        <>
          <Status color="var(--forge-warning)" label="Local" />
          <Sub>{view.providerModel}</Sub>
          {view.reachable !== null && (
            <Sub>
              {view.reachable ? 'reachable ✓' : 'unreachable ✗'}
              {view.pulled !== null && ` · ${view.pulled ? 'model pulled ✓' : 'model not pulled ✗'}`}
            </Sub>
          )}
        </>
      )}
      {view.kind === 'api_key' && (
        <>
          <Status color="var(--forge-success)" label="API key" />
          {view.providerModel && <Sub>{view.providerModel}</Sub>}
        </>
      )}
      {view.kind === 'connected' && <Status color="var(--forge-success)" label="Connected" />}
      {view.kind === 'connect' && (
        <>
          <button
            class="px-2.5 py-1 rounded-lg text-xs font-semibold border text-forge-accent"
            style={{ backgroundColor: 'var(--forge-tint-accent-bg)', borderColor: 'var(--forge-accent)' }}
            onClick={onConnect}
          >
            Connect
          </button>
          <Sub>not logged in</Sub>
        </>
      )}
      {cell.unofficial && (
        <span class="text-[10px] px-1.5 rounded" style={{ color: 'var(--forge-warning)', border: '1px solid currentColor' }}>
          unofficial
        </span>
      )}
    </div>
  )
}

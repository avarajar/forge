import { type FunctionComponent } from 'preact'
import type { CWDoctorCell } from '@forge-dev/core'
import { soft } from '../config/types.js'

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

// the grey line between the harness name and its status
export const cellDetailLine = (view: CellView, version: string | null, headless: boolean, cell: CWDoctorCell): string => {
  const parts: string[] = []
  switch (view.kind) {
    case 'connecting': parts.push('Waiting for the login to finish'); break
    case 'not_installed': parts.push(view.detail || 'Not on PATH'); break
    case 'error': parts.push(view.detail || 'cw doctor reported an error'); break
    case 'local': {
      const checks = [
        view.reachable === null ? null : view.reachable ? 'reachable' : 'unreachable',
        view.pulled === null ? null : view.pulled ? 'model pulled' : 'model not pulled',
      ].filter(Boolean).join(', ')
      parts.push(...[view.providerModel, checks].filter(Boolean))
      break
    }
    case 'api_key': parts.push(...[view.providerModel, 'stored by cw'].filter((p): p is string => Boolean(p))); break
    case 'connected': parts.push(...[cell.model, version].filter((p): p is string => Boolean(p))); if (parts.length === 0) parts.push('Signed in'); break
    case 'connect': parts.push(headless ? 'Not logged in — device code, no terminal needed' : 'Not logged in'); break
  }
  if (cell.unofficial) parts.push('unofficial')
  return parts.join(' · ')
}

const Pill: FunctionComponent<{ token: string | null; label: string }> = ({ token, label }) => (
  <span
    class="inline-flex items-center shrink-0 whitespace-nowrap"
    style={{
      gap: '6px', padding: '3px 10px', borderRadius: '99px', fontSize: '11.5px', fontWeight: 600,
      background: token ? soft(token) : 'var(--elev)', color: token ? `var(${token})` : 'var(--ink-3)',
    }}
  >
    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
    {label}
  </span>
)

export const AccountCell: FunctionComponent<{
  view: CellView
  onConnect: () => void
  onCancel: () => void
}> = ({ view, onConnect, onCancel }) => {
  switch (view.kind) {
    case 'connecting':
      return (
        <span class="inline-flex items-center shrink-0" style={{ gap: '8px' }}>
          <Pill token="--blue" label="Connecting…" />
          <button type="button" class="cursor-pointer hover:text-ink" style={{ border: 0, background: 'none', color: 'var(--ink-2)', fontSize: '12px' }} onClick={onCancel}>Cancel</button>
        </span>
      )
    case 'not_installed': return <Pill token={null} label="Not installed" />
    case 'error': return <Pill token="--red" label="Error" />
    case 'local': return <Pill token="--orange" label="Local" />
    case 'api_key': return <Pill token="--green" label="API key" />
    case 'connected': return <Pill token="--green" label="Connected" />
    case 'connect':
      return (
        <button
          type="button"
          class="shrink-0 cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px hover:brightness-106"
          style={{ padding: '5px 13px', borderRadius: '9px', border: 0, background: 'linear-gradient(180deg, var(--blue-2), var(--blue))', color: '#fff', fontSize: '12.5px', fontWeight: 600, boxShadow: 'var(--shadow-m)' }}
          onClick={onConnect}
        >
          Connect
        </button>
      )
  }
}

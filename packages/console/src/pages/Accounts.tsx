import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { findCell, getHarnessStyle } from '../config/types.js'
import { harnesses, loadHarnesses, supportsIn } from '../hooks/useHarnesses.js'
import { AccountCell } from '../components/AccountCell.js'
import { DeviceLoginPanel } from '../components/DeviceLoginPanel.js'
import { AddAccountForm } from '../components/AddAccountForm.js'
import { HarnessBadge } from '../components/HarnessBadge.js'

interface AccountsProps {
  onBack: () => void
  onOpenSession: (session: CWSession) => void
  onAccountsChanged: () => void
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export const Accounts: FunctionComponent<AccountsProps> = ({ onBack, onOpenSession, onAccountsChanged }) => {
  const [deviceLogin, setDeviceLogin] = useState<{ account: string; harness: string } | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => { loadHarnesses() }, [])

  const response = harnesses.value
  const remote = !LOCAL_HOSTS.has(window.location.hostname)

  const cancelDeviceLogin = () => {
    if (!deviceLogin) return
    fetch(`/api/cw/accounts/${encodeURIComponent(deviceLogin.account)}/login/${encodeURIComponent(deviceLogin.harness)}`, { method: 'DELETE' })
      .catch(() => {})
    setDeviceLogin(null)
  }

  const connect = async (account: string, harness: string) => {
    if (supportsIn(response, harness, 'headless_login')) {
      setDeviceLogin({ account, harness })
      return
    }
    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'login', account, harness }),
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok && result.session) onOpenSession(result.session)
      else showToast(result.error ?? 'Could not open the login', 'error')
    } catch {
      showToast('Could not open the login', 'error')
    }
  }

  return (
    <div>
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
        style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
        onClick={onBack}
      >
        ← Back to tasks
      </button>

      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">Accounts</h2>
        <div class="flex gap-2">
          <ActionButton label="Refresh" variant="secondary" onClick={() => { loadHarnesses(true) }} />
          <ActionButton label="+ Add account" variant="primary" onClick={() => setAdding(true)} />
        </div>
      </div>

      {adding && (
        <AddAccountForm
          response={response}
          onCancel={() => setAdding(false)}
          onCreated={() => { setAdding(false); loadHarnesses(true); onAccountsChanged() }}
        />
      )}

      {!response && <p class="text-sm text-forge-muted">Reading cw doctor…</p>}

      {response && !response.available && (
        <div class="rounded-xl p-4 text-sm" style={{ border: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
          <p class="mb-1 text-forge-text">Harness status is unavailable: {response.reason}</p>
          <p class="text-xs text-forge-muted mb-3">The account matrix needs CW 0.3.0 or newer. You can still add an account by name.</p>
          <ActionButton label="Retry" variant="secondary" onClick={() => { loadHarnesses(true) }} />
        </div>
      )}

      {response?.available && (
        <>
          {remote && (
            <div class="rounded-lg px-3 py-2 mb-4 text-xs text-forge-text" style={{ backgroundColor: 'var(--forge-tint-amber-bg)', border: '1px solid var(--forge-tint-amber-border)' }}>
              Forge is not opened on localhost. Browser logins redirect to localhost on the machine running the harness, so only Codex's device code works from here.
            </div>
          )}

          {[...response.doctor.issues, ...response.doctor.warnings].length > 0 && (
            <ul class="mb-4 grid gap-1 text-xs">
              {response.doctor.issues.map(f => <li key={f.code} style={{ color: 'var(--forge-error)' }}>{f.message}</li>)}
              {response.doctor.warnings.map(f => <li key={f.code} class="text-forge-muted">{f.message}</li>)}
            </ul>
          )}

          <div class="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
            <table class="w-full text-sm">
              <thead>
                <tr>
                  <th class="text-left p-3 text-xs font-semibold text-forge-muted">Account</th>
                  {response.doctor.harnesses.map(h => (
                    <th key={h.name} class="text-left p-3" style={{ minWidth: '150px' }}>
                      <HarnessBadge session={{ harness: h.name }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {response.doctor.accounts.map(account => {
                  const defaultCell = findCell(response.doctor, account.name, account.default_harness)
                  return (
                    <tr key={account.name} style={{ borderTop: '1px solid var(--forge-ghost-border)' }}>
                      <td class="p-3 align-top">
                        <div class="font-semibold text-forge-text">{account.name}</div>
                        <div class="text-xs text-forge-muted">
                          default: {getHarnessStyle(account.default_harness).label}
                          {defaultCell && defaultCell.provider !== 'native' ? ` · ${defaultCell.provider}` : ''}
                        </div>
                      </td>
                      {response.doctor.harnesses.map(h => {
                        const cell = findCell(response.doctor, account.name, h.name)
                        return (
                          <td key={h.name} class="p-3 align-top">
                            {cell ? (
                              <AccountCell
                                cell={cell}
                                connecting={deviceLogin?.account === account.name && deviceLogin.harness === h.name}
                                onConnect={() => { connect(account.name, h.name) }}
                                onCancel={cancelDeviceLogin}
                              />
                            ) : <span class="text-xs text-forge-muted">—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {deviceLogin && (
            <div class="mt-4 max-w-lg">
              <DeviceLoginPanel
                key={`${deviceLogin.account}::${deviceLogin.harness}`}
                account={deviceLogin.account}
                harness={deviceLogin.harness}
                canUseApiKey={supportsIn(response, deviceLogin.harness, 'api_key_login')}
                onConnected={() => setDeviceLogin(null)}
                onClose={() => setDeviceLogin(null)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

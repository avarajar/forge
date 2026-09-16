import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import type { CWDoctorAccount, CWSession } from '@forge-dev/core'
import { findCell, getHarnessStyle, soft } from '../config/types.js'
import { harnesses, loadHarnesses, supportsIn } from '../hooks/useHarnesses.js'
import { AccountCell, cellDetailLine, cellView } from '../components/AccountCell.js'
import { DeviceLoginPanel } from '../components/DeviceLoginPanel.js'
import { AddAccountForm } from '../components/AddAccountForm.js'
import { PageHeader } from '../components/PageHeader.js'
import type { ProjectMap } from '../components/StartCard.js'

interface AccountsProps {
  projects: ProjectMap
  onOpenSession: (session: CWSession) => void
  onAccountsChanged: () => void
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const AVATARS: Array<[string, string]> = [['--blue', '--purple'], ['--teal', '--blue'], ['--orange', '--red'], ['--green', '--teal']]

const card = { borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-m)', overflow: 'hidden' }
const note = { padding: '10px 14px', borderRadius: '12px', fontSize: '12.5px' }

const RemoveAccount: FunctionComponent<{ account: string; onRemoved: () => void }> = ({ account, onRemoved }) => {
  const [confirming, setConfirming] = useState(false)

  const remove = async () => {
    try {
      const res = await fetch(`/api/cw/accounts/${encodeURIComponent(account)}`, { method: 'DELETE' })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast(`Account "${account}" removed`, 'info')
        onRemoved()
      } else {
        showToast(result.error ?? 'Failed to remove account', 'error')
      }
    } catch {
      showToast('Failed to remove account', 'error')
    } finally {
      setConfirming(false)
    }
  }

  if (!confirming) {
    return <ActionButton label="Remove" variant="danger" size="sm" onClick={() => setConfirming(true)} />
  }
  return (
    <span class="flex items-center flex-wrap" style={{ gap: '8px' }}>
      <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>Deletes the profile and its harness config. Projects stay.</span>
      <ActionButton label="Remove account" variant="destructive" size="sm" onClick={remove} />
      <ActionButton label="Cancel" variant="secondary" size="sm" onClick={() => setConfirming(false)} />
    </span>
  )
}

export const Accounts: FunctionComponent<AccountsProps> = ({ projects, onOpenSession, onAccountsChanged }) => {
  const [deviceLogin, setDeviceLogin] = useState<{ account: string; harness: string } | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => { loadHarnesses() }, [])

  const response = harnesses.value
  const remote = !LOCAL_HOSTS.has(window.location.hostname)
  const doctor = response?.available ? response.doctor : null

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

  const needsConnecting = doctor
    ? doctor.accounts.reduce((n, a) => n + a.harnesses.filter(c => c.status === 'not_logged_in').length, 0)
    : 0
  const subtitle = doctor
    ? `${doctor.accounts.length} account${doctor.accounts.length === 1 ? '' : 's'} · ${doctor.harnesses.length} harnesses · ${needsConnecting} need${needsConnecting === 1 ? 's' : ''} connecting`
    : 'Reading cw doctor…'

  const projectCount = (account: string) => Object.values(projects).filter(p => p.account === account).length

  const renderAccount = (account: CWDoctorAccount, index: number) => {
    if (!doctor) return null
    const [c1, c2] = AVATARS[index % AVATARS.length]
    const n = projectCount(account.name)
    const defaultCell = findCell(doctor, account.name, account.default_harness)
    const defaultLabel = [getHarnessStyle(account.default_harness).label, defaultCell && defaultCell.provider !== 'native' ? defaultCell.provider : null].filter(Boolean).join(' · ')
    return (
      <section key={account.name} style={{ ...card, animation: `riseIn .36s var(--ease) ${index * 90}ms both` }} aria-label={account.name}>
        <div class="flex items-center flex-wrap" style={{ gap: '11px', padding: '12px 15px', borderBottom: '1px solid var(--hair)', background: 'var(--elev)' }}>
          <span class="grid place-items-center shrink-0" style={{ width: '28px', height: '28px', borderRadius: '9px', background: `linear-gradient(160deg, var(${c1}), var(${c2}))`, boxShadow: 'var(--shadow-s)', color: '#fff', fontSize: '12px', fontWeight: 700 }}>
            {account.name.charAt(0).toUpperCase()}
          </span>
          <span style={{ fontSize: '15px', fontWeight: 650, letterSpacing: '-0.01em' }}>{account.name}</span>
          <span style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>Default {defaultLabel} · {n} project{n === 1 ? '' : 's'}</span>
          <span class="flex-1" />
          <RemoveAccount account={account.name} onRemoved={() => { loadHarnesses(true); onAccountsChanged() }} />
        </div>
        {doctor.harnesses.map(h => {
          const cell = findCell(doctor, account.name, h.name)
          const connecting = deviceLogin?.account === account.name && deviceLogin.harness === h.name
          const style = getHarnessStyle(h.name)
          const view = cell ? cellView(cell, connecting) : null
          return (
            <div key={h.name} style={{ borderBottom: '1px solid var(--hair)' }}>
              <div class="flex items-center flex-wrap" style={{ gap: '12px', padding: '11px 15px' }}>
                <span class="inline-flex items-center shrink-0" style={{ gap: '6px', width: '132px', fontSize: '13px', fontWeight: 600 }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: style.color }} />
                  {style.label}
                </span>
                <span class="flex-1" style={{ minWidth: '140px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
                  {cell && view ? cellDetailLine(view, h.version, supportsIn(response, h.name, 'headless_login'), cell) : 'Not configured for this account'}
                </span>
                {view && <AccountCell view={view} onConnect={() => { void connect(account.name, h.name) }} onCancel={cancelDeviceLogin} />}
              </div>
              {connecting && (
                <div style={{ padding: '0 15px 13px' }}>
                  <DeviceLoginPanel
                    key={`${account.name}::${h.name}`}
                    account={account.name}
                    harness={h.name}
                    canUseApiKey={supportsIn(response, h.name, 'api_key_login')}
                    onConnected={() => setDeviceLogin(null)}
                    onClose={() => setDeviceLogin(null)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </section>
    )
  }

  return (
    <>
      <PageHeader title="Accounts" subtitle={subtitle}>
        <ActionButton label="Refresh" variant="secondary" onClick={() => { void loadHarnesses(true) }} />
        <ActionButton label="Add account" variant="primary" onClick={() => setAdding(true)} />
      </PageHeader>

      <div class="flex flex-col w-full" style={{ padding: '18px 22px 40px', gap: '14px', maxWidth: '1180px' }}>
        {adding && (
          <AddAccountForm
            response={response}
            onCancel={() => setAdding(false)}
            onCreated={() => { setAdding(false); loadHarnesses(true); onAccountsChanged() }}
          />
        )}

        {response && !response.available && (
          <section style={{ ...card, padding: '16px 18px' }}>
            <p style={{ fontSize: '13.5px', marginBottom: '4px' }}>Harness status is unavailable: {response.reason}</p>
            <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', marginBottom: '12px' }}>The account view needs CW 0.3.0 or newer. You can still add an account by name.</p>
            <ActionButton label="Retry" variant="secondary" size="sm" onClick={() => { void loadHarnesses(true) }} />
          </section>
        )}

        {doctor && remote && (
          <p style={{ ...note, background: soft('--orange') }}>
            Forge is not opened on localhost. Browser logins redirect to localhost on the machine running the harness, so only device-code logins work from here.
          </p>
        )}

        {doctor && doctor.issues.map(f => <p key={f.code} style={{ ...note, background: soft('--red'), color: 'var(--ink)' }}>{f.message}</p>)}
        {doctor && doctor.warnings.map(f => <p key={f.code} style={{ ...note, background: 'var(--elev)', color: 'var(--ink-2)' }}>{f.message}</p>)}

        {doctor?.accounts.map(renderAccount)}
      </div>
    </>
  )
}

import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import { findCell, getHarnessStyle } from '../config/types.js'
import { loadHarnesses, watchUntil } from '../hooks/useHarnesses.js'

interface LoginState {
  status: 'running' | 'exited'
  url: string | null
  code: string | null
  exitCode: number | null
  output: string[]
}

interface DeviceLoginPanelProps {
  account: string
  harness: string
  canUseApiKey: boolean
  onConnected: () => void
  onClose: () => void
}

const POLL_MS = 3000

export const DeviceLoginPanel: FunctionComponent<DeviceLoginPanelProps> = ({
  account, harness, canUseApiKey, onConnected, onClose,
}) => {
  const [login, setLogin] = useState<LoginState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)

  const label = getHarnessStyle(harness).label
  const accountUrl = `/api/cw/accounts/${encodeURIComponent(account)}`
  const stateUrl = `${accountUrl}/login/${encodeURIComponent(harness)}`

  useEffect(() => {
    let cancelled = false
    let poll: ReturnType<typeof setInterval> | null = null
    setLogin(null)

    const read = async () => {
      const res = await fetch(stateUrl).catch(() => null)
      if (!res?.ok || cancelled) return
      const { login: next } = await res.json() as { login: LoginState }
      setLogin(next)
      if (next.status === 'exited' && poll) {
        clearInterval(poll)
        poll = null
      }
    }

    fetch(`${accountUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ harness }),
    })
      .then(r => r.json() as Promise<{ ok: boolean; error?: string; login?: LoginState }>)
      .then((result) => {
        if (cancelled) return
        if (!result.ok || !result.login) {
          showToast(result.error ?? 'Could not start the login', 'error')
          return
        }
        setLogin(result.login)
        poll = setInterval(read, POLL_MS)
      })
      .catch(() => showToast('Could not start the login', 'error'))

    const stopWatching = watchUntil(
      doctor => findCell(doctor, account, harness)?.status === 'connected',
      {
        onDone: (matched) => {
          if (!matched) return
          fetch(stateUrl, { method: 'DELETE' }).catch(() => {})
          showToast(`${account} is connected to ${label}`, 'success')
          onConnected()
        },
      },
    )

    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      stopWatching()
      fetch(stateUrl, { method: 'DELETE' }).catch(() => {})
    }
  }, [account, harness, attempt])

  const cancel = () => {
    fetch(stateUrl, { method: 'DELETE' }).catch(() => {})
    onClose()
  }

  const saveKey = async () => {
    const key = apiKey.trim()
    if (!key) return
    setSavingKey(true)
    try {
      const res = await fetch(`${accountUrl}/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harness, apiKey: key }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        setApiKey('')
        showToast('API key saved', 'success')
        loadHarnesses(true)
      } else {
        showToast(result.error ?? 'Could not save the API key', 'error')
      }
    } catch {
      showToast('Could not save the API key', 'error')
    } finally {
      setSavingKey(false)
    }
  }

  const exited = login?.status === 'exited'

  return (
    <div class="rounded-xl p-4 grid gap-3" style={{ border: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-forge-text">Connect {account} on {label}</h3>
        <button class="text-xs text-forge-muted hover:text-forge-text" onClick={cancel}>Cancel</button>
      </div>

      {!login && <p class="text-xs text-forge-muted">Starting the login…</p>}

      {login && !exited && (
        <>
          <div class="flex flex-wrap items-center gap-3">
            {login.url && (
              <a
                href={login.url}
                target="_blank"
                rel="noopener noreferrer"
                class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--forge-accent)' }}
              >
                Open login ↗
              </a>
            )}
            {login.code && (
              <>
                <span class="font-mono text-lg tracking-widest text-forge-text">{login.code}</span>
                <button
                  class="px-2 py-1 text-xs rounded border border-forge-border text-forge-muted hover:text-forge-text"
                  onClick={() => { navigator.clipboard.writeText(login.code ?? ''); showToast('Code copied', 'info') }}
                >
                  Copy
                </button>
              </>
            )}
          </div>
          <p class="text-xs text-forge-muted">
            {login.url || login.code ? 'Checks every 3 s. The cell turns Connected on its own.' : 'Waiting for the login URL…'}
          </p>
        </>
      )}

      {exited && (
        <div class="flex items-center gap-3 text-xs">
          <span style={{ color: 'var(--forge-error)' }}>The login ended before connecting.</span>
          <button class="underline text-forge-text" onClick={() => setAttempt(n => n + 1)}>Retry</button>
        </div>
      )}

      {login && login.output.length > 0 && (
        <details class="text-xs">
          <summary class="cursor-pointer text-forge-muted">Output</summary>
          <pre class="mt-2 p-2 rounded overflow-x-auto text-[11px] text-forge-text" style={{ backgroundColor: 'var(--forge-bg)' }}>
            {login.output.join('\n')}
          </pre>
        </details>
      )}

      {canUseApiKey && (
        <div class="grid gap-2 pt-3" style={{ borderTop: '1px solid var(--forge-ghost-border)' }}>
          <span class="text-[11px] uppercase tracking-wider text-forge-muted">or with an API key</span>
          <div class="flex gap-2 items-center">
            <input
              type="password"
              autocomplete="off"
              value={apiKey}
              onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
              placeholder="sk-…"
              class="flex-1 px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            />
            <ActionButton label="Save" variant="secondary" loading={savingKey} disabled={!apiKey.trim()} onClick={saveKey} />
          </div>
          <p class="text-[11px] text-forge-muted">Sent to cw over stdin. Forge never stores or shows it.</p>
        </div>
      )}
    </div>
  )
}

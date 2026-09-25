import { type FunctionComponent } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import { findCell, getHarnessStyle } from '../config/types.js'
import { copyText } from '../config/api.js'
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
  const [checking, setChecking] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)

  const label = getHarnessStyle(harness).label
  const accountUrl = `/api/cw/accounts/${encodeURIComponent(account)}`
  const stateUrl = `${accountUrl}/login/${encodeURIComponent(harness)}`

  // Guards so a success (from the poll or the doctor watcher) and the
  // cleanup's DELETE each run at most once, even if both paths fire.
  const handledRef = useRef(false)
  const exitedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let poll: ReturnType<typeof setInterval> | null = null
    setLogin(null)
    setChecking(false)
    handledRef.current = false
    exitedRef.current = false

    const handleSuccess = () => {
      if (handledRef.current) return
      handledRef.current = true
      fetch(stateUrl, { method: 'DELETE' }).catch(() => {})
      showToast(`${account} is connected to ${label}`, 'success')
      onConnected()
    }

    const read = async () => {
      const res = await fetch(stateUrl).catch(() => null)
      if (!res?.ok || cancelled) return
      const { login: next } = await res.json() as { login: LoginState }
      setLogin(next)
      if (next.status !== 'exited') return
      exitedRef.current = true
      if (poll) {
        clearInterval(poll)
        poll = null
      }
      if (next.exitCode !== 0) return
      // codex exits 0 on a successful login; confirm against a fresh
      // doctor read before deciding it actually connected.
      setChecking(true)
      const result = await loadHarnesses(true)
      if (cancelled) return
      if (result.available && findCell(result.doctor, account, harness)?.status === 'connected') {
        handleSuccess()
      } else {
        setChecking(false)
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
      { onDone: (matched) => { if (matched) handleSuccess() } },
    )

    return () => {
      cancelled = true
      if (poll) clearInterval(poll)
      stopWatching()
      if (!exitedRef.current) fetch(stateUrl, { method: 'DELETE' }).catch(() => {})
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
    <div class="flex flex-col" style={{ gap: '12px', padding: '14px 16px', borderRadius: '16px', background: 'var(--bg-2)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', animation: 'riseIn .3s var(--ease) both' }}>
      <div class="flex items-center" style={{ gap: '10px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 650 }}>Connect {account} on {label}</h3>
        <span class="flex-1" />
        <ActionButton label="Cancel" variant="secondary" size="sm" onClick={cancel} />
      </div>

      {!login && <p style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>Starting the login…</p>}

      {login && !exited && (
        <>
          <div class="flex flex-wrap items-center" style={{ gap: '12px' }}>
            {login.url && (
              <a
                href={login.url}
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 transition-all duration-180 ease-spring hover:-translate-y-px hover:brightness-106"
                style={{ padding: '6px 14px', borderRadius: '9px', background: 'linear-gradient(180deg, var(--blue-2), var(--blue))', color: '#fff', fontSize: '12.5px', fontWeight: 600, boxShadow: 'var(--shadow-m)' }}
              >
                Open login <span class="i-lucide-external-link" style={{ width: '12px', height: '12px' }} />
              </a>
            )}
            {login.code && (
              <>
                <span class="mono" style={{ fontSize: '19px', fontWeight: 650, letterSpacing: '.12em' }}>{login.code}</span>
                <ActionButton label="Copy" variant="secondary" size="sm" onClick={() => copyText(login.code ?? '', 'Code')} />
              </>
            )}
          </div>
          {login.code && (
            <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>If the code is rejected, use the one shown in Output.</p>
          )}
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
            {login.url || login.code ? 'Checks every 3 s. The status turns Connected on its own.' : 'Waiting for the login URL…'}
          </p>
        </>
      )}

      {exited && checking && (
        <p style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>Checking the connection…</p>
      )}

      {exited && !checking && (
        <div class="flex items-center" style={{ gap: '10px', fontSize: '12.5px' }}>
          <span style={{ color: 'var(--red)' }}>The login ended before connecting.</span>
          <ActionButton label="Retry" variant="secondary" size="sm" onClick={() => setAttempt(n => n + 1)} />
        </div>
      )}

      {login && login.output.length > 0 && (
        <details style={{ fontSize: '12.5px' }}>
          <summary class="cursor-pointer" style={{ color: 'var(--ink-2)' }}>Output</summary>
          <pre class="overflow-x-auto" style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '11px', background: 'var(--term)', color: '#e3e3e8', fontSize: '11.5px' }}>
            {login.output.join('\n')}
          </pre>
        </details>
      )}

      {canUseApiKey && (
        <div class="flex flex-col" style={{ gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--hair)' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-3)' }}>Or with an API key</span>
          <div class="flex items-center" style={{ gap: '8px' }}>
            <input
              type="password"
              autocomplete="off"
              aria-label="API key"
              value={apiKey}
              onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
              placeholder="sk-…"
              class="field mono flex-1 min-w-0"
            />
            <ActionButton label="Save" variant="secondary" size="sm" loading={savingKey} disabled={!apiKey.trim()} onClick={saveKey} />
          </div>
          <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Sent to cw over stdin. Forge never stores or shows it.</p>
        </div>
      )}
    </div>
  )
}

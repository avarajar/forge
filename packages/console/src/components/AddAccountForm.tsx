import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { ActionButton, Tabs, showToast } from '@forge-dev/ui'
import { ACCOUNT_NAME_RE, getHarnessStyle } from '../config/types.js'
import { supportsIn, type HarnessesResponse } from '../hooks/useHarnesses.js'

interface AddAccountFormProps {
  response: HarnessesResponse | null
  onCancel: () => void
  onCreated: () => void
}

const inputStyle = { width: '100%', height: '38px', padding: '0 12px', borderRadius: '11px', border: '1px solid var(--hair)', background: 'var(--bg-2)', color: 'var(--ink)', fontSize: '13.5px', outline: 'none' }
const labelStyle = { display: 'block', fontSize: '12px', color: 'var(--ink-2)', marginBottom: '5px' }

export const AddAccountForm: FunctionComponent<AddAccountFormProps> = ({ response, onCancel, onCreated }) => {
  const [name, setName] = useState('')
  const [harness, setHarness] = useState('')
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [creating, setCreating] = useState(false)

  const trimmed = name.trim()
  const valid = ACCOUNT_NAME_RE.test(trimmed)
  const harnessNames = response?.available ? response.doctor.harnesses.map(h => h.name).filter(name => name !== 'claude') : []
  const acceptsProvider = Boolean(harness) && supportsIn(response, harness, 'custom_provider')

  const create = async () => {
    if (!valid || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/cw/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          harness: harness || undefined,
          provider: acceptsProvider ? provider.trim() || undefined : undefined,
          model: acceptsProvider ? model.trim() || undefined : undefined,
        }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast(`Account "${trimmed}" created`, 'success')
        onCreated()
      } else {
        showToast(result.error ?? 'Failed to create account', 'error')
      }
    } catch {
      showToast('Failed to create account', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <section class="flex flex-col" style={{ gap: '14px', padding: '16px 18px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-m)', animation: 'riseIn .3s var(--ease) both' }} aria-label="Add account">
      <h2 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em' }}>Add an account</h2>
      <div style={{ maxWidth: '360px' }}>
        <label style={labelStyle} for="new-account-name">Account name</label>
        <input
          id="new-account-name"
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create() }}
          placeholder="my-account"
          class="field"
          style={inputStyle}
          autoFocus
        />
        {trimmed && !valid && (
          <p style={{ fontSize: '12px', color: 'var(--red)', marginTop: '5px' }}>
            Must start with a letter or number. Only letters, numbers, hyphens, and underscores allowed.
          </p>
        )}
      </div>

      {harnessNames.length > 0 && (
        <div>
          <span style={labelStyle}>Default harness</span>
          <Tabs
            label="Default harness"
            tabs={[{ id: '', label: 'Claude Code' }, ...harnessNames.map(h => ({ id: h, label: getHarnessStyle(h).label }))]}
            active={harness}
            onChange={setHarness}
          />
          <p style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '5px' }}>The default harness cannot be changed later.</p>
        </div>
      )}

      {acceptsProvider && (
        <div class="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '520px' }}>
          <div>
            <label style={labelStyle}>Provider · optional</label>
            <input type="text" value={provider} onInput={(e) => setProvider((e.target as HTMLInputElement).value)} placeholder="zai, ollama, openrouter" class="field" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Model · optional</label>
            <input type="text" value={model} onInput={(e) => setModel((e.target as HTMLInputElement).value)} placeholder="glm-5.1" class="field" style={inputStyle} />
          </div>
        </div>
      )}

      <div class="flex" style={{ gap: '8px' }}>
        <ActionButton label={creating ? 'Creating…' : 'Add account'} variant="primary" loading={creating} disabled={!valid} onClick={create} />
        <ActionButton label="Cancel" variant="secondary" onClick={onCancel} />
      </div>
    </section>
  )
}

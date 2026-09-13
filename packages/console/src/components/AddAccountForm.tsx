import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import { ACCOUNT_NAME_RE, getHarnessStyle } from '../config/types.js'
import { supportsIn, type HarnessesResponse } from '../hooks/useHarnesses.js'

interface AddAccountFormProps {
  response: HarnessesResponse | null
  onCancel: () => void
  onCreated: () => void
}

const inputClass = 'w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none'

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
    <div class="rounded-xl p-4 mb-4 grid gap-3 max-w-lg" style={{ border: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}>
      <div>
        <label class="block text-sm font-medium mb-1">Account name</label>
        <input
          type="text"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create() }}
          placeholder="my-account"
          class={inputClass}
          autoFocus
        />
        {trimmed && !valid && (
          <p class="text-xs mt-1" style={{ color: 'var(--forge-error)' }}>
            Must start with a letter or number. Only letters, numbers, hyphens, and underscores allowed.
          </p>
        )}
      </div>

      {harnessNames.length > 0 && (
        <div>
          <label class="block text-sm font-medium mb-1">Default harness</label>
          <div class="flex flex-wrap gap-2">
            {['', ...harnessNames].map(h => (
              <button
                key={h || 'default'}
                class={`px-3 py-1.5 text-xs rounded-lg border ${harness === h ? 'text-forge-accent' : 'border-forge-border bg-forge-surface text-forge-muted'}`}
                style={harness === h ? { backgroundColor: 'var(--forge-tint-accent-bg)', borderColor: 'var(--forge-accent)' } : undefined}
                onClick={() => setHarness(h)}
              >
                {h ? getHarnessStyle(h).label : 'Claude Code (default)'}
              </button>
            ))}
          </div>
          <p class="text-xs text-forge-muted mt-1">The default harness cannot be changed later.</p>
        </div>
      )}

      {acceptsProvider && (
        <div class="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label class="block text-sm font-medium mb-1">Provider <span class="font-normal text-forge-muted">(optional)</span></label>
            <input type="text" value={provider} onInput={(e) => setProvider((e.target as HTMLInputElement).value)} placeholder="zai, ollama, openrouter" class={inputClass} />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Model <span class="font-normal text-forge-muted">(optional)</span></label>
            <input type="text" value={model} onInput={(e) => setModel((e.target as HTMLInputElement).value)} placeholder="glm-5.1" class={inputClass} />
          </div>
        </div>
      )}

      <div class="flex gap-2">
        <ActionButton label={creating ? 'Creating...' : 'Add account'} variant="primary" loading={creating} disabled={!valid} onClick={create} />
        <ActionButton label="Cancel" variant="secondary" onClick={onCancel} />
      </div>
    </div>
  )
}

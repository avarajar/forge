import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { Modal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

// Shared with server (packages/core/src/cw-types.ts ACCOUNT_NAME_RE)
const ACCOUNT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

interface CreateAccountModalProps {
  open: boolean
  onClose: () => void
  onCreated: (session?: CWSession) => void
}

export const CreateAccountModal: FunctionComponent<CreateAccountModalProps> = ({
  open, onClose, onCreated
}) => {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setCreating(false)
    }
  }, [open])

  const trimmed = name.trim()
  const valid = trimmed.length > 0 && ACCOUNT_NAME_RE.test(trimmed)

  const handleCreate = async () => {
    if (!valid || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/cw/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        let session: CWSession | undefined
        try {
          const launchRes = await fetch('/api/cw/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'general', account: trimmed })
          })
          const launchResult = await launchRes.json() as { ok: boolean; session?: CWSession }
          if (launchResult.ok) session = launchResult.session
        } catch {}
        showToast(`Account "${trimmed}" created — run "claude /login" in the terminal`, 'success')
        onCreated(session)
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
    <Modal
      open={open}
      title="Add Account"
      onClose={onClose}
      onConfirm={valid && !creating ? handleCreate : undefined}
      confirmLabel={creating ? 'Creating...' : 'Add Account'}
    >
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">
            Account Name <span style={{ color: 'var(--forge-error)' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            placeholder="my-account"
            class="w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            autoFocus
          />
          {trimmed && !valid && (
            <p class="text-xs mt-1" style={{ color: 'var(--forge-error)' }}>
              Must start with a letter or number. Only letters, numbers, hyphens, and underscores allowed.
            </p>
          )}
        </div>
        <p class="text-xs text-forge-muted">
          Runs <code class="px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(42,42,62,0.6)' }}>cw account add</code>.
          After creation, authenticate with <code class="px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(42,42,62,0.6)' }}>claude /login</code>.
        </p>
      </div>
    </Modal>
  )
}

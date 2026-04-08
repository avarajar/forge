import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { Modal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface CreateProjectModalProps {
  open: boolean
  accounts: string[]
  onClose: () => void
  onCreated: (session?: CWSession) => void
}

export const CreateProjectModal: FunctionComponent<CreateProjectModalProps> = ({
  open, accounts, onClose, onCreated
}) => {
  const [account, setAccount] = useState('')
  const [name, setName] = useState('')
  const [directory, setDirectory] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('')
  const [creating, setCreating] = useState(false)

  // Auto-select first account when modal opens or accounts change
  useEffect(() => {
    if (open && accounts.length > 0 && !account) {
      setAccount(accounts[0])
    }
  }, [open, accounts])

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setName('')
      setDirectory('')
      setDescription('')
      setModel('')
      setCreating(false)
    }
  }, [open])

  const canCreate = account.trim().length > 0 && name.trim().length > 0 && description.trim().length > 0

  const handleCreate = async () => {
    if (!canCreate) return
    setCreating(true)
    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'create',
          project: name.trim(),
          task: name.trim(),
          description: description.trim(),
          account: account.trim() || undefined,
          directory: directory.trim() || undefined,
          model: model || undefined,
        })
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok) {
        showToast('Project creation started in terminal', 'success')
        onCreated(result.session)
      } else {
        showToast(result.error ?? 'Failed to create project', 'error')
      }
    } catch {
      showToast('Failed to create project', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Create Project"
      onClose={onClose}
      onConfirm={canCreate && !creating ? handleCreate : undefined}
      confirmLabel={creating ? 'Creating...' : 'Create ▶'}
    >
      <div class="space-y-4">
        {/* Account selector */}
        <div>
          <label class="block text-sm font-medium mb-1">
            Account <span style={{ color: 'var(--forge-error)' }}>*</span>
          </label>
          {accounts.length > 0 ? (
            <select
              class="w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              value={account}
              onChange={(e) => setAccount((e.target as HTMLSelectElement).value)}
            >
              {accounts.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={account}
              onInput={(e) => setAccount((e.target as HTMLInputElement).value)}
              placeholder="account-name"
              class="w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            />
          )}
        </div>

        {/* Directory */}
        <div>
          <label class="block text-sm font-medium mb-1">Directory</label>
          <input
            type="text"
            value={directory}
            onInput={(e) => setDirectory((e.target as HTMLInputElement).value)}
            placeholder="~/Workspace/personal"
            class="w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
          />
          <p class="text-xs text-forge-muted mt-1">Where to create the project. Leave empty for CW default.</p>
        </div>

        {/* Project name */}
        <div>
          <label class="block text-sm font-medium mb-1">
            Project Name <span style={{ color: 'var(--forge-error)' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="my-new-project"
            class="w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
          />
        </div>

        {/* Description */}
        <div>
          <label class="block text-sm font-medium mb-1">
            Description <span style={{ color: 'var(--forge-error)' }}>*</span>
          </label>
          <textarea
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
            placeholder="A SaaS platform for..."
            rows={3}
            class="w-full px-3 py-2 rounded-lg bg-forge-bg border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
          />
        </div>

        {/* Model selector */}
        <div>
          <label class="block text-sm font-medium mb-1">Model</label>
          <div class="flex flex-wrap gap-2">
            {[
              { id: '', label: 'Auto' },
              { id: 'haiku', label: 'Haiku' },
              { id: 'sonnet', label: 'Sonnet' },
              { id: 'opus', label: 'Opus' },
            ].map(m => (
              <button
                key={m.id}
                type="button"
                class={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  model === m.id
                    ? 'text-forge-accent'
                    : 'border-forge-border bg-forge-bg text-forge-muted'
                }`}
                style={model === m.id
                  ? { backgroundColor: 'rgba(99,102,241,0.1)', borderColor: 'var(--forge-accent)' }
                  : undefined
                }
                onClick={() => setModel(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <p class="text-xs text-forge-muted">
          Runs <code class="px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(42,42,62,0.6)' }}>cw create</code> in your terminal.
        </p>
      </div>
    </Modal>
  )
}

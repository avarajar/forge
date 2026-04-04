import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { Modal, showToast } from '@forge-dev/ui'

interface CreateProjectModalProps {
  open: boolean
  accounts: string[]
  onClose: () => void
  onCreated: () => void
}

export const CreateProjectModal: FunctionComponent<CreateProjectModalProps> = ({
  open, accounts, onClose, onCreated
}) => {
  const [account, setAccount] = useState('')
  const [name, setName] = useState('')
  const [directory, setDirectory] = useState('')
  const [description, setDescription] = useState('')
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
        })
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Project creation started — check your terminal', 'success')
        onCreated()
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

        <p class="text-xs text-forge-muted">
          Runs <code class="px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(42,42,62,0.6)' }}>cw create</code> in your terminal.
        </p>
      </div>
    </Modal>
  )
}

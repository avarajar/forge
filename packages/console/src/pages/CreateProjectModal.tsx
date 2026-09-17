import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Modal, Tabs, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { DirectoryPicker } from '../components/DirectoryPicker.js'
import { Field, labelStyle } from '../components/Field.js'

type Mode = 'create' | 'existing'

interface CreateProjectModalProps {
  open: boolean
  accounts: string[]
  onClose: () => void
  onCreated: (session?: CWSession) => void
}

export const CreateProjectModal: FunctionComponent<CreateProjectModalProps> = ({
  open, accounts, onClose, onCreated
}) => {
  const [mode, setMode] = useState<Mode>('create')

  // Create-new state
  const [account, setAccount] = useState('')
  const [name, setName] = useState('')
  const [directory, setDirectory] = useState('')
  const [description, setDescription] = useState('')
  const [model, setModel] = useState('')

  // Add-existing state
  const [existingPath, setExistingPath] = useState('')
  const [existingIsGit, setExistingIsGit] = useState(false)
  const [existingAlias, setExistingAlias] = useState('')

  const [busy, setBusy] = useState(false)

  // Auto-select first account when modal opens or accounts change
  useEffect(() => {
    if (open && accounts.length > 0 && !account) {
      setAccount(accounts[0])
    }
  }, [open, accounts])

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setMode('create')
      setName('')
      setDirectory('')
      setDescription('')
      setModel('')
      setExistingPath('')
      setExistingIsGit(false)
      setExistingAlias('')
      setBusy(false)
    }
  }, [open])

  const canCreate = account.trim().length > 0 && name.trim().length > 0 && description.trim().length > 0
  const canRegister = account.trim().length > 0 && existingPath.length > 0 && existingIsGit

  const handleCreate = async () => {
    if (!canCreate) return
    setBusy(true)
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
      setBusy(false)
    }
  }

  const handleRegister = async () => {
    if (!canRegister) return
    setBusy(true)
    try {
      const res = await fetch('/api/cw/register-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: existingPath,
          account: account.trim(),
          alias: existingAlias.trim() || undefined,
        })
      })
      const result = await res.json() as { ok: boolean; error?: string; project?: string }
      if (result.ok) {
        showToast(`Project "${result.project}" registered`, 'success')
        onCreated()
      } else {
        showToast(result.error ?? 'Failed to register project', 'error')
      }
    } catch {
      showToast('Failed to register project', 'error')
    } finally {
      setBusy(false)
    }
  }

  const isCreate = mode === 'create'
  const canSubmit = isCreate ? canCreate : canRegister

  const footer = (
    <>
      <span class="mono flex-1 truncate" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>{isCreate ? 'cw create' : 'cw project register'}</span>
      <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
      <ActionButton
        label={isCreate ? (busy ? 'Creating…' : 'Create') : (busy ? 'Registering…' : 'Register')}
        variant="primary"
        loading={busy}
        disabled={!canSubmit}
        onClick={isCreate ? handleCreate : handleRegister}
      />
    </>
  )

  return (
    <Modal open={open} title="Add a project" onClose={onClose} footer={footer}>
      <div class="flex flex-col" style={{ gap: '13px' }}>
        <Tabs
          fill
          label="Mode"
          tabs={[
            { id: 'create', label: 'Create new' },
            { id: 'existing', label: 'Register existing' },
          ]}
          active={mode}
          onChange={(id) => setMode(id as Mode)}
        />

        <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <Field label="Account">
            {accounts.length > 0 ? (
              <select class="field" value={account} onChange={(e) => setAccount((e.target as HTMLSelectElement).value)}>
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            ) : (
              <input type="text" class="field" value={account} placeholder="account-name" onInput={(e) => setAccount((e.target as HTMLInputElement).value)} />
            )}
          </Field>
          {isCreate ? (
            <Field label="Project name">
              <input type="text" class="field" value={name} placeholder="my-new-project" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            </Field>
          ) : (
            <Field label="Alias">
              <input type="text" class="field" value={existingAlias} placeholder="defaults to folder name" onInput={(e) => setExistingAlias((e.target as HTMLInputElement).value)} />
            </Field>
          )}
        </div>

        <div class="flex flex-col" style={{ gap: '5px' }}>
          <span style={labelStyle}>{isCreate ? 'Parent folder · optional' : 'Repository · must contain .git'}</span>
          {isCreate ? (
            <DirectoryPicker key="dir-create" value={directory} onChange={setDirectory} requireGit={false} />
          ) : (
            <DirectoryPicker key="dir-existing" value={existingPath} onChange={(path, isGit) => { setExistingPath(path); setExistingIsGit(isGit) }} />
          )}
        </div>

        {isCreate && (
          <>
            <Field label="Description">
              <textarea
                rows={2}
                class="field"
                                value={description}
                placeholder="A SaaS platform for…"
                onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              />
            </Field>
            <div class="flex flex-col" style={{ gap: '5px' }}>
              <span style={labelStyle}>Model</span>
              <Tabs
                size="sm"
                label="Model"
                tabs={[{ id: '', label: 'Auto' }, { id: 'haiku', label: 'Haiku' }, { id: 'sonnet', label: 'Sonnet' }, { id: 'opus', label: 'Opus' }]}
                active={model}
                onChange={setModel}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

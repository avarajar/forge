import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { ActionButton, Drawer, showToast } from '@forge-dev/ui'
import type { ModuleStatus } from '@forge-dev/sdk'
import { Field, inputValue, labelStyle } from './Field.js'
import { modules } from '../hooks/useModules.js'
import { errorText, postJson } from '../config/api.js'

interface Preview {
  token: string
  kind: 'v1' | 'legacy'
  name: string
  version: string
  displayName: string
  description?: string
  spec: string
  permissions: Array<{ kind: string; value: string }>
  trustNote: string
}

interface Props {
  onClose: () => void
  onInstalled: (status: ModuleStatus) => void
}

const box = { padding: '12px 14px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--hair)' }

// nothing is installed until the person has seen what the module asks for
export const AddModule: FunctionComponent<Props> = ({ onClose, onInstalled }) => {
  const [spec, setSpec] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'install' | null>(null)

  const look = async () => {
    setBusy('preview')
    setError(null)
    try {
      setPreview(await postJson<Preview>('/api/modules/install/preview', { spec }))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const install = async () => {
    if (!preview) return
    setBusy('install')
    setError(null)
    try {
      const { status, modules: list } = await postJson<{ status?: ModuleStatus; modules: ModuleStatus[] }>('/api/modules/install', { token: preview.token })
      modules.value = list
      if (status?.state === 'disabled') showToast(`Installed ${preview.displayName}, but Forge disabled it: ${status.reason ?? ''}`, 'error')
      else showToast(`Installed ${preview.displayName}`, 'success')
      if (status) onInstalled(status)
      onClose()
    } catch (err) {
      // a used or expired preview has to be shown again
      setPreview(null)
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Drawer title="Add a module" onClose={onClose}>
      <form class="flex flex-col" style={{ gap: '10px' }} onSubmit={(e) => { e.preventDefault(); if (spec.trim() && !busy) void look() }}>
        <Field label="npm package, folder or git url">
          <input
            class="field mono"
            value={spec}
            placeholder="@scope/forge-mod-name"
            autoFocus
            spellcheck={false}
            onInput={(e) => { setSpec(inputValue(e)); setPreview(null) }}
          />
        </Field>
        <span style={labelStyle}>Forge reads the module's manifest first; none of its code runs until you install it.</span>
      </form>

      {error && <div role="alert" class="mono" style={{ ...box, fontSize: '12px', color: 'var(--red)', whiteSpace: 'pre-wrap', borderColor: 'color-mix(in srgb, var(--red) 45%, var(--hair))' }}>{error}</div>}

      {preview && (
        <div class="flex flex-col" style={{ gap: '12px' }}>
          <div style={box}>
            <div style={{ fontSize: '15px', fontWeight: 650 }}>{preview.displayName}</div>
            <div class="mono" style={{ marginTop: '2px', fontSize: '11.5px', color: 'var(--ink-3)' }}>{preview.name} {preview.version}{preview.kind === 'legacy' ? ' · legacy module' : ''}</div>
            {preview.description && <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--ink-2)' }}>{preview.description}</p>}
          </div>

          <div class="flex flex-col" style={{ gap: '6px' }}>
            <span style={{ ...labelStyle, fontWeight: 600 }}>{preview.permissions.length ? 'It asks for' : 'It asks for no permissions'}</span>
            {preview.permissions.map((p, i) => (
              <div key={i} class="flex" style={{ gap: '10px', fontSize: '12.5px' }}>
                <span class="mono shrink-0" style={{ width: '64px', color: 'var(--ink-3)' }}>{p.kind}</span>
                <span class="mono" style={{ wordBreak: 'break-all' }}>{p.value}</span>
              </div>
            ))}
          </div>

          <p style={{ ...box, fontSize: '12.5px', color: 'var(--ink-2)', borderColor: 'color-mix(in srgb, var(--orange) 45%, var(--hair))' }}>{preview.trustNote}</p>
          <span class="mono" style={{ fontSize: '11px', color: 'var(--ink-3)', wordBreak: 'break-all' }}>npm install {preview.spec}</span>
        </div>
      )}

      <div class="flex" style={{ gap: '8px' }}>
        <span class="flex-1" />
        <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
        {preview
          ? <ActionButton label={`Install ${preview.displayName}`} loading={busy === 'install'} onClick={install} />
          : <ActionButton label="Review" loading={busy === 'preview'} disabled={!spec.trim()} onClick={look} />}
      </div>
    </Drawer>
  )
}

import { type FunctionComponent } from 'preact'
import { signal } from '@preact/signals'
import { ActionButton, Modal } from '@forge-dev/ui'
import type { Confirmation } from '@forge-dev/sdk'

interface Pending { confirmation: Confirmation; module: string; resolve: (ok: boolean) => void }

const pending = signal<Pending | null>(null)

// resolves true only on an explicit click of the confirm button
export function confirmAction(confirmation: Confirmation, module: string): Promise<boolean> {
  pending.value?.resolve(false)
  return new Promise(resolve => { pending.value = { confirmation, module, resolve } })
}

const settle = (ok: boolean) => {
  const p = pending.value
  pending.value = null
  p?.resolve(ok)
}

export const ConfirmActionHost: FunctionComponent = () => {
  const p = pending.value
  if (!p) return null
  const { confirmation: c } = p
  return (
    <Modal
      open
      title={c.title}
      onClose={() => settle(false)}
      footer={
        <>
          <span class="flex-1" style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{p.module} asks for this</span>
          <ActionButton label="Cancel" variant="secondary" onClick={() => settle(false)} />
          <ActionButton label={c.confirmLabel} variant="destructive" onClick={() => settle(true)} />
        </>
      }
    >
      {c.body && <p style={{ fontSize: '13px', color: 'var(--ink-2)', whiteSpace: 'pre-wrap', marginBottom: c.items?.length ? '12px' : 0 }}>{c.body}</p>}
      {c.items && c.items.length > 0 && (
        <ul class="flex flex-col" style={{ gap: '8px' }}>
          {c.items.map((item, i) => (
            <li key={i} style={{ padding: '9px 11px', borderRadius: '10px', background: 'var(--card)', border: '1px solid var(--hair)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.label}</div>
              {item.detail && <div style={{ marginTop: '4px', fontSize: '12.5px', color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{item.detail}</div>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

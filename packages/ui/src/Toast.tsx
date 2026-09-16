import { type FunctionComponent } from 'preact'
import { signal } from '@preact/signals'

interface ToastMessage {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export const toasts = signal<ToastMessage[]>([])

export function showToast(message: string, type: ToastMessage['type'] = 'info') {
  const id = Math.random().toString(36).slice(2)
  toasts.value = [...toasts.value, { id, message, type }]
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }, 4000)
}

const DOT = {
  success: 'var(--green)',
  error: 'var(--red)',
  info: 'var(--blue)'
}

export const ToastContainer: FunctionComponent = () => {
  return (
    <div class="fixed bottom-4 right-4 flex flex-col gap-2 z-[70]" style={{ maxWidth: 'calc(100vw - 32px)' }} role="status" aria-live="polite">
      {toasts.value.map(t => (
        <div
          key={t.id}
          class="flex items-center gap-2.5"
          style={{
            padding: '10px 14px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--hair)',
            boxShadow: 'var(--shadow-l)', fontSize: '13px', color: 'var(--ink)', animation: 'riseIn .3s var(--ease) both',
          }}
        >
          <span class="shrink-0" style={{ width: '6px', height: '6px', borderRadius: '50%', background: DOT[t.type] }} />
          {t.message}
        </div>
      ))}
    </div>
  )
}

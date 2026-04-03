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

const typeClasses = {
  success: 'bg-forge-success',
  error: 'bg-forge-error',
  info: 'bg-forge-accent'
}

export const ToastContainer: FunctionComponent = () => {
  return (
    <div class="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {toasts.value.map(t => (
        <div key={t.id} class={`px-4 py-3 rounded-lg text-white text-sm shadow-lg ${typeClasses[t.type]}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

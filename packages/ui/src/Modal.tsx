import { type FunctionComponent, type ComponentChildren } from 'preact'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  children: ComponentChildren
}

export const Modal: FunctionComponent<ModalProps> = ({
  open, title, onClose, onConfirm, confirmLabel = 'Confirm', children
}) => {
  if (!open) return null

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div class="bg-forge-surface border border-forge-border rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div class="flex items-center justify-between p-4 border-b border-forge-border">
          <h3 class="text-lg font-semibold">{title}</h3>
          <button class="text-forge-muted hover:text-forge-text" onClick={onClose}>x</button>
        </div>
        <div class="p-4">{children}</div>
        {onConfirm && (
          <div class="flex justify-end gap-2 p-4 border-t border-forge-border">
            <button class="px-4 py-2 rounded-lg text-sm bg-forge-surface border border-forge-border hover:bg-forge-border" onClick={onClose}>Cancel</button>
            <button class="px-4 py-2 rounded-lg text-sm bg-forge-accent text-white hover:bg-forge-accent/80" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        )}
      </div>
    </div>
  )
}

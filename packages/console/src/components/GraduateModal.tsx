import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { Modal, ActionButton } from '@forge-dev/ui'

interface GraduateModalProps {
  open: boolean
  prototypeName: string
  prUrl: string | null
  previewUrl: string | null
  onClose: () => void
  onGraduate: (taskName: string) => Promise<void>
}

export const GraduateModal: FunctionComponent<GraduateModalProps> = ({
  open,
  prototypeName,
  prUrl,
  previewUrl,
  onClose,
  onGraduate,
}) => {
  const [taskName, setTaskName] = useState(`implement-${prototypeName}`)

  const handleGraduate = async () => {
    await onGraduate(taskName)
  }

  return (
    <Modal open={open} title="Graduate to Dev Task" onClose={onClose}>
      <div class="space-y-4">
        <p class="text-sm text-forge-muted">
          Create a Dev task to implement this prototype in production.
        </p>

        {(prUrl || previewUrl) && (
          <div class="space-y-2">
            {prUrl && (
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-forge-muted w-16">PR:</span>
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm text-forge-accent hover:underline truncate"
                >
                  {prUrl}
                </a>
              </div>
            )}
            {previewUrl && (
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-forge-muted w-16">Preview:</span>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-sm text-forge-accent hover:underline truncate"
                >
                  {previewUrl}
                </a>
              </div>
            )}
          </div>
        )}

        <div>
          <label class="block text-xs font-medium text-forge-muted mb-1.5">
            Task name
          </label>
          <input
            type="text"
            value={taskName}
            onInput={(e) => setTaskName((e.target as HTMLInputElement).value)}
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            placeholder="implement-my-feature"
          />
        </div>

        <div class="flex justify-end pt-1">
          <ActionButton
            label="Create Dev Task"
            variant="primary"
            onClick={handleGraduate}
          />
        </div>
      </div>
    </Modal>
  )
}

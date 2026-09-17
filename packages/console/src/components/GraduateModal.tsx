import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { Modal, ActionButton } from '@forge-dev/ui'
import { labelStyle } from './Field.js'

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
        <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
          Create a Dev task to implement this prototype in production.
        </p>

        {(prUrl || previewUrl) && (
          <div class="space-y-2">
            {prUrl && (
              <div class="flex items-center gap-2">
                <span class="shrink-0" style={{ width: '64px', fontSize: '12px', color: 'var(--ink-2)' }}>PR:</span>
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="truncate" style={{ fontSize: '13px' }}
                >
                  {prUrl}
                </a>
              </div>
            )}
            {previewUrl && (
              <div class="flex items-center gap-2">
                <span class="shrink-0" style={{ width: '64px', fontSize: '12px', color: 'var(--ink-2)' }}>Preview:</span>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="truncate" style={{ fontSize: '13px' }}
                >
                  {previewUrl}
                </a>
              </div>
            )}
          </div>
        )}

        <div>
          <label class="block mb-1" style={labelStyle}>
            Task name
          </label>
          <input
            type="text"
            value={taskName}
            onInput={(e) => setTaskName((e.target as HTMLInputElement).value)}
            class="field"
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

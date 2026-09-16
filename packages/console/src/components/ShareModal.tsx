import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { Modal, ActionButton } from '@forge-dev/ui'
import { labelStyle } from './Field.js'

interface ShareModalProps {
  open: boolean
  prototypeName: string
  onClose: () => void
  onShare: (branch: string, description: string) => Promise<void>
}

export const ShareModal: FunctionComponent<ShareModalProps> = ({
  open,
  prototypeName,
  onClose,
  onShare,
}) => {
  const [branch, setBranch] = useState(`prototype/${prototypeName}`)
  const [description, setDescription] = useState('')

  const handleShare = async () => {
    await onShare(branch, description)
  }

  return (
    <Modal open={open} title="Create Pull Request" onClose={onClose}>
      <div class="space-y-4">
        <div>
          <label class="block mb-1" style={labelStyle}>
            Branch name
          </label>
          <input
            type="text"
            value={branch}
            onInput={(e) => setBranch((e.target as HTMLInputElement).value)}
            class="field"
            placeholder="prototype/my-feature"
          />
        </div>

        <div>
          <label class="block mb-1" style={labelStyle}>
            PR description · optional
          </label>
          <textarea
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
            rows={3}
            class="field"
            placeholder="Describe the changes in this PR..."
          />
        </div>

        <div class="flex justify-end pt-1">
          <ActionButton
            label="Create PR"
            variant="primary"
            onClick={handleShare}
          />
        </div>
      </div>
    </Modal>
  )
}

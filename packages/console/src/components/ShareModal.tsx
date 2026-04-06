import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { Modal, ActionButton } from '@forge-dev/ui'

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
          <label class="block text-xs font-medium text-forge-muted mb-1.5">
            Branch name
          </label>
          <input
            type="text"
            value={branch}
            onInput={(e) => setBranch((e.target as HTMLInputElement).value)}
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            placeholder="prototype/my-feature"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-forge-muted mb-1.5">
            PR description <span class="text-forge-muted font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
            rows={3}
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
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

import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { ActionButton, ForgeTerminal } from '@forge-dev/ui'
import { apiPost } from '../hooks/useApi.js'
import type { ModuleManifest } from '@forge-dev/sdk'

interface ModulePageProps {
  manifest: ModuleManifest
}

interface ActionResult {
  exitCode: number
  output: string
}

export const ModulePage: FunctionComponent<ModulePageProps> = ({ manifest }) => {
  const [lastResult, setLastResult] = useState<ActionResult | null>(null)

  const runAction = async (actionId: string) => {
    setLastResult(null)
    const result = await apiPost<ActionResult>(`/api/actions/${manifest.name}/${actionId}`, {
      projectId: null
    })
    setLastResult(result)
  }

  return (
    <div>
      <div class="flex items-center gap-3 mb-6">
        <span class="text-2xl">{manifest.icon}</span>
        <h2 class="text-2xl font-bold">{manifest.displayName}</h2>
      </div>

      <p class="text-forge-muted mb-6">{manifest.description}</p>

      {/* Actions */}
      <div class="flex flex-wrap gap-3 mb-6">
        {manifest.actions.map(action => (
          <ActionButton
            key={action.id}
            label={action.label}
            icon={action.icon}
            onClick={() => runAction(action.id)}
          />
        ))}
      </div>

      {/* Terminal output */}
      {lastResult && (
        <div class="mt-4">
          <ForgeTerminal
            content={lastResult.output ?? `Exit code: ${lastResult.exitCode}`}
            height={400}
          />
        </div>
      )}
    </div>
  )
}

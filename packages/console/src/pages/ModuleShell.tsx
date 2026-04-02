import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { Tabs, ActionButton, ForgeTerminal } from '@forge-dev/ui'
import { apiPost } from '../hooks/useApi.js'
import { getPanels } from '../panels/registry.js'
import type { ModuleManifest } from '@forge-dev/sdk'

interface ModuleShellProps {
  moduleId: string
  manifest: ModuleManifest
  projectId: string | null
}

export const ModuleShell: FunctionComponent<ModuleShellProps> = ({
  moduleId, manifest, projectId
}) => {
  const defaultPanel = manifest.panels.find(p => p.default)?.id ?? manifest.panels[0]?.id
  const [activeTab, setActiveTab] = useState(defaultPanel ?? '')
  const [terminalOutput, setTerminalOutput] = useState<string | null>(null)

  const registeredPanels = getPanels(moduleId)
  const panelConfig = registeredPanels?.get(activeTab)
  const PanelComponent = panelConfig?.component

  const visibleActions = manifest.actions.filter(a => !a.hidden)

  const runAction = async (actionId: string) => {
    setTerminalOutput(null)
    const result = await apiPost<{ exitCode: number; output: string }>(
      `/api/actions/${moduleId}/${actionId}`,
      { projectId }
    )
    setTerminalOutput(result.output ?? `Exit code: ${result.exitCode}`)
  }

  return (
    <div>
      {/* Module header */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
            style={{ backgroundColor: manifest.color + '20', color: manifest.color }}
          >
            {manifest.icon}
          </div>
          <div>
            <h2 class="text-xl font-bold">{manifest.displayName}</h2>
            <p class="text-sm text-forge-muted">{manifest.description}</p>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      {visibleActions.length > 0 && (
        <div class="flex flex-wrap gap-2 mb-4">
          {visibleActions.map(action => (
            <ActionButton
              key={action.id}
              label={action.label}
              icon={action.icon}
              variant="secondary"
              onClick={() => runAction(action.id)}
            />
          ))}
        </div>
      )}

      {/* Panel tabs */}
      {manifest.panels.length > 1 && (
        <Tabs
          tabs={manifest.panels.map(p => ({ id: p.id, label: p.title }))}
          active={activeTab}
          onChange={setActiveTab}
        />
      )}

      {/* Panel content */}
      {PanelComponent ? (
        <PanelComponent moduleId={moduleId} projectId={projectId} />
      ) : (
        <div class="text-forge-muted text-sm py-8 text-center">
          Panel "{activeTab}" not yet implemented
        </div>
      )}

      {/* Terminal output from quick actions */}
      {terminalOutput && (
        <div class="mt-6">
          <ForgeTerminal content={terminalOutput} height={300} />
        </div>
      )}
    </div>
  )
}

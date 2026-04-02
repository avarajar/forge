import type { PanelConfig } from '@forge-dev/sdk'
import { workspaces, sessions, sharedContext } from '@forge-dev/mod-dev/panels'

// Maps moduleId (directory name, e.g. "mod-dev") to a map of panelId -> PanelConfig
const registry = new Map<string, Map<string, PanelConfig>>()

export function registerPanels(moduleId: string, panels: PanelConfig[]): void {
  registry.set(moduleId, new Map(panels.map(p => [p.id, p])))
}

export function getPanels(moduleId: string): Map<string, PanelConfig> | undefined {
  return registry.get(moduleId)
}

export function hasPanels(moduleId: string): boolean {
  return registry.has(moduleId)
}

registerPanels('mod-dev', [workspaces, sessions, sharedContext])

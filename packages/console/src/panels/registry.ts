import type { PanelConfig } from '@forge-dev/sdk'
import { workspaces, sessions, sharedContext } from '@forge-dev/mod-dev/panels'
import { health, activity, costs } from '@forge-dev/mod-monitor/panels'
import { templates, wizard, recent } from '@forge-dev/mod-scaffold/panels'
import { board, architecture, docs, adr } from '@forge-dev/mod-planning/panels'

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
registerPanels('mod-monitor', [health, activity, costs])
registerPanels('mod-scaffold', [templates, wizard, recent])
registerPanels('mod-planning', [board, architecture, docs, adr])

import { overview, testRunner, coverage, reports } from '@forge-dev/mod-qa/panels'
import { designs, tokens, wireframes, visualDiff } from '@forge-dev/mod-design/panels'
import { pipeline, environments, changelog, featureFlags, rollback } from '@forge-dev/mod-release/panels'

registerPanels('mod-qa', [overview, testRunner, coverage, reports])
registerPanels('mod-design', [designs, tokens, wireframes, visualDiff])
registerPanels('mod-release', [pipeline, environments, changelog, featureFlags, rollback])

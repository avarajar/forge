export interface ModuleManifest {
  name: string
  version: string
  displayName: string
  description: string
  icon: string
  color: string
  panels: PanelDef[]
  actions: ActionDef[]
  detectors?: DetectorDef[]
  claude?: { skills?: string[]; mcpServers?: string[] }
  settings?: { schema: Record<string, SettingDef> }
}

export interface PanelDef {
  id: string
  title: string
  component: string
  default?: boolean
}

export interface ActionDef {
  id: string
  label: string
  icon: string
  command: string
  streaming?: boolean
  tags?: string[]
  hidden?: boolean
  /** Named parameters the caller must send, each matched in full against `pattern`.
   *  They reach the command only as `FORGE_PARAM_<NAME>` env vars, never interpolated. */
  params?: Record<string, ActionParamDef>
}

export interface ActionParamDef {
  pattern: string
}

export interface DetectorDef {
  tool: string
  files: string[]
  packages?: string[]
  suggestion: string
}

export interface SettingDef {
  type: 'string' | 'number' | 'boolean'
  default?: unknown
}

export interface PanelProps {
  moduleId: string
  projectId: string | null
}

export interface PanelConfig {
  id: string
  title: string
  component: import('preact').FunctionComponent<PanelProps>
}

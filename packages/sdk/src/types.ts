import type { FunctionComponent } from 'preact'
import type { ReadonlySignal } from '@preact/signals'

// legacy manifest: shell actions only, run through /api/actions
export interface LegacyManifest {
  name: string
  version: string
  displayName: string
  description: string
  icon: string
  color: string
  panels: PanelDef[]
  actions: LegacyActionDef[]
  detectors?: LegacyDetectorDef[]
  claude?: { skills?: string[]; mcpServers?: string[] }
  settings?: { schema: Record<string, SettingDef> }
}

/** @deprecated use LegacyManifest or ModuleManifestV1 */
export type ModuleManifest = LegacyManifest

export interface PanelDef {
  id: string
  title: string
  component: string
  default?: boolean
}

export interface LegacyActionDef {
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

export interface LegacyDetectorDef {
  tool: string
  files: string[]
  packages?: string[]
  suggestion: string
}

// settings

interface SettingBase<T> {
  label?: string
  help?: string
  default?: T
  required?: boolean
}

export interface StringSetting extends SettingBase<string> {
  type: 'string'
  pattern?: string
  format?: 'path' | 'cw-project' | 'url'
}

export interface NumberSetting extends SettingBase<number> {
  type: 'number'
  min?: number
  max?: number
}

export interface BooleanSetting extends SettingBase<boolean> {
  type: 'boolean'
}

export interface EnumSetting extends SettingBase<string> {
  type: 'enum'
  values: string[]
}

export type ScalarSettingDef = StringSetting | NumberSetting | BooleanSetting | EnumSetting

export interface ListSetting extends SettingBase<Array<Record<string, unknown>>> {
  type: 'list'
  item: Record<string, ScalarSettingDef>
}

export type SettingDef = ScalarSettingDef | ListSetting

export type ModuleSettings = Record<string, unknown>

// v1 manifest

export interface ModulePermissions {
  network?: string[]
  'fs:read'?: string[]
  'fs:write'?: string[]
  shell?: string[]
  pty?: boolean
}

export interface ModuleManifestV1 {
  id: string
  name: string
  version: string
  sdk: string
  displayName: string
  description?: string
  icon?: string
  color?: string
  server?: string
  view?: { entry: string; title?: string }
  permissions?: ModulePermissions
  settings?: { schema: Record<string, SettingDef> }
  actions?: LegacyActionDef[]
  detectors?: LegacyDetectorDef[]
}

export type ModuleSource = 'bundled' | 'dev' | 'installed' | 'node_modules'

export interface ModuleStatus {
  id: string
  name: string
  version: string
  displayName: string
  source: ModuleSource
  state: 'enabled' | 'disabled' | 'legacy'
  reason?: string
  icon?: string
  color?: string
  settingsSchema?: Record<string, SettingDef>
  permissions?: ModulePermissions
  view?: { url: string; title: string; version: string }
  actions?: Array<{ id: string; label: string; effect: ActionEffect }>
  lastJobError?: string
  lastEventError?: string
  lastDenial?: { permission: string; value: string; at: string }
  // installed into Forge's modules folder, so the console can remove it
  removable?: boolean
}

// core data shapes handed to modules

export interface SessionInfo {
  project: string
  sessionDir: string
  type: string
  task?: string
  account?: string
  harness?: string
  provider?: string
  model?: string
  worktreePath?: string
}

export interface ProjectInfo {
  name: string
  path: string
  account?: string
}

export interface AccountInfo {
  name: string
  harness?: string
  provider?: string
  model?: string
}

export interface GitStatus {
  branch?: string
  ahead?: number
  behind?: number
  files: Array<{ path: string; status: string }>
}

export interface ExecResult {
  exitCode: number
  output: string
  timedOut: boolean
}

// events

export interface SessionEvent {
  project: string
  sessionDir: string
  type: string
  account?: string
  harness?: string
  provider?: string
  model?: string
}

export interface ForgeEvents {
  'session.started': SessionEvent
  'session.ended': SessionEvent
  'task.done': SessionEvent & { command: 'work' | 'review' | 'loop' }
  'project.registered': { project: string; path: string }
  'harness.changed': { account: string; harness: string; from: string; to: string }
  'module.settings.changed': { moduleId: string }
}

export type ForgeEventName = keyof ForgeEvents

export interface EventSubscription<E extends ForgeEventName = ForgeEventName> {
  event: E
  handler: (payload: ForgeEvents[E], ctx: ForgeContext) => void | Promise<void>
}

// server context

export interface ForgeContext {
  module: { id: string; version: string }
  readonly settings: ModuleSettings
  sessions: { list(): Promise<SessionInfo[]> }
  projects: { list(): Promise<ProjectInfo[]>; dir(name: string): Promise<string | null> }
  accounts: { list(): Promise<AccountInfo[]> }
  git: { status(project: string, sessionDir: string): Promise<GitStatus> }
  storage: {
    get<T>(key: string): Promise<T | undefined>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<void>
    list(prefix?: string): Promise<string[]>
  }
  notify: {
    attention(n: { key: string; title: string; body?: string; version?: string }): Promise<void>
    badge(key: string, count: number, label?: string): Promise<void>
    clear(key: string): Promise<void>
  }
  fetch(url: string, init?: RequestInit): Promise<Response>
  fs: {
    read(path: string): Promise<string>
    list(dir: string): Promise<string[]>
    write(path: string, data: string): Promise<void>
  }
  shell: { exec(command: string, args: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<ExecResult> }
  pty: { spawn(command: string, args: string[], opts: { cwd: string; name: string }): Promise<{ sessionId: string }> }
  log: { info(msg: string): void; warn(msg: string): void; error(msg: string): void }
}

// server definitions

export interface RouteRequest {
  params: Record<string, string>
  query: Record<string, string>
  body: unknown
}

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  handler: (req: RouteRequest, ctx: ForgeContext) => Promise<unknown> | unknown
}

export type ActionEffect = 'read' | 'local' | 'external'

export interface Confirmation {
  title: string
  body?: string
  items?: Array<{ label: string; detail?: string }>
  confirmLabel: string
  plan?: unknown
}

export interface ShellExecutor {
  kind: 'shell'
  command: string
  args: string[]
}

export interface ActionContext extends ForgeContext {
  output: (chunk: string) => void
  signal: AbortSignal
  confirmed?: unknown
}

export interface ActionDef<I = any, O = unknown> {
  id: string
  label: string
  icon?: string
  effect: ActionEffect
  input?: Record<string, SettingDef>
  confirm?: (input: I, ctx: ForgeContext) => Promise<Confirmation>
  run: ((input: I, ctx: ActionContext) => Promise<O>) | ShellExecutor
}

export interface JobDef {
  id: string
  every: string
  enabled?: (settings: ModuleSettings) => boolean
  run: (ctx: ForgeContext & { signal: AbortSignal }) => Promise<void>
}

export interface DetectorDef {
  tool: string
  files?: string[]
  packages?: string[]
  detect?: (projectDir: string, ctx: ForgeContext) => Promise<boolean>
  suggestion: string
}

export interface ModuleServer {
  routes?: RouteDef[]
  actions?: ActionDef[]
  jobs?: JobDef[]
  events?: EventSubscription<any>[]
  detectors?: DetectorDef[]
}

// console half

export interface PanelClient {
  route<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>
  action<O>(id: string, input?: unknown, opts?: { onOutput?: (chunk: string) => void }): Promise<O | undefined>
  settings: ReadonlySignal<ModuleSettings>
  openSettings(): void
  status: ReadonlySignal<ModuleStatus | undefined>
}

export interface LegacyPanelProps {
  moduleId: string
  projectId: string | null
  // proyecto de CW por nombre: lo usa la consola; las acciones corren en su carpeta
  cwProject?: string | null
}

export interface PanelProps extends LegacyPanelProps {
  forge: PanelClient
}

export interface PanelConfig<P extends LegacyPanelProps = PanelProps> {
  id: string
  title: string
  component: FunctionComponent<P>
}

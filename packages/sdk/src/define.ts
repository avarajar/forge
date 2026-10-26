import type {
  ActionDef, DetectorDef, EventSubscription, ForgeContext, ForgeEventName, ForgeEvents, JobDef,
  LegacyPanelProps, ModuleServer, PanelConfig, PanelProps, RouteDef, ShellExecutor,
} from './types.js'

export const SDK_VERSION = '1.0.0' as const

export function definePanel<P extends LegacyPanelProps = PanelProps>(config: PanelConfig<P>): PanelConfig<P> {
  return config
}

export function defineModule(def: ModuleServer): ModuleServer {
  return def
}

export function defineRoute(def: RouteDef): RouteDef {
  return def
}

export function defineAction<I = any, O = unknown>(def: ActionDef<I, O>): ActionDef<I, O> {
  return def
}

export function defineJob(def: JobDef): JobDef {
  return def
}

export function defineDetector(def: DetectorDef): DetectorDef {
  return def
}

export function onEvent<E extends ForgeEventName>(
  event: E,
  handler: (payload: ForgeEvents[E], ctx: ForgeContext) => void | Promise<void>,
): EventSubscription<E> {
  return { event, handler }
}

export function shell(command: string, args: string[]): ShellExecutor {
  return { kind: 'shell', command, args }
}

export function isShellExecutor(run: unknown): run is ShellExecutor {
  return typeof run === 'object' && run !== null && (run as ShellExecutor).kind === 'shell'
}

// packages a module view gets from Forge through the import map; module builds keep them external
export const SHARED_PACKAGES = ['preact', 'preact/hooks', 'preact/jsx-runtime', 'preact/compat', '@preact/signals', '@forge-dev/ui', '@forge-dev/sdk'] as const

// a module id: also its URL segment under /api/modules
export const MODULE_ID_RE = /^[a-z][a-z0-9-]{1,31}$/

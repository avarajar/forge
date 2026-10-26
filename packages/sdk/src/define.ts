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

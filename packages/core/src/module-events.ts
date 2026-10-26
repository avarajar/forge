import type { EventSubscription, ForgeContext, ForgeEventName, ForgeEvents } from '@forge-dev/sdk'

interface Sub { moduleId: string; sub: EventSubscription; ctx: ForgeContext }

export interface EventEmitter {
  emit<E extends ForgeEventName>(name: E, payload: ForgeEvents[E]): void
}

// handlers run after the emitter returns, one at a time, and their failures stay with the module
export class ModuleEvents implements EventEmitter {
  private subs: Sub[] = []
  private readonly timeoutMs: number

  constructor(private readonly opts: { onError: (moduleId: string, message: string) => void; timeoutMs?: number }) {
    this.timeoutMs = opts.timeoutMs ?? 10_000
  }

  subscribe(moduleId: string, sub: EventSubscription, ctx: ForgeContext): void {
    this.subs.push({ moduleId, sub, ctx })
  }

  unsubscribeModule(moduleId: string): void {
    this.subs = this.subs.filter(s => s.moduleId !== moduleId)
  }

  emit<E extends ForgeEventName>(name: E, payload: ForgeEvents[E]): void {
    this.dispatch(this.subs.filter(s => s.sub.event === name), name, payload)
  }

  emitTo<E extends ForgeEventName>(moduleId: string, name: E, payload: ForgeEvents[E]): void {
    this.dispatch(this.subs.filter(s => s.sub.event === name && s.moduleId === moduleId), name, payload)
  }

  private dispatch(targets: Sub[], name: string, payload: unknown): void {
    if (targets.length === 0) return
    setTimeout(async () => {
      for (const { moduleId, sub, ctx } of targets) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            Promise.resolve().then(() => (sub.handler as (p: unknown, c: ForgeContext) => unknown)(payload, ctx)),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${this.timeoutMs / 1000}s`)), this.timeoutMs) }),
          ])
        } catch (err) {
          this.opts.onError(moduleId, `${name}: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          clearTimeout(timer)
        }
      }
    }, 0)
  }
}

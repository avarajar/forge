import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Hono, type Context } from 'hono'
import { PermissionError, isShellExecutor } from '@forge-dev/sdk'
import type { ActionContext, ActionDef, Confirmation, RouteDef } from '@forge-dev/sdk'
import type { IForgeDB } from './db-interface.js'
import type { LoadedModule, ModuleHost } from './module-host.js'
import { validateSettings } from './module-manifest.js'
import { Confirmations, inputHash } from './module-confirmations.js'

type Json = Record<string, unknown>

const STATUS_BY_CODE: Record<string, 400 | 401 | 404 | 502> = {
  bad_request: 400, unauthorized: 401, not_found: 404, unreachable: 502, upstream: 502,
}

export function moduleRoutes(host: ModuleHost, opts: { db: IForgeDB; confirmations?: Confirmations; ready?: Promise<unknown> }): Hono {
  const { db } = opts
  const confirmations = opts.confirmations ?? new Confirmations()
  const app = new Hono()

  app.use('*', async (_c, next) => {
    await opts.ready
    await next()
  })

  app.get('/', (c) => c.json(host.list()))
  app.post('/rescan', async (c) => c.json(await host.scan()))
  app.post('/dev', async (c) => {
    const { path } = await c.req.json<{ path?: string }>()
    if (typeof path !== 'string' || !path) return c.json({ code: 'bad_request', message: 'path is required' }, 400)
    return c.json({ status: await host.addDev(path), modules: host.list() })
  })
  app.delete('/dev', async (c) => {
    const { path } = await c.req.json<{ path?: string }>()
    if (typeof path === 'string') await host.removeDev(path)
    return c.json(host.list())
  })

  app.get('/notifications', (c) => c.json({
    items: db.listNotifications().map(n => ({
      moduleId: n.moduleId, key: n.key, kind: n.kind, title: n.title, body: n.body, count: n.count, label: n.label,
      seen: n.seenAt != null, createdAt: n.createdAt,
    })),
  }))

  app.post('/:id/notifications/seen', (c) => {
    db.markNotificationsSeen(c.req.param('id'))
    return c.json({ ok: true })
  })

  app.post('/:id/reload', async (c) => {
    await host.reload(c.req.param('id'))
    return c.json(host.list().find(s => s.id === c.req.param('id')) ?? removed(c.req.param('id')))
  })

  app.get('/:id/status', (c) => {
    const status = host.list().find(s => s.id === c.req.param('id'))
    return status ? c.json(status) : c.json(removed(c.req.param('id')), 404)
  })

  // legacy modules keep their raw string settings
  app.get('/:id/settings', (c) => {
    const id = c.req.param('id')
    return c.json(host.get(id) ? host.settings(id) : db.getModuleSettings(id))
  })

  app.put('/:id/settings', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<Json>()
    if (!host.get(id)) {
      for (const [key, value] of Object.entries(body)) db.setModuleSetting(id, key, String(value))
      return c.json({ ok: true })
    }
    const result = host.saveSettings(id, body)
    return result.ok ? c.json({ ok: true }) : c.json({ errors: result.errors }, 400)
  })

  app.get('/:id/view.js', async (c) => {
    const mod = host.get(c.req.param('id'))
    if (!mod?.manifest.view) return c.json(removed(c.req.param('id')), 404)
    try {
      const code = await readFile(resolve(mod.dir, mod.manifest.view.entry), 'utf-8')
      return c.body(code, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' })
    } catch (err) {
      return c.json({ code: 'not_found', message: `view bundle missing: ${(err as Error).message}` }, 404)
    }
  })

  app.post('/:id/actions/:action/prepare', async (c) => {
    const found = await findAction(c)
    if (found instanceof Response) return found
    const { mod, action, input } = found
    if (action.effect !== 'external' || !action.confirm) return c.json({ code: 'bad_request', message: `action ${action.id} needs no confirmation` }, 400)
    try {
      const confirmation = await action.confirm(input, mod.ctx)
      const token = confirmations.issue(mod.status.id, action.id, inputHash(input), confirmation)
      const { plan: _plan, ...shown } = confirmation
      return c.json({ confirmation: shown, token })
    } catch (err) {
      return errorResponse(c, mod, err)
    }
  })

  app.post('/:id/actions/:action', async (c) => {
    const ready = await prepareRun(c)
    if (ready instanceof Response) return ready
    try {
      return c.json({ result: (await ready.run(() => {})) ?? null })
    } catch (err) {
      return errorResponse(c, ready.found.mod, err)
    }
  })

  app.post('/:id/actions/:action/stream', async (c) => {
    const ready = await prepareRun(c)
    if (ready instanceof Response) return ready
    const { found } = ready
    return new Response(new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const send = (event: string, data: unknown) => {
          try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch { /* client gone */ }
        }
        send('start', { action: found.action.id })
        try {
          send('done', { result: (await ready.run((chunk) => send('output', { chunk }))) ?? null })
        } catch (err) {
          send('error', describe(err))
        }
        try { controller.close() } catch { /* already closed */ }
      },
    }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
  })

  app.all('/:id/*', async (c) => {
    const id = c.req.param('id')
    const mod = host.get(id)
    if (!mod) return c.json(removed(id), 404)
    const path = c.req.path.slice(c.req.path.indexOf(`/${id}/`) + id.length + 1)
    const match = matchRoute(mod.server?.routes ?? [], c.req.method, path)
    if (!match) return c.json({ code: 'not_found', message: `${c.req.method} ${path} is not a route of ${id}` }, 404)
    try {
      const body = c.req.method === 'GET' || c.req.method === 'DELETE' ? undefined : await readJson(c)
      const result = await match.route.handler({ params: match.params, query: c.req.query(), body }, mod.ctx)
      return c.json((result ?? null) as Json)
    } catch (err) {
      return errorResponse(c, mod, err)
    }
  })

  interface Found { mod: LoadedModule; action: ActionDef; input: unknown; token?: string }

  async function findAction(c: Context): Promise<Found | Response> {
    const id = c.req.param('id') as string
    const mod = host.get(id)
    if (!mod) return c.json(removed(id), 404)
    const action = mod.server?.actions?.find(a => a.id === c.req.param('action'))
    if (!action) return c.json({ code: 'not_found', message: `${id} has no action ${c.req.param('action')}` }, 404)
    const body = (await readJson(c) ?? {}) as { input?: unknown; token?: unknown }
    let input = body.input
    if (action.input) {
      const checked = validateSettings(action.input, input)
      if (!checked.ok) return c.json({ code: 'bad_request', message: 'invalid input', errors: checked.errors }, 400)
      input = checked.value
    }
    return { mod, action, input, token: typeof body.token === 'string' ? body.token : undefined }
  }

  // an external action needs the token its confirmation issued; the run is logged without its input
  async function prepareRun(c: Context): Promise<Response | { found: Found; run: (output: (chunk: string) => void) => Promise<unknown> }> {
    const found = await findAction(c)
    if (found instanceof Response) return found
    let confirmation: Confirmation | undefined
    if (found.action.effect === 'external') {
      confirmation = found.token ? confirmations.take(found.token, found.mod.status.id, found.action.id, inputHash(found.input)) ?? undefined : undefined
      if (!confirmation) return c.json({ code: 'confirmation_required', message: `${found.action.label} needs a confirmation first` }, 409)
    }
    const logId = db.logAction({
      projectId: null,
      moduleId: found.mod.status.id,
      actionId: found.action.id,
      command: `${found.action.effect} input:${inputHash(found.input).slice(0, 12)}`,
    })
    const signal = c.req.raw.signal
    return {
      found,
      run: async (output) => {
        try {
          const result = await run(found, confirmation, output, signal)
          db.completeAction(logId, 0)
          return result
        } catch (err) {
          db.completeAction(logId, 1)
          throw err
        }
      },
    }
  }

  return app
}

async function run(found: { mod: LoadedModule; action: ActionDef; input: unknown }, confirmation: Confirmation | undefined, output: (chunk: string) => void, requestSignal: AbortSignal): Promise<unknown> {
  const { mod, action, input } = found
  const signal = AbortSignal.any([mod.abort.signal, requestSignal])
  if (isShellExecutor(action.run)) {
    const result = await mod.ctx.shell.exec(action.run.command, action.run.args)
    output(result.output)
    return result
  }
  const ctx = Object.assign(Object.create(mod.ctx) as ActionContext, { output, signal, confirmed: confirmation?.plan })
  return action.run(input, ctx)
}

async function readJson(c: Context): Promise<unknown> {
  const text = await c.req.text()
  if (!text) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

function removed(id: string) {
  return { code: 'module_removed', message: `module ${id} is not loaded` }
}

// SDK errors are matched by name and code: a module may carry its own copy of the SDK
function describe(err: unknown): { code: string; message: string; permission?: string; value?: string } {
  if (err instanceof PermissionError) return { code: 'permission', message: err.message, permission: err.permission, value: err.value }
  const e = err as { name?: unknown; code?: unknown; message?: unknown }
  const message = typeof e?.message === 'string' ? e.message : String(err)
  if (e?.name === 'ModuleError' && typeof e.code === 'string') return { code: e.code, message }
  return { code: 'module_error', message }
}

function errorResponse(c: Context, mod: LoadedModule, err: unknown): Response {
  const body = describe(err)
  if (body.code === 'permission') return c.json(body, 403)
  const status = STATUS_BY_CODE[body.code]
  if (status) return c.json(body, status)
  console.error(`[module ${mod.status.id}] ${(err as Error)?.stack ?? body.message}`)
  return c.json(body, 500)
}

function matchRoute(routes: RouteDef[], method: string, path: string): { route: RouteDef; params: Record<string, string> } | null {
  const parts = path.split('/').filter(Boolean)
  for (const route of routes) {
    if (route.method !== method) continue
    const pattern = route.path.split('/').filter(Boolean)
    if (pattern.length !== parts.length) continue
    const params: Record<string, string> = {}
    if (pattern.every((seg, i) => {
      if (seg.startsWith(':')) { params[seg.slice(1)] = decodeURIComponent(parts[i]); return true }
      return seg === parts[i]
    })) return { route, params }
  }
  return null
}

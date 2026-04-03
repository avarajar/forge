import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import { ForgeDB } from './db.js'
import { ModuleLoader } from './modules.js'
import { ActionRunner } from './runner.js'
import type { ActionDef } from '@forge-dev/sdk'
import { join } from 'node:path'

interface ServerOptions {
  dataDir: string
  port?: number
}

export function createForgeServer(options: ServerOptions) {
  const { dataDir } = options
  const dbPath = join(dataDir, 'forge.db')
  const modulesDir = join(dataDir, 'modules')

  const db = new ForgeDB(dbPath)
  const loader = new ModuleLoader(modulesDir)
  const runner = new ActionRunner()

  loader.discover()

  const app = new Hono()
  app.use('*', cors())

  async function resolveAction(c: Context): Promise<
    | { action: ActionDef; cwd: string; logId: string }
    | Response
  > {
    const moduleName = c.req.param('module') as string
    const actionId = c.req.param('action') as string
    const { projectId } = await c.req.json<{ projectId: string | null }>()

    const action = loader.getAction(moduleName, actionId)
    if (!action) {
      return c.json({ error: 'Action not found' }, 404)
    }

    const project = projectId ? db.getProject(projectId) : undefined
    const cwd = project?.path ?? process.cwd()

    const logId = db.logAction({
      projectId: projectId ?? null,
      moduleId: moduleName,
      actionId: actionId,
      command: action.command
    })

    return { action, cwd, logId }
  }

  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      version: '0.1.0',
      modules: loader.getLoadedCount()
    })
  })

  app.get('/api/projects', (c) => {
    return c.json(db.listProjects())
  })

  app.post('/api/projects', async (c) => {
    const { name, path } = await c.req.json<{ name: string; path: string }>()
    const id = db.addProject({ name, path })
    const project = db.getProject(id)
    return c.json(project, 201)
  })

  app.delete('/api/projects/:id', (c) => {
    db.removeProject(c.req.param('id'))
    return c.json({ ok: true })
  })

  app.get('/api/modules', (c) => {
    const installed = db.listModules()
    const loaded = loader.getLoaded()
    return c.json(installed.map(m => ({
      ...m,
      manifest: loaded.get(m.name) ?? null
    })))
  })

  app.get('/api/modules/available', (c) => {
    const manifests = loader.discover()
    return c.json(manifests)
  })

  app.post('/api/actions/:module/:action', async (c) => {
    const resolved = await resolveAction(c)
    if (resolved instanceof Response) return resolved
    const { action, cwd, logId } = resolved

    const result = await runner.exec(action.command, { cwd })
    db.completeAction(logId, result.exitCode)

    return c.json({
      logId,
      exitCode: result.exitCode,
      output: result.output,
      timedOut: result.timedOut
    })
  })

  app.post('/api/actions/:module/:action/stream', async (c) => {
    const resolved = await resolveAction(c)
    if (resolved instanceof Response) return resolved
    const { action, cwd, logId } = resolved

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          }

          send('start', { logId, command: action.command })

          const result = await runner.exec(action.command, {
            cwd,
            onData: (chunk) => send('output', { chunk })
          })

          db.completeAction(logId, result.exitCode)
          send('done', { exitCode: result.exitCode, timedOut: result.timedOut })
          controller.close()
        }
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        }
      }
    )
  })

  app.get('/api/action-logs', (c) => {
    const moduleId = c.req.query('moduleId')
    const limitStr = c.req.query('limit')
    const limit = limitStr ? parseInt(limitStr, 10) : undefined
    return c.json(db.listActionLogs({ moduleId, limit }))
  })

  app.get('/api/modules/:module/settings', (c) => {
    const moduleId = c.req.param('module')
    return c.json(db.getModuleSettings(moduleId))
  })

  app.put('/api/modules/:module/settings', async (c) => {
    const moduleId = c.req.param('module')
    const body = await c.req.json<Record<string, string>>()
    for (const [key, value] of Object.entries(body)) {
      db.setModuleSetting(moduleId, key, String(value))
    }
    return c.json({ ok: true })
  })

  const fetch = (path: string, init?: RequestInit) => {
    return app.request(path, init)
  }

  return {
    app,
    fetch,
    close: () => db.close()
  }
}

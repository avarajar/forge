import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Context } from 'hono'
import { ForgeDB } from './db.js'
import { ModuleLoader } from './modules.js'
import { ActionRunner } from './runner.js'
import type { ActionDef } from '@forge-dev/sdk'
import { join, basename, resolve } from 'node:path'
import { readdirSync, statSync, existsSync } from 'node:fs'
import type { IForgeDB } from './db-interface.js'
import { bearerAuth } from './auth.js'
import { CWReader } from './cw-reader.js'
import { cwRoutes } from './cw-routes.js'
import { skillRoutes } from './skill-routes.js'
import { PTYManager } from './pty-manager.js'
import { createTerminalWss } from './pty-routes.js'
import { SandboxManager } from './sandbox-manager.js'
import { prototypeRoutes } from './prototype-routes.js'
import { tmpdir } from 'node:os'

interface ServerOptions {
  dataDir: string
  port?: number
  db?: IForgeDB
  authToken?: string
}

export function createForgeServer(options: ServerOptions) {
  const { dataDir, db: externalDb, authToken } = options
  const dbPath = join(dataDir, 'forge.db')
  const modulesDir = join(dataDir, 'modules')

  const db: IForgeDB = externalDb ?? new ForgeDB(dbPath)
  const loader = new ModuleLoader(modulesDir)
  const runner = new ActionRunner()

  loader.discover()

  const app = new Hono()
  app.use('*', cors())

  if (authToken) {
    app.use('/api/*', bearerAuth(authToken))
  }

  const cwReader = new CWReader()
  app.route('/api/cw', cwRoutes(cwReader))
  app.route('/api/skills', skillRoutes(cwReader))

  const ptyManager = new PTYManager()
  const terminalWss = createTerminalWss(ptyManager, cwReader)

  const sandboxManager = new SandboxManager({
    templateDir: join(import.meta.dirname, '../sandbox-template'),
    sandboxBaseDir: join(tmpdir(), 'forge-sandboxes'),
    portRangeStart: 51000,
  })
  app.route('/api/prototype', prototypeRoutes(sandboxManager))

  app.post('/api/cw/terminal/kill', async (c) => {
    const { project, sessionDir } = await c.req.json<{ project: string; sessionDir: string }>()
    const sessionId = `${project}::${sessionDir}`
    ptyManager.kill(sessionId)
    return c.json({ ok: true })
  })

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

  app.get('/api/registry/search', async (c) => {
    const q = c.req.query('q') ?? 'forge-dev'
    try {
      const npmRes = await globalThis.fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}+keywords:forge-module&size=20`
      )
      const data = await npmRes.json() as { objects?: { package: { name: string; version: string; description: string } }[] }
      const results = (data.objects ?? []).map(o => ({
        name: o.package.name,
        version: o.package.version,
        description: o.package.description
      }))
      return c.json({ results })
    } catch {
      return c.json({ results: [] })
    }
  })

  app.get('/api/filesystem/browse', (c) => {
    const home = process.env.HOME ?? '/tmp'
    const dir = resolve(c.req.query('path') ?? process.cwd())
    if (!dir.startsWith(home)) {
      return c.json({ error: 'Access denied: path must be within home directory' }, 403)
    }
    if (!existsSync(dir)) {
      return c.json({ error: 'Directory not found' }, 404)
    }
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      const dirs = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: join(dir, e.name),
          hasPackageJson: existsSync(join(dir, e.name, 'package.json')),
          hasGit: existsSync(join(dir, e.name, '.git'))
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      return c.json({
        current: dir,
        name: basename(dir),
        parent: join(dir, '..'),
        directories: dirs
      })
    } catch {
      return c.json({ error: 'Cannot read directory' }, 500)
    }
  })

  const fetch = (path: string, init?: RequestInit) => {
    return app.request(path, init)
  }

  return {
    app,
    fetch,
    attachTerminalWs: (server: import('node:http').Server) => terminalWss.attachToServer(server),
    close: () => { ptyManager.dispose(); sandboxManager.dispose(); db.close() }
  }
}

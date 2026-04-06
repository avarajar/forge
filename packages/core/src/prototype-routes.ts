import { Hono } from 'hono'
import type { SandboxManager } from './sandbox-manager.js'
import type { InputType } from './sandbox-types.js'

export function prototypeRoutes(manager: SandboxManager): Hono {
  const app = new Hono()

  app.post('/create', async (c) => {
    const { name, projectId, inputType, inputData } = await c.req.json<{
      name: string
      projectId?: string
      inputType: InputType
      inputData: string
    }>()

    const sandbox = manager.create({
      name,
      projectId,
      input: { type: inputType, text: inputData },
    })

    return c.json(sandbox, 201)
  })

  app.get('/list', (c) => {
    return c.json(manager.list())
  })

  app.get('/:id', (c) => {
    const sandbox = manager.get(c.req.param('id'))
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404)
    return c.json(sandbox)
  })

  app.post('/:id/start-server', async (c) => {
    const id = c.req.param('id')
    const sandbox = manager.get(id)
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404)

    try {
      const ok = await manager.startDevServer(id)
      if (!ok) return c.json({ error: 'Failed to start dev server (npm install or vite startup failed)' }, 500)
      const updated = manager.get(id)
      return c.json({ ok: true, port: updated?.port ?? sandbox.port })
    } catch {
      return c.json({ error: 'Failed to start dev server' }, 500)
    }
  })

  app.post('/:id/generate', async (c) => {
    const id = c.req.param('id')
    const sandbox = manager.get(id)
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404)

    const { inputType, inputData } = await c.req.json<{
      inputType: InputType
      inputData: string
    }>()

    manager.updateState(id, 'generating')

    return c.json({
      ok: true,
      sandboxDir: sandbox.dir,
      sandboxPort: sandbox.port,
      input: { type: inputType, text: inputData },
    })
  })

  app.post('/:id/regenerate', async (c) => {
    const id = c.req.param('id')
    const sandbox = manager.get(id)
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404)

    const { inputType, inputData } = await c.req.json<{
      inputType: InputType
      inputData: string
    }>()

    manager.updateState(id, 'generating')

    return c.json({
      ok: true,
      sandboxDir: sandbox.dir,
      sandboxPort: sandbox.port,
      input: { type: inputType, text: inputData },
    })
  })

  app.post('/:id/update-state', async (c) => {
    const id = c.req.param('id')
    const sandbox = manager.get(id)
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404)

    const { state } = await c.req.json<{ state: string }>()
    manager.updateState(id, state as import('./sandbox-types.js').SandboxState)

    return c.json({ ok: true })
  })

  app.post('/:id/share', async (c) => {
    const id = c.req.param('id')
    const sandbox = manager.get(id)
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404)

    const { prUrl, previewUrl, branch } = await c.req.json<{
      prUrl: string
      previewUrl?: string
      branch: string
    }>()

    manager.updatePR(id, prUrl, previewUrl ?? '', branch)

    return c.json({ ok: true })
  })

  app.post('/:id/archive', (c) => {
    const id = c.req.param('id')
    const sandbox = manager.get(id)
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404)

    manager.archive(id)
    return c.json({ ok: true })
  })

  app.delete('/:id', (c) => {
    const id = c.req.param('id')
    const sandbox = manager.get(id)
    if (!sandbox) return c.json({ error: 'Sandbox not found' }, 404)

    manager.remove(id)
    return c.json({ ok: true })
  })

  return app
}

import { Hono } from 'hono'
import { Liveframe, LiveframeError } from './liveframe.js'

export function liveframeRoutes(liveframe = new Liveframe()): Hono {
  const app = new Hono()

  app.onError((err, c) => {
    if (err instanceof LiveframeError) return c.json({ error: err.message }, err.status)
    throw err
  })

  app.get('/status', async (c) => c.json(await liveframe.status()))

  app.get('/frames', (c) => c.json(liveframe.listFrames()))

  app.post('/frames', async (c) => {
    const { project, name } = await c.req.json<{ project?: string; name?: string }>()
    if (!project?.trim() || !name?.trim()) return c.json({ error: 'project and name are required' }, 400)
    return c.json(await liveframe.createFrame(project.trim(), name.trim()), 201)
  })

  app.post('/pull', async (c) => {
    const { target } = await c.req.json<{ target?: string }>()
    const [project = '', frame = ''] = (target ?? '').trim().split('/')
    return c.json(await liveframe.pullFrame(project, frame), 201)
  })

  app.post('/frames/:project/:frame/push', async (c) => {
    const { project, frame } = c.req.param()
    const { note } = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }))
    return c.json({ url: await liveframe.pushFrame(project, frame, note?.trim() || undefined) })
  })

  return app
}

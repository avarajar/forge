import { Hono } from 'hono'
import { Kioku, KiokuError } from './kioku.js'

export function kiokuRoutes(kioku = new Kioku()): Hono {
  const app = new Hono()

  app.onError((err, c) => {
    if (err instanceof KiokuError) return c.json({ error: err.message }, err.status)
    throw err
  })

  app.get('/status', async (c) => c.json(await kioku.status(c.req.query('fresh') === '1')))

  app.post('/viewer', async (c) => c.json({ address: await kioku.openViewer() }))

  app.delete('/viewer', (c) => {
    kioku.stopViewer()
    return c.json({ ok: true })
  })

  return app
}

import { Hono, type Context } from 'hono'
import { Kioku, KiokuError, rememberPrompt, type KiokuBrainInput, type KiokuLinkInput, type KiokuSaveInput } from './kioku.js'

export interface KiokuRouteOptions {
  // types a line into a live session's terminal; false when the session has none
  type?: (project: string, sessionDir: string, text: string) => boolean
  // whether the session's agent has kioku's skill
  canRemember?: (project: string, sessionDir: string) => boolean
}

interface RememberBody { project?: string; sessionDir?: string; text?: string }
interface AreaBody { brain: string; area: string; summary: string }
interface PublishBody { brain: string; to: string; understood: boolean }

// an empty field reads as not given
const trim = (value?: string): string | undefined => value?.trim() || undefined

const REMEMBER_MAX = 500

// a body that is not JSON reads as empty, and Kioku says what is missing
const body = <T>(c: Context): Promise<Partial<T>> => c.req.json<Partial<T>>().catch((): Partial<T> => ({}))

export function kiokuRoutes(kioku = new Kioku(), options: KiokuRouteOptions = {}): Hono {
  const app = new Hono()

  app.onError((err, c) => {
    if (err instanceof KiokuError) return c.json({ error: err.message }, err.status)
    throw err
  })

  app.get('/status', async (c) => c.json(await kioku.status(c.req.query('fresh') === '1')))

  app.post('/pages', async (c) => {
    const input = await c.req.json<Partial<KiokuSaveInput>>().catch((): Partial<KiokuSaveInput> => ({}))
    const brain = input.brain?.trim()
    const title = input.title?.trim()
    const summary = input.summary?.trim()
    if (!brain || !input.type || !title || !summary || !input.body?.trim()) return c.json({ error: 'brain, type, title, summary and body are required' }, 400)
    const result = await kioku.save({ brain, type: input.type, title, summary, body: input.body, namespace: input.namespace?.trim() || undefined, create: input.create === true })
    return c.json(result, result.status === 'done' ? 201 : 200)
  })

  app.post('/brains', async (c) => {
    const { repo, tier, team, language } = await body<KiokuBrainInput>(c)
    return c.json(await kioku.createBrain({ repo: trim(repo) ?? '', tier: tier ?? '', team: trim(team), language: trim(language) }), 201)
  })

  app.post('/areas', async (c) => {
    const { brain, area, summary } = await body<AreaBody>(c)
    return c.json(await kioku.addArea(brain ?? '', trim(area) ?? '', trim(summary) ?? ''), 201)
  })

  app.post('/link', async (c) => {
    const { project, brain, team } = await body<KiokuLinkInput>(c)
    return c.json(await kioku.linkProject({ project: project ?? '', brain: trim(brain), team: trim(team) }))
  })

  // the console asks the person to accept the warning first and sends that along
  app.post('/publish', async (c) => {
    const { brain, to, understood } = await body<PublishBody>(c)
    if (understood !== true) return c.json({ error: 'publishing needs the warning accepted' }, 400)
    return c.json(await kioku.publish(brain ?? '', trim(to)))
  })

  app.post('/remember', async (c) => {
    const { project, sessionDir, text } = await c.req.json<RememberBody>().catch((): RememberBody => ({}))
    const line = text?.trim()
    if (!project || !sessionDir || !line) return c.json({ error: 'project, sessionDir and text are required' }, 400)
    if (line.length > REMEMBER_MAX) return c.json({ error: `keep it under ${REMEMBER_MAX} characters` }, 400)
    if (options.canRemember && !options.canRemember(project, sessionDir)) return c.json({ error: "only Claude Code sessions have kioku's skill" }, 400)
    if (!options.type?.(project, sessionDir, rememberPrompt(line))) return c.json({ error: 'the session has no live terminal' }, 409)
    return c.json({ ok: true })
  })

  app.post('/viewer', async (c) => c.json({ address: await kioku.openViewer() }))

  app.delete('/viewer', (c) => {
    kioku.stopViewer()
    return c.json({ ok: true })
  })

  return app
}

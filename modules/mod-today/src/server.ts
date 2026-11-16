import { defineModule, defineAction, defineRoute, defineJob, ModuleError, type ForgeContext } from '@forge-dev/sdk'
import { shouldRead, type Digest } from './digest'
import { acceptAll, applyItem, digestDates, isFolded, localDate, readNow, setFolded, type Op } from './run'

const RETRY_AFTER_FAILURE = 60 * 60 * 1000
const DATE = /^\d{4}-\d{2}-\d{2}$/

interface ItemInput { date: string; id: string; project?: string }

function itemAction(id: Op, label: string) {
  return defineAction<ItemInput>({
    id,
    label,
    effect: 'local',
    input: {
      date: { type: 'string', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      id: { type: 'string', required: true },
      project: { type: 'string' },
    },
    run: (input, ctx) => applyItem(ctx, input.date, input.id, id, input.project),
  })
}

async function digestFor(ctx: ForgeContext, date: string | undefined) {
  const days = await digestDates(ctx)
  const wanted = date ?? (days.includes(localDate(new Date())) ? localDate(new Date()) : days[0])
  const digest = wanted ? await ctx.storage.get<Digest>(`digest/${wanted}`) : undefined
  if (!digest) return { digest: null, folded: false }
  return { digest, folded: await isFolded(ctx, digest.date), ...(digest.error ? { lastError: digest.error } : {}) }
}

export default defineModule({
  routes: [
    defineRoute({ method: 'GET', path: '/digest', handler: (_req, ctx) => digestFor(ctx, undefined) }),
    defineRoute({
      method: 'GET',
      path: '/digest/:date',
      handler: (req, ctx) => {
        if (!DATE.test(req.params.date)) throw new ModuleError('bad_request', 'date must be yyyy-mm-dd')
        return digestFor(ctx, req.params.date)
      },
    }),
    defineRoute({ method: 'GET', path: '/projects', handler: async (_req, ctx) => ({ projects: (await ctx.projects.list()).map(p => p.name) }) }),
    defineRoute({ method: 'GET', path: '/days', handler: async (_req, ctx) => ({ days: await digestDates(ctx) }) }),
  ],
  actions: [
    defineAction({ id: 'refresh', label: 'Read now', effect: 'local', run: (_input, ctx) => readNow(ctx, new Date()) }),
    itemAction('send', 'Send'),
    itemAction('start', 'Start'),
    itemAction('research', 'Research'),
    itemAction('dismiss', 'Dismiss'),
    defineAction<{ date: string; id?: string; project?: string }>({
      id: 'accept-all',
      label: 'Accept all',
      effect: 'local',
      input: {
        date: { type: 'string', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        id: { type: 'string' },
        project: { type: 'string' },
      },
      run: (input, ctx) => acceptAll(ctx, input.date, input.id, input.project),
    }),
    defineAction<{ date: string; folded: boolean }>({
      id: 'fold',
      label: 'Fold',
      effect: 'local',
      input: {
        date: { type: 'string', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        folded: { type: 'boolean', required: true },
      },
      run: async (input, ctx) => {
        await setFolded(ctx, input.date, input.folded)
        return { folded: input.folded }
      },
    }),
  ],
  jobs: [
    defineJob({
      id: 'read',
      every: '5m',
      run: async ctx => {
        const now = new Date()
        const [lastReadAt, failedAt] = await Promise.all([ctx.storage.get<string>('lastReadAt'), ctx.storage.get<string>('lastFailedAt')])
        if (failedAt && now.getTime() - Date.parse(failedAt) < RETRY_AFTER_FAILURE) return
        const time = typeof ctx.settings.time === 'string' ? ctx.settings.time : '08:00'
        if (shouldRead(now, time, lastReadAt)) await readNow(ctx, now)
      },
    }),
  ],
})

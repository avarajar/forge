import { defineModule, defineAction, defineRoute, defineJob, ModuleError, type ForgeContext } from '@forge-dev/sdk'
import { ownersOf } from './ops'
import { shouldRead, type Digest } from './digest'
import { acceptAll, applyItem, digestDates, isEnabled, isFolded, localDate, OFF_MESSAGE, readNow, reconnectAccount, retryAccount, setEnabled, setFolded, type Op } from './run'

const RETRY_AFTER_FAILURE = 60 * 60 * 1000
const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_PATTERN = DATE.source

interface ItemInput { date: string; id: string; project?: string }

function itemAction(id: Op, label: string) {
  return defineAction<ItemInput>({
    id,
    label,
    effect: 'local',
    input: {
      date: { type: 'string', required: true, pattern: DATE_PATTERN },
      id: { type: 'string', required: true },
      project: { type: 'string' },
    },
    run: (input, ctx) => applyItem(ctx, input.date, input.id, id, input.project),
  })
}

async function digestFor(ctx: ForgeContext, date: string | undefined) {
  const read = (day: string) => Promise.all([ctx.storage.get<Digest>(`digest/${day}`), isFolded(ctx, day)])
  // today's digest is read directly; the days are listed only when it is missing
  let wanted = date ?? localDate(new Date())
  let [digest, folded] = await read(wanted)
  if (!digest && !date) {
    const latest = (await digestDates(ctx))[0]
    if (latest) [digest, folded] = await read((wanted = latest))
  }
  const enabled = await isEnabled(ctx)
  return digest ? { digest, folded, enabled } : { digest: null, folded: false, enabled }
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
    defineRoute({ method: 'GET', path: '/projects', handler: async (_req, ctx) => {
        const all = await ctx.projects.list()
        return { projects: all.map(p => p.name), owners: ownersOf(all) }
      },
    }),
    defineRoute({ method: 'GET', path: '/days', handler: async (_req, ctx) => ({ days: await digestDates(ctx) }) }),
  ],
  actions: [
    defineAction({
      id: 'refresh',
      label: 'Read now',
      effect: 'local',
      run: (_input, ctx) => readNow(ctx, new Date()),
    }),
    defineAction<{ account: string }>({
      id: 'retry-account',
      label: 'Retry',
      effect: 'local',
      input: { account: { type: 'string', required: true } },
      run: (input, ctx) => retryAccount(ctx, input.account, new Date()),
    }),
    defineAction<{ account: string }>({
      id: 'reconnect',
      label: 'Reconnect',
      effect: 'local',
      input: { account: { type: 'string', required: true } },
      run: (input, ctx) => reconnectAccount(ctx, input.account),
    }),
    defineAction({
      id: 'enable',
      label: 'Turn on',
      effect: 'local',
      run: async (_input, ctx) => {
        await setEnabled(ctx, true)
        return { enabled: true }
      },
    }),
    defineAction({
      id: 'disable',
      label: 'Turn off',
      effect: 'local',
      run: async (_input, ctx) => {
        await setEnabled(ctx, false)
        await ctx.notify.clear('today')
        return { enabled: false }
      },
    }),
    itemAction('send', 'Send'),
    itemAction('start', 'Start'),
    itemAction('research', 'Research'),
    itemAction('dismiss', 'Dismiss'),
    defineAction<{ date: string; id?: string; project?: string; account?: string }>({
      id: 'accept-all',
      label: 'Accept all',
      effect: 'local',
      input: {
        date: { type: 'string', required: true, pattern: DATE_PATTERN },
        id: { type: 'string' },
        project: { type: 'string' },
        account: { type: 'string' },
      },
      run: (input, ctx) => acceptAll(ctx, input.date, input.id, input.project, input.account),
    }),
    defineAction<{ date: string; folded: boolean }>({
      id: 'fold',
      label: 'Fold',
      effect: 'local',
      input: {
        date: { type: 'string', required: true, pattern: DATE_PATTERN },
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
        if (!shouldRead(now, time, lastReadAt)) return
        try {
          await readNow(ctx, now)
        } catch (e) {
          // turned off: nothing to read and nothing to report
          if (!(e instanceof ModuleError && e.message === OFF_MESSAGE)) throw e
        }
      },
    }),
  ],
})

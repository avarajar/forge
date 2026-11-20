import { defineModule, defineAction, defineRoute, defineJob, type ForgeContext } from '@forge-dev/sdk'
import { confirmAnswer, runAnswer, type AnswerInput } from './answer'
import { readingInFlight, readNow, stateOf } from './reader'
import { dueBy, scheduleOf } from './schedule'
import { projectsFor, remoteIndex, startTicket } from './start'

async function fullState(ctx: ForgeContext) {
  const state = await stateOf(ctx)
  const tickets = [...state.reading?.tickets ?? [], ...state.reading?.enCurso ?? []]
  const index = tickets.some(t => t.repo) ? await remoteIndex(ctx).catch(() => new Map<string, string[]>()) : new Map<string, string[]>()
  // which CW projects each ticket can start in, so the view knows when to ask
  const projects = Object.fromEntries(await Promise.all(tickets.map(async t => [t.numero, await projectsFor(ctx, t, index)] as const)))
  return { ...state, projectsFor: projects, mode: scheduleOf(ctx.settings).mode }
}

// starts a reading in the background when one is due; the view polls /state while it runs
async function readIfDue(ctx: ForgeContext, trigger: 'job' | 'open') {
  if (readingInFlight()) return
  const last = await ctx.storage.get<string>('lastAttemptAt')
  if (!dueBy(scheduleOf(ctx.settings), trigger, new Date(), last)) return
  const reading = readNow(ctx)
  if (trigger === 'job') await reading
  else reading.catch(() => {})
}

export default defineModule({
  routes: [
    defineRoute({ method: 'GET', path: '/state', handler: (_req, ctx) => fullState(ctx) }),
    defineRoute({ method: 'GET', path: '/projects', handler: async (_req, ctx) => ({ projects: (await ctx.projects.list()).map(p => p.name) }) }),
  ],
  actions: [
    defineAction({
      id: 'refresh',
      label: 'Leer ahora',
      effect: 'local',
      run: async (_input, ctx) => {
        await readNow(ctx)
        return fullState(ctx)
      },
    }),
    defineAction({
      id: 'read-if-stale',
      label: 'Leer si hace falta',
      effect: 'local',
      run: async (_input, ctx) => {
        await readIfDue(ctx, 'open')
        return fullState(ctx)
      },
    }),
    defineAction<{ numero: number; project?: string }>({
      id: 'start',
      label: 'Empezar',
      effect: 'local',
      input: { numero: { type: 'number', required: true, min: 1 }, project: { type: 'string' } },
      run: (input, ctx) => startTicket(ctx, input.numero, input.project),
    }),
    defineAction<AnswerInput>({
      id: 'answer',
      label: 'Responder',
      effect: 'external',
      input: { solicitud: { type: 'number', required: true, min: 1 }, respuesta: { type: 'string', required: true } },
      confirm: confirmAnswer,
      run: runAnswer,
    }),
  ],
  jobs: [
    defineJob({
      id: 'read',
      every: '1m',
      run: async ctx => {
        try {
          await readIfDue(ctx, 'job')
        } catch (e) {
          // already kept as lastError and shown on the page
          ctx.log.warn(`reading failed: ${e instanceof Error ? e.message : String(e)}`)
        }
      },
    }),
  ],
})

import { defineModule, defineRoute, defineAction } from '@forge-dev/sdk'

export const hello = defineRoute({
  method: 'GET',
  path: '/hello',
  handler: (_req, ctx) => ({ message: String(ctx.settings.greeting ?? 'Hello') }),
})

export const count = defineAction<{ n?: number }, { n: number }>({
  id: 'count',
  label: 'Count',
  effect: 'read',
  run: async (input) => ({ n: (input?.n ?? 0) + 1 }),
})

export default defineModule({ routes: [hello], actions: [count] })

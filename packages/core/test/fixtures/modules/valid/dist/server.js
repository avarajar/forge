const unreachable = (message) => Object.assign(new Error(message), { name: 'ModuleError', code: 'unreachable' })
export default {
  routes: [
    { method: 'GET', path: '/hello', handler: (req) => ({ hello: req.query.name ?? 'world' }) },
    { method: 'GET', path: '/items/:id', handler: (req) => ({ id: req.params.id }) },
    { method: 'POST', path: '/echo', handler: (req) => ({ body: req.body }) },
    { method: 'GET', path: '/down', handler: () => { throw unreachable('Harvey is not running on :5555') } },
    { method: 'GET', path: '/boom', handler: () => { throw new TypeError('kaput') } },
    { method: 'GET', path: '/denied', handler: (_req, ctx) => ctx.fetch('http://localhost:9/') },
  ],
  actions: [
    { id: 'count', label: 'Count', effect: 'read', run: async (input) => ({ n: (input?.n ?? 0) + 1 }) },
    { id: 'send', label: 'Send', effect: 'external',
      confirm: async (input) => ({ title: 'Send', confirmLabel: 'Send', items: [{ label: input.to }], plan: { ids: [input.to] } }),
      run: async (_input, ctx) => ({ sent: ctx.confirmed }) },
    { id: 'talk', label: 'Talk', effect: 'local', run: async (_input, ctx) => { ctx.output('one\n'); ctx.output('two\n'); return { done: true } } },
  ],
}

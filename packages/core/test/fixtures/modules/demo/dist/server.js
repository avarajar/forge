export default {
  actions: [
    { id: 'send', label: 'Send', effect: 'external',
      confirm: async (input) => ({ title: 'Send 1 email', confirmLabel: 'Send', items: [{ label: input.to, detail: 'Subject: Demo\n\nHello there' }], plan: { to: input.to } }),
      run: async (_input, ctx) => ({ sent: ctx.confirmed }) },
  ],
  jobs: [{ id: 'watch', every: '30s', run: async (ctx) => {
    await ctx.notify.badge('outbox', 2, 'to approve')
    const n = ((await ctx.storage.get('ticks')) ?? 0) + 1
    await ctx.storage.set('ticks', n)
    if (n === 2) await ctx.notify.attention({ key: 'reply', title: 'A reply needs you', body: 'Dra. Pérez answered', version: '1' })
  } }],
}

export default {
  jobs: [{ id: 'watch', every: '1m', run: async (ctx) => { await ctx.notify.attention({ key: 'reply', title: 'A reply needs you', version: '1' }); await ctx.notify.badge('outbox', 3, 'to approve') } }],
}

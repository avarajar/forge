import { homedir } from 'node:os'
import { ModuleError, type ForgeContext } from '@forge-dev/sdk'
import { buildPrompt, READER_TOOLS } from './prompt'
import { dedupe, parseReaderOutput, pendingCount, type Digest, type Item } from './digest'

export type Op = 'send' | 'start' | 'research' | 'dismiss'

const DAY = 24 * 60 * 60 * 1000
const HANDLED_KEEP = 30 * DAY

export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function loadDigest(ctx: ForgeContext, date: string): Promise<Digest | undefined> {
  return ctx.storage.get<Digest>(`digest/${date}`)
}

export async function digestDates(ctx: ForgeContext): Promise<string[]> {
  const keys = await ctx.storage.list('digest/')
  const dates = keys.map(k => /(\d{4}-\d{2}-\d{2})$/.exec(k)?.[1]).filter((d): d is string => !!d)
  return [...new Set(dates)].sort().reverse().slice(0, 14)
}

async function saveDigest(ctx: ForgeContext, d: Digest): Promise<void> {
  await ctx.storage.set(`digest/${d.date}`, d)
  await ctx.notify.badge('today', pendingCount(d), 'to review')
}

function sourceText(i: Item): string {
  return `${i.who} in ${i.where}`
}

async function chooseAccount(ctx: ForgeContext): Promise<string> {
  const set = ctx.settings.account
  if (typeof set === 'string' && set) return set
  const all = await ctx.accounts.list()
  const pick = all.find(a => !a.harness || a.harness === 'claude') ?? all[0]
  if (!pick) throw new Error('no CW account to read with')
  return pick.name
}

async function reread(ctx: ForgeContext, now: Date): Promise<Item[]> {
  const [sessions, projects, lastReadAt, handled, account] = await Promise.all([
    ctx.sessions.list(),
    ctx.projects.list(),
    ctx.storage.get<string>('lastReadAt'),
    ctx.storage.get<Record<string, string>>('handled'),
    chooseAccount(ctx),
  ])
  const since = lastReadAt ?? new Date(now.getTime() - DAY).toISOString()
  const names = projects.map(p => p.name)
  const prompt = buildPrompt({ since, sessions, projects: names })
  const model = typeof ctx.settings.model === 'string' && ctx.settings.model ? ctx.settings.model : undefined
  const out = await ctx.agent.run({ account, prompt, model, allowedTools: READER_TOOLS, timeoutMs: 10 * 60 * 1000 })
  const items = parseReaderOutput(out.text, { projects: names, sessions: sessions.map(s => `${s.project}::${s.sessionDir}`) })
  return dedupe(items, handled ?? {})
}

async function rememberHandled(ctx: ForgeContext, items: Item[], now: Date): Promise<void> {
  const old = (await ctx.storage.get<Record<string, string>>('handled')) ?? {}
  const next: Record<string, string> = {}
  for (const [id, when] of Object.entries(old)) if (now.getTime() - Date.parse(when) < HANDLED_KEEP) next[id] = when
  for (const i of items) next[i.id] = i.when
  await ctx.storage.set('handled', next)
}

// merges fresh items into the day's digest: new ones are added, proposed ones are refreshed
function merge(existing: Item[], fresh: Item[]): Item[] {
  const byId = new Map(existing.map(i => [i.id, i]))
  const out = [...existing]
  for (const i of fresh) {
    const had = byId.get(i.id)
    if (!had) out.push(i)
    else if (had.state === 'proposed') out[out.indexOf(had)] = i
  }
  return out
}

let reading: Promise<Digest> | undefined

export function readNow(ctx: ForgeContext, now: Date): Promise<Digest> {
  reading ??= doRead(ctx, now).finally(() => {
    reading = undefined
  })
  return reading
}

async function doRead(ctx: ForgeContext, now: Date): Promise<Digest> {
  const date = localDate(now)
  try {
    const fresh = await reread(ctx, now)
    const prev = await loadDigest(ctx, date)
    const digest: Digest = {
      date,
      readAt: now.toISOString(),
      since: prev?.since ?? (await ctx.storage.get<string>('lastReadAt')) ?? new Date(now.getTime() - DAY).toISOString(),
      items: merge(prev?.items ?? [], fresh),
      autoStarted: prev?.autoStarted ?? 0,
    }
    await rememberHandled(ctx, fresh, now)
    await ctx.storage.set('lastReadAt', now.toISOString())
    await ctx.storage.delete('lastFailedAt')
    await saveDigest(ctx, digest)
    await autoResearch(ctx, digest)
    return digest
  } catch (e) {
    return keepWithError(ctx, now, message(e))
  }
}

async function keepWithError(ctx: ForgeContext, now: Date, error: string): Promise<Digest> {
  const date = localDate(now)
  const latest = (await loadDigest(ctx, date)) ?? (await loadDigest(ctx, (await digestDates(ctx))[0] ?? ''))
  const digest: Digest = { ...(latest ?? { date, readAt: now.toISOString(), since: now.toISOString(), items: [], autoStarted: 0 }), error }
  await ctx.storage.set('lastFailedAt', now.toISOString())
  await saveDigest(ctx, digest)
  return digest
}

async function autoResearch(ctx: ForgeContext, digest: Digest): Promise<void> {
  if (ctx.settings.autoResearch === false) return
  const max = typeof ctx.settings.maxAuto === 'number' ? ctx.settings.maxAuto : 3
  for (const item of digest.items) {
    if (digest.autoStarted >= max) break
    if (item.kind !== 'research' || item.state !== 'proposed') continue
    digest.autoStarted++
    await perform(ctx, item, 'research')
    await saveDigest(ctx, digest)
  }
}

async function researchDirectory(ctx: ForgeContext): Promise<string> {
  const name = ctx.settings.researchProject
  if (typeof name === 'string' && name) {
    const dir = await ctx.projects.dir(name)
    if (dir) return dir
  }
  return process.env.HOME || homedir()
}

// runs one op on an item in memory; send problems keep it proposed, start problems fail it
async function perform(ctx: ForgeContext, item: Item, op: Op, project?: string): Promise<void> {
  if (op === 'dismiss') {
    item.state = 'dismissed'
    delete item.error
    return
  }
  if (op === 'send') {
    const t = item.targetSession
    if (item.kind !== 'to-task' || !t) throw new ModuleError('bad_request', 'this item has no task to send to')
    const text = `[Today] ${sourceText(item)}: ${item.quote ?? item.title} — ${item.link}`
    try {
      const r = await ctx.sessions.send(t.project, t.sessionDir, text)
      if (r === 'typed' || r === 'resumed') {
        item.state = 'done'
        delete item.error
      } else {
        item.error = 'Could not send it to that session: open the task and paste it'
      }
    } catch (e) {
      item.error = `Could not send it: ${message(e)}. Open the task to paste it`
    }
    return
  }
  if (op === 'start') {
    if (item.kind !== 'issue' && item.kind !== 'request') throw new ModuleError('bad_request', 'only issues and requests start a task')
    const target = project ?? item.project
    if (!target) throw new ModuleError('bad_request', 'pick a project')
    item.project = target
    const task = item.kind === 'issue' ? item.link : `${item.title}\n\nFrom ${sourceText(item)}: ${item.link}`
    await startSession(ctx, item, { type: 'work', project: target, task })
    return
  }
  if (item.kind !== 'research') throw new ModuleError('bad_request', 'only research items start a research session')
  const context = [item.quote, item.link].filter(Boolean).join(' ')
  const directory = await researchDirectory(ctx)
  await startSession(ctx, item, { type: 'general', directory, task: `${item.title} — find out and leave the answer in the session. Context: ${context}` })
}

async function startSession(ctx: ForgeContext, item: Item, input: Parameters<ForgeContext['cw']['start']>[0]): Promise<void> {
  try {
    item.startedSession = await ctx.cw.start(input)
    item.state = 'done'
    delete item.error
  } catch (e) {
    item.state = 'failed'
    item.error = message(e)
  }
}

async function requireDigest(ctx: ForgeContext, date: string): Promise<Digest> {
  const d = await loadDigest(ctx, date)
  if (!d) throw new ModuleError('not_found', `no digest for ${date}`)
  return d
}

function requireOpen(item: Item | undefined): Item {
  if (!item) throw new ModuleError('not_found', 'no such item')
  if (item.state !== 'proposed' && item.state !== 'failed') throw new ModuleError('bad_request', `item is already ${item.state}`)
  return item
}

export async function applyItem(ctx: ForgeContext, date: string, id: string, op: Op, project?: string): Promise<Item> {
  const digest = await requireDigest(ctx, date)
  const item = requireOpen(digest.items.find(i => i.id === id))
  if (item.state === 'failed') item.state = 'proposed'
  await perform(ctx, item, op, project)
  await saveDigest(ctx, digest)
  return item
}

// the op an item can take on its own, or none when it still needs the person
function defaultOp(item: Item, project?: string): Op | undefined {
  if (item.kind === 'to-task') return item.targetSession ? 'send' : undefined
  if (item.kind === 'research') return 'research'
  return project ?? item.project ? 'start' : undefined
}

// accepts one item (with a picked project) or, without an id, every proposed item that has what it needs
export async function acceptAll(ctx: ForgeContext, date: string, id?: string, project?: string): Promise<Digest> {
  const digest = await requireDigest(ctx, date)
  const items = id ? [requireOpen(digest.items.find(i => i.id === id))] : digest.items.filter(i => i.state === 'proposed')
  for (const item of items) {
    const op = defaultOp(item, project)
    if (!op) {
      if (id) throw new ModuleError('bad_request', 'pick a project')
      continue
    }
    if (item.state === 'failed') item.state = 'proposed'
    try {
      await perform(ctx, item, op, project)
    } catch (e) {
      if (id) throw e
      item.error = message(e)
    }
  }
  await saveDigest(ctx, digest)
  return digest
}

export async function setFolded(ctx: ForgeContext, date: string, folded: boolean): Promise<void> {
  if (folded) await ctx.storage.set(`folded/${date}`, true)
  else await ctx.storage.delete(`folded/${date}`)
}

export async function isFolded(ctx: ForgeContext, date: string): Promise<boolean> {
  return (await ctx.storage.get<boolean>(`folded/${date}`)) === true
}

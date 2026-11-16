import { homedir } from 'node:os'
import { ModuleError, type ForgeContext } from '@forge-dev/sdk'
import { buildPrompt, READER_TOOLS } from './prompt'
import { dedupe, itemId, parseReaderOutput, pendingCount, type Digest, type Item, type Op } from './digest'
import { errorMessage, githubPage, oneLine, opFor } from './ops'
import { fetchGithub } from './github'

export type { Op }

const DAY = 24 * 60 * 60 * 1000
const HANDLED_KEEP = 30 * DAY

export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

let chain: Promise<unknown> = Promise.resolve()

// every digest mutation runs one at a time so a save never overwrites a newer one
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn)
  chain = next.catch(() => {})
  return next
}

// a task name CW can use as a folder and a branch
function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'request'
}

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
  return `${oneLine(i.who)} in ${oneLine(i.where)}`
}

async function chooseAccount(ctx: ForgeContext): Promise<string> {
  const set = ctx.settings.account
  if (typeof set === 'string' && set) return set
  const all = await ctx.accounts.list()
  const pick = all.find(a => !a.harness || a.harness === 'claude') ?? all[0]
  if (!pick) throw new Error('no CW account to read with')
  return pick.name
}

// judged by the link, not the model's source: a GitHub link must be one gh fetched, and a review one whose review was requested
function checkGithub(items: Item[], fetched: Set<string>, toReview: Set<string>): Item[] {
  return items.flatMap(i => {
    const page = githubPage(i.link)
    if (i.kind === 'review' ? !page || !toReview.has(page) : page && !fetched.has(page)) return []
    return page ? [{ ...i, id: itemId('github', page), source: 'github' as const, link: page }] : [i]
  })
}

// one item per id, the one with the latest activity
function collapse(items: Item[]): Item[] {
  const byId = new Map<string, Item>()
  for (const i of items) {
    const had = byId.get(i.id)
    if (!had || Date.parse(i.when) > Date.parse(had.when)) byId.set(i.id, i)
  }
  return [...byId.values()]
}

// notes collects problems that do not fail the reading
async function reread(ctx: ForgeContext, now: Date, notes: string[]): Promise<Item[]> {
  const [sessions, projects, lastReadAt, handled, account] = await Promise.all([
    ctx.sessions.list(),
    ctx.projects.list(),
    ctx.storage.get<string>('lastReadAt'),
    ctx.storage.get<Record<string, string>>('handled'),
    chooseAccount(ctx),
  ])
  const since = lastReadAt ?? new Date(now.getTime() - DAY).toISOString()
  const names = projects.map(p => p.name)
  const gh = await fetchGithub(ctx, since)
  if (gh.error) notes.push(`GitHub: ${gh.error}`)
  const prompt = buildPrompt({ since, sessions, projects: names, github: gh.items })
  const model = typeof ctx.settings.model === 'string' && ctx.settings.model ? ctx.settings.model : undefined
  const out = await ctx.agent.run({ account, prompt, model, allowedTools: READER_TOOLS, timeoutMs: 10 * 60 * 1000 })
  const fetched = new Set(gh.items.map(e => e.pr))
  const toReview = new Set(gh.items.filter(e => e.type === 'review-request').map(e => e.pr))
  const items = parseReaderOutput(out.text, { projects: names, sessions: sessions.map(s => `${s.project}::${s.sessionDir}`) })
  return dedupe(collapse(checkGithub(items, fetched, toReview)), handled ?? {})
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
  const notes: string[] = []
  try {
    const fresh = await reread(ctx, now, notes)
    const lastReadAt = await ctx.storage.get<string>('lastReadAt')
    await locked(async () => {
      const prev = await loadDigest(ctx, date)
      const items = merge(prev?.items ?? [], fresh)
      const known = new Set((prev?.items ?? []).map(i => i.id))
      // new items reopen a folded day
      if (items.some(i => i.state === 'proposed' && !known.has(i.id))) await ctx.storage.delete(`folded/${date}`)
      await saveDigest(ctx, {
        date,
        readAt: now.toISOString(),
        since: prev?.since ?? lastReadAt ?? new Date(now.getTime() - DAY).toISOString(),
        items,
        autoStarted: prev?.autoStarted ?? 0,
        ...(notes.length ? { error: notes.join('; ') } : {}),
      })
      await rememberHandled(ctx, fresh, now)
      await ctx.storage.set('lastReadAt', now.toISOString())
      await ctx.storage.delete('lastFailedAt')
    })
    await autoResearch(ctx, date)
    return (await loadDigest(ctx, date))!
  } catch (e) {
    return keepWithError(ctx, now, [errorMessage(e), ...notes].join('; '))
  }
}

function keepWithError(ctx: ForgeContext, now: Date, error: string): Promise<Digest> {
  return locked(async () => {
    const date = localDate(now)
    const latest = (await loadDigest(ctx, date)) ?? (await loadDigest(ctx, (await digestDates(ctx))[0] ?? ''))
    const digest: Digest = { ...(latest ?? { date, readAt: now.toISOString(), since: now.toISOString(), items: [], autoStarted: 0 }), error }
    await ctx.storage.set('lastFailedAt', now.toISOString())
    await saveDigest(ctx, digest)
    return digest
  })
}

async function autoResearch(ctx: ForgeContext, date: string): Promise<void> {
  if (ctx.settings.autoResearch === false) return
  const max = typeof ctx.settings.maxAuto === 'number' ? ctx.settings.maxAuto : 3
  const first = await loadDigest(ctx, date)
  // text from GitHub can come from anyone, so it waits for a click
  const ids = (first?.items ?? []).filter(i => i.kind === 'research' && i.state === 'proposed' && i.source !== 'github' && !githubPage(i.link)).map(i => i.id)
  for (const id of ids) {
    const work = await locked(async () => {
      const digest = await loadDigest(ctx, date)
      if (!digest || digest.autoStarted >= max) return false
      const item = digest.items.find(i => i.id === id)
      if (!item || item.state !== 'proposed' || inFlight.has(claimKey(date, id))) return null
      digest.autoStarted++
      await saveDigest(ctx, digest)
      return claim(date, item)
    })
    if (work === false) break
    if (work) await runClaimed(ctx, date, work, 'research')
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
    const text = `[Today] ${sourceText(item)}: ${oneLine(item.quote ?? item.title, 300)} — ${oneLine(item.link)}`
    try {
      const r = await ctx.sessions.send(t.project, t.sessionDir, text)
      if (r === 'typed' || r === 'resumed') {
        item.state = 'done'
        delete item.error
      } else {
        item.error = 'Could not send it to that session: open the task and paste it'
      }
    } catch (e) {
      item.error = `Could not send it: ${errorMessage(e)}. Open the task to paste it`
    }
    return
  }
  if (op === 'start') {
    if (item.kind !== 'issue' && item.kind !== 'request' && item.kind !== 'review') throw new ModuleError('bad_request', 'only issues, requests and reviews start a task')
    const target = project ?? item.project
    if (!target) throw new ModuleError('bad_request', 'pick a project')
    item.project = target
    // a pull request link without its comment anchor, so CW reads the number
    const url = githubPage(item.link) ?? item.link
    // an issue link is a task CW knows; a request is named by its title and briefed in the notes
    const input = item.kind === 'review'
      ? { type: 'review' as const, project: target, task: url }
      : item.kind === 'issue'
      ? { type: 'work' as const, project: target, task: url, ...(item.source === 'github' && item.quote ? { description: [item.title, item.quote].join('\n\n') } : {}) }
      : { type: 'work' as const, project: target, task: slug(item.title), description: [item.title, item.quote, `From ${sourceText(item)}: ${item.link}`].filter(Boolean).join('\n\n') }
    await startSession(ctx, item, input)
    return
  }
  if (item.kind !== 'research') throw new ModuleError('bad_request', 'only research items start a research session')
  const context = [item.quote, item.link].filter(Boolean).join(' ')
  const directory = await researchDirectory(ctx)
  await startSession(ctx, item, {
    type: 'general',
    directory,
    task: `Research: ${oneLine(item.title, 60)}`,
    prompt: oneLine(`${item.title} — find out and leave the answer in the session. Context: ${context}`, 2000),
  })
}

async function startSession(ctx: ForgeContext, item: Item, input: Parameters<ForgeContext['cw']['start']>[0]): Promise<void> {
  try {
    item.startedSession = await ctx.cw.start(input)
    item.state = 'done'
    delete item.error
  } catch (e) {
    item.state = 'failed'
    item.error = errorMessage(e)
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

// items whose op is running outside the lock
const inFlight = new Set<string>()
const claimKey = (date: string, id: string) => `${date}/${id}`

// takes an open item out of other ops' reach and hands back a copy to work on
function claim(date: string, item: Item): Item {
  const key = claimKey(date, item.id)
  if (inFlight.has(key)) throw new ModuleError('bad_request', 'item is already being handled')
  inFlight.add(key)
  const work: Item = JSON.parse(JSON.stringify(item))
  if (work.state === 'failed') work.state = 'proposed'
  return work
}

// runs a claimed item's op without the lock, then saves the outcome unless the item was handled meanwhile
async function runClaimed(ctx: ForgeContext, date: string, work: Item, op: Op, project?: string, rethrow = false): Promise<Item | undefined> {
  const key = claimKey(date, work.id)
  try {
    try {
      await perform(ctx, work, op, project)
    } catch (e) {
      if (rethrow) throw e
      work.error = errorMessage(e)
    }
    return await locked(async () => {
      const digest = await loadDigest(ctx, date)
      const at = digest ? digest.items.findIndex(i => i.id === work.id) : -1
      if (!digest || at < 0) return undefined
      const current = digest.items[at]
      if (current.state !== 'proposed' && current.state !== 'failed') return current
      digest.items[at] = work
      await saveDigest(ctx, digest)
      return work
    })
  } finally {
    inFlight.delete(key)
  }
}

export async function applyItem(ctx: ForgeContext, date: string, id: string, op: Op, project?: string): Promise<Item> {
  const work = await locked(async () => claim(date, requireOpen((await requireDigest(ctx, date)).items.find(i => i.id === id))))
  const saved = await runClaimed(ctx, date, work, op, project, true)
  if (!saved) throw new ModuleError('not_found', 'no such item')
  return saved
}

// accepts one item (with a picked project) or, without an id, every proposed item that has what it needs
export async function acceptAll(ctx: ForgeContext, date: string, id?: string, project?: string): Promise<Digest> {
  const claimed = await locked(async () => {
    const digest = await requireDigest(ctx, date)
    const items = id ? [requireOpen(digest.items.find(i => i.id === id))] : digest.items.filter(i => i.state === 'proposed' && !inFlight.has(claimKey(date, i.id)))
    const out: { work: Item; op: Op }[] = []
    for (const item of items) {
      const op = opFor(item, project)
      if (!op) {
        if (id) throw new ModuleError('bad_request', 'pick a project')
        continue
      }
      out.push({ work: claim(date, item), op })
    }
    return out
  })
  // each op runs outside the lock, so a slow send never holds up other actions
  for (const [n, { work, op }] of claimed.entries()) {
    try {
      await runClaimed(ctx, date, work, op, project, !!id)
    } catch (e) {
      for (const rest of claimed.slice(n + 1)) inFlight.delete(claimKey(date, rest.work.id))
      throw e
    }
  }
  return requireDigest(ctx, date)
}

export function setFolded(ctx: ForgeContext, date: string, folded: boolean): Promise<void> {
  return locked(async () => {
    if (folded) await ctx.storage.set(`folded/${date}`, true)
    else await ctx.storage.delete(`folded/${date}`)
  })
}

export async function isFolded(ctx: ForgeContext, date: string): Promise<boolean> {
  return (await ctx.storage.get<boolean>(`folded/${date}`)) === true
}

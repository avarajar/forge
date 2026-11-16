import { homedir } from 'node:os'
import { ModuleError, type ForgeContext, type ProjectInfo, type SessionInfo } from '@forge-dev/sdk'
import { buildPrompt, READER_TOOLS } from './prompt'
import { countStart, dedupe, itemId, parseReaderOutput, parseReaderProblems, pendingCount, startedBy, toProblem, type Digest, type Item, type Op, type Problem } from './digest'
import { errorMessage, githubPage, inAccount, oneLine, opFor, ownersOf, startsTask, untrusted } from './ops'
import { fetchGithub, type GithubEvent } from './github'

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

const isClaude = (a: { harness?: string }) => !a.harness || a.harness === 'claude'

// the accounts to read: those named in the setting, or every Claude account
export async function readAccounts(ctx: ForgeContext): Promise<string[]> {
  const claude = (await ctx.accounts.list()).filter(isClaude).map(a => a.name)
  const set = typeof ctx.settings.accounts === 'string' ? ctx.settings.accounts : ''
  const wanted = set.split(',').map(n => n.trim()).filter(Boolean)
  const names = wanted.length ? claude.filter(n => wanted.includes(n)) : claude
  if (!names.length) throw new Error(wanted.length ? `none of ${wanted.join(', ')} is a Claude account` : 'no CW account to read with')
  return names
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

interface Reader { account: string; items: Item[]; problems: Problem[] }

// reads one account's connectors; a reader that got GitHub events marks its items manual
async function readAccount(ctx: ForgeContext, account: string, o: { since: string; sessions: SessionInfo[]; projects: ProjectInfo[]; owners: Record<string, string>; github?: Promise<{ items: GithubEvent[] }>; handled: Record<string, string> }): Promise<{ items: Item[]; problems: Problem[] }> {
  const mine = <T extends { account?: string }>(x: T) => !x.account || x.account === account
  const sessions = o.sessions.filter(mine)
  const projects = o.projects.filter(mine).map(p => p.name)
  const github = (await o.github)?.items ?? []
  const prompt = buildPrompt({ since: o.since, sessions, projects, github })
  const model = typeof ctx.settings.model === 'string' && ctx.settings.model ? ctx.settings.model : undefined
  const ask = () => ctx.agent.run({ account, prompt, model, allowedTools: READER_TOOLS, timeoutMs: 10 * 60 * 1000 })
  let out = await ask()
  // connectors can still be connecting when a headless run starts, so one retry before giving up
  if (parseReaderProblems(out.text).length) out = await ask()
  const problems = parseReaderProblems(out.text).map(p => toProblem(account, p))
  const fetched = new Set(github.map(e => e.pr))
  const toReview = new Set(github.filter(e => e.type === 'review-request').map(e => e.pr))
  const items = parseReaderOutput(out.text, { projects, sessions: sessions.map(s => `${s.project}::${s.sessionDir}`), account })
  // a GitHub item belongs to its project's account, or to none
  const placed = checkGithub(items, fetched, toReview).map(i => (i.source === 'github' ? { ...i, account: o.owners[i.project ?? i.targetSession?.project ?? ''] } : i))
  const fresh = dedupe(collapse(placed), o.handled)
  // GitHub text shares the reader's call, so anything it read may be steered by it
  return { items: github.length ? fresh.map(i => ({ ...i, manual: true })) : fresh, problems }
}

// one account's reading: a reader that throws is that account's reader problem
async function readOne(ctx: ForgeContext, account: string, o: Parameters<typeof readAccount>[2]): Promise<Reader & { error?: string }> {
  try {
    return { account, ...(await readAccount(ctx, account, o)) }
  } catch (e) {
    const error = errorMessage(e)
    return { account, items: [], problems: [{ account, source: 'reader', reason: error }], error }
  }
}

// notes collects problems that do not fail the reading
async function reread(ctx: ForgeContext, now: Date, notes: string[]): Promise<{ items: Item[]; problems: Problem[] }> {
  const lastReadAt = await ctx.storage.get<string>('lastReadAt')
  const since = lastReadAt ?? new Date(now.getTime() - DAY).toISOString()
  // ctx has no repository for a project, so GitHub is read once, by the first account's reader, while the others start
  const github = fetchGithub(ctx, since)
  const [sessions, projects, handled, accounts] = await Promise.all([
    ctx.sessions.list(),
    ctx.projects.list(),
    ctx.storage.get<Record<string, string>>('handled'),
    readAccounts(ctx),
  ])
  const owners = ownersOf(projects)
  const results = await Promise.all(accounts.map((account, n) => readOne(ctx, account, { since, sessions, projects, owners, github: n === 0 ? github : undefined, handled: handled ?? {} })))
  const gh = await github
  if (gh.error) notes.push(`GitHub: ${gh.error}`)
  if (results[0].error && gh.items.length) notes.push('GitHub: not read')
  const failed = results.filter(r => r.error)
  if (failed.length === results.length) throw new Error(failed.length === 1 ? failed[0].error : failed.map(f => `${f.account}: ${f.error}`).join('; '))
  return { items: collapse(results.flatMap(r => r.items)), problems: results.flatMap(r => r.problems) }
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
    // an item once read beside GitHub text keeps waiting for a click
    else if (had.state === 'proposed') out[out.indexOf(had)] = had.manual ? { ...i, manual: true } : i
  }
  return out
}

export async function isEnabled(ctx: ForgeContext): Promise<boolean> {
  return (await ctx.storage.get<boolean>('enabled')) === true
}

export const setEnabled = (ctx: ForgeContext, on: boolean) => ctx.storage.set('enabled', on)

let reading: Promise<Digest> | undefined

export const OFF_MESSAGE = 'Today is off'

// reads now unless Today is off; one reading at a time
export async function readNow(ctx: ForgeContext, now: Date): Promise<Digest> {
  if (!(await isEnabled(ctx))) throw new ModuleError('bad_request', OFF_MESSAGE)
  reading ??= doRead(ctx, now).finally(() => {
    reading = undefined
  })
  return reading
}

async function doRead(ctx: ForgeContext, now: Date): Promise<Digest> {
  const date = localDate(now)
  const notes: string[] = []
  try {
    const { items: fresh, problems } = await reread(ctx, now, notes)
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
        autoStarted: prev?.autoStarted ?? {},
        ...(notes.length ? { notes } : {}),
        ...(problems.length ? { problems } : {}),
      })
      await rememberHandled(ctx, fresh, now)
      await ctx.storage.set('lastReadAt', now.toISOString())
      await ctx.storage.delete('lastFailedAt')
    })
    await autoResearch(ctx, date)
    return (await loadDigest(ctx, date))!
  } catch (e) {
    return keepWithError(ctx, now, errorMessage(e), notes)
  }
}

// reads one account again with the digest's own window, without GitHub, and merges the result into today's digest
export async function retryAccount(ctx: ForgeContext, account: string, now: Date): Promise<Digest> {
  if (!(await isEnabled(ctx))) throw new ModuleError('bad_request', OFF_MESSAGE)
  if (!(await readAccounts(ctx)).includes(account)) throw new ModuleError('bad_request', `${account} is not an account Today reads`)
  // a reading in flight finishes first, so the two never write over each other
  await reading?.catch(() => {})
  const date = localDate(now)
  const prev = await loadDigest(ctx, date)
  if (!prev) throw new ModuleError('not_found', `no digest for ${date}`)
  const [sessions, projects, handled] = await Promise.all([ctx.sessions.list(), ctx.projects.list(), ctx.storage.get<Record<string, string>>('handled')])
  const result = await readOne(ctx, account, { since: prev.since, sessions, projects, owners: ownersOf(projects), handled: handled ?? {} })
  await locked(async () => {
    const digest = (await loadDigest(ctx, date)) ?? prev
    const items = merge(digest.items, result.items)
    const known = new Set(digest.items.map(i => i.id))
    if (items.some(i => i.state === 'proposed' && !known.has(i.id))) await ctx.storage.delete(`folded/${date}`)
    const problems = [...(digest.problems ?? []).filter(p => p.account !== account), ...result.problems]
    const next: Digest = { ...digest, items }
    if (problems.length) next.problems = problems
    else delete next.problems
    await saveDigest(ctx, next)
    await rememberHandled(ctx, result.items, now)
  })
  await autoResearch(ctx, date)
  return (await loadDigest(ctx, date))!
}

// opens the account's Claude Code at /mcp, where its connectors are signed in again
export async function reconnectAccount(ctx: ForgeContext, account: string): Promise<{ project: string; sessionDir: string }> {
  if (!(await readAccounts(ctx)).includes(account)) throw new ModuleError('bad_request', `${account} is not an account Today reads`)
  return ctx.cw.start({ type: 'general', account, task: `Reconnect connectors (${account})`, prompt: '/mcp' })
}

function keepWithError(ctx: ForgeContext, now: Date, error: string, notes: string[]): Promise<Digest> {
  return locked(async () => {
    const date = localDate(now)
    const latest = (await loadDigest(ctx, date)) ?? (await loadDigest(ctx, (await digestDates(ctx))[0] ?? ''))
    const digest: Digest = { ...(latest ?? { date, readAt: now.toISOString(), since: now.toISOString(), items: [], autoStarted: {} }), error }
    if (notes.length) digest.notes = notes
    else delete digest.notes
    await ctx.storage.set('lastFailedAt', now.toISOString())
    await saveDigest(ctx, digest)
    return digest
  })
}

async function autoResearch(ctx: ForgeContext, date: string): Promise<void> {
  if (ctx.settings.autoResearch === false || !(await isEnabled(ctx))) return
  const max = typeof ctx.settings.maxAuto === 'number' ? ctx.settings.maxAuto : 3
  const first = await loadDigest(ctx, date)
  // text from GitHub can come from anyone, so it waits for a click
  const ids = (first?.items ?? []).filter(i => i.kind === 'research' && i.state === 'proposed' && !untrusted(i)).map(i => i.id)
  for (const id of ids) {
    const work = await locked(async () => {
      const digest = await loadDigest(ctx, date)
      if (!digest || !(await isEnabled(ctx))) return false
      const item = digest.items.find(i => i.id === id)
      if (!item || item.state !== 'proposed' || inFlight.has(claimKey(date, id))) return null
      // the cap is per account: this one's research waits, the others go on
      if (startedBy(digest, item.account) >= max) return null
      countStart(digest, item.account)
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

type Owners = () => Promise<Record<string, string>>
const noOwners: Owners = async () => ({})

// reads the projects' accounts on first use, then reuses them
function lazyOwners(ctx: ForgeContext): Owners {
  let read: Promise<Record<string, string>> | undefined
  return () => (read ??= ctx.projects.list().then(ownersOf))
}

// runs one op on an item in memory; send problems keep it proposed, start problems fail it
async function perform(ctx: ForgeContext, item: Item, op: Op, project: string | undefined, owners: Owners): Promise<void> {
  if (op === 'dismiss') {
    item.state = 'dismissed'
    delete item.error
    return
  }
  if (op === 'send') {
    const t = item.targetSession
    if (item.kind !== 'to-task' || !t) throw new ModuleError('bad_request', 'this item has no task to send to')
    // one line; Forge strips control characters before typing
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
    if (!startsTask(item.kind)) throw new ModuleError('bad_request', 'only issues, requests and reviews start a task')
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
    const owner = (await owners())[target]
    if (item.account && owner && owner !== item.account) throw new ModuleError('bad_request', 'project belongs to another account')
    const account = item.account ?? owner
    await startSession(ctx, item, account ? { ...input, account } : input)
    return
  }
  if (item.kind !== 'research') throw new ModuleError('bad_request', 'only research items start a research session')
  const context = [item.quote, item.link].filter(Boolean).join(' ')
  const directory = await researchDirectory(ctx)
  await startSession(ctx, item, {
    ...(item.account ? { account: item.account } : {}),
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
async function runClaimed(ctx: ForgeContext, date: string, work: Item, op: Op, project?: string, rethrow = false, owners: Owners = noOwners): Promise<Item | undefined> {
  const key = claimKey(date, work.id)
  try {
    try {
      await perform(ctx, work, op, project, owners)
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
  const saved = await runClaimed(ctx, date, work, op, project, true, lazyOwners(ctx))
  if (!saved) throw new ModuleError('not_found', 'no such item')
  return saved
}

// accepts one item (with a picked project) or, without an id, every proposed item (of one account when given) that has what it needs
export async function acceptAll(ctx: ForgeContext, date: string, id?: string, project?: string, account?: string): Promise<Digest> {
  const claimed = await locked(async () => {
    const digest = await requireDigest(ctx, date)
    const items = id ? [requireOpen(digest.items.find(i => i.id === id))] : inAccount(digest.items, account).filter(i => i.state === 'proposed' && !inFlight.has(claimKey(date, i.id)))
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
  // projects are read once, and only when something starts
  const owners = lazyOwners(ctx)
  // each op runs outside the lock, so a slow send never holds up other actions
  for (const [n, { work, op }] of claimed.entries()) {
    try {
      await runClaimed(ctx, date, work, op, project, !!id, owners)
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

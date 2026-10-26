import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import * as pty from 'node-pty'
import { createRunner, type Runner } from './task-review.js'
import { envWithoutHost } from './cw-doctor.js'
import { findOnPath } from './cw-install.js'
import { stripAnsi, tailOutput } from './output.js'

export interface KiokuBrain {
  key: string
  name?: string
  tier?: string
  folder: string
  onDisk: boolean
  remote?: string
  personal: boolean
  pages: number
  kinds: Record<string, number>
  namespaces: string[]
  // the latest write in the activity window, null when it was quiet
  touched: string | null
}

export interface KiokuLink {
  name: string
  tier: string
}

export interface KiokuWrite {
  verb: string
  title: string
  path: string
  date: string
  author: string | null
  brain: string
}

export interface KiokuStatus {
  installed: boolean
  version: string | null
  brains: KiokuBrain[]
  // the chain a session in each CW project loads, personal first
  projects: Record<string, KiokuLink[]>
  activity: KiokuWrite[]
  viewer: string | null
}

// what the console's form calls a page, mapped to kioku's kind and subkind
const PAGE_TYPES: Record<string, { kind: string; sub?: string }> = {
  memory: { kind: 'memory' },
  instinct: { kind: 'memory', sub: 'instinct' },
  decision: { kind: 'knowledge', sub: 'decision' },
  playbook: { kind: 'knowledge', sub: 'playbook' },
  context: { kind: 'knowledge', sub: 'context' },
  rule: { kind: 'rule' },
}

export interface KiokuSaveInput {
  brain: string
  type: string
  title: string
  summary: string
  body: string
  namespace?: string
  // saves even when kioku finds similar pages
  create?: boolean
}

export type KiokuSaveResult =
  | { status: 'done'; brain: string; path: string; publication: string | null }
  | { status: 'similar'; similar: { brain: string; path: string; title: string; summary: string | null }[] }
  | { status: 'namespace'; namespaces: { namespace: string; summary: string | null }[] }

export interface KiokuBrainInput {
  // owner/repo, or host/owner/repo: the repository it gets once published
  repo: string
  tier: string
  // a project brain's team brain
  team?: string
  language?: string
}

export interface KiokuLinkInput {
  project: string
  brain?: string
  team?: string
}

export interface KiokuOptions {
  bin?: string
  run?: Runner
  // kioku page save, which commits and may push, so it gets longer than a read
  write?: Runner
  // the verbs kioku keeps for a person at a terminal
  terminal?: Runner
  startTimeoutMs?: number
  projects?: () => Record<string, { path: string }>
  now?: () => number
}

export class KiokuError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 502 = 502) {
    super(message)
  }
}

const NOT_INSTALLED = 'kioku is not installed on this machine'
const START_TIMEOUT_MS = 20_000
const WRITE_TIMEOUT_MS = 60_000
// publishing may make a GitHub repository and push every page
const PUBLISH_TIMEOUT_MS = 3 * 60_000
// brains change slowly and Refresh asks for a fresh reading, so a stale one is served while the next is read
const CACHE_MS = 5 * 60_000
const ACTIVITY_SINCE = '2w'
const ACTIVITY_LIMIT = 40
const PARALLEL = 6
const TIERS = ['personal', 'project', 'team']
// kioku's own forms; checked here too so no value reaches it as a flag
const REPO = /^[\w.-]+\/[\w.-]+(\/[\w.-]+)?$/
const AREA = /^[A-Za-z0-9][\w.-]*(\/[A-Za-z0-9][\w.-]*)*$/
const LANGUAGE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/

function assertRepo(repo: string, what: string): void {
  if (!REPO.test(repo)) throw new KiokuError(`${what} is named as owner/repo, not "${repo}"`, 400)
}

// what every kioku verb that writes may print
type Answer = { status?: string; error?: { message: string } }

type Snapshot = Omit<KiokuStatus, 'viewer'>
type ListedBrain = Omit<KiokuBrain, 'pages' | 'kinds' | 'touched'>

const MISSING: Snapshot = { installed: false, version: null, brains: [], projects: {}, activity: [] }

// install.sh puts the launcher in ~/.local/bin, which a Forge started from a GUI may not have on PATH
export function resolveKiokuBin(pathVar = process.env.PATH, home = homedir()): string {
  const fallback = join(home, '.local', 'bin', 'kioku')
  return findOnPath('kioku', pathVar) ?? (existsSync(fallback) ? fallback : 'kioku')
}

// what Forge types into an agent's terminal so it saves the note with its kioku skill
export function rememberPrompt(text: string): string {
  return `Remember this with kioku: ${text.replace(/\s+/g, ' ').trim()}`
}

// a PTY rather than pipes: kioku runs publish only when stdin and stdout are a terminal
export function createTerminalRunner(env: Record<string, string>, timeoutMs: number): Runner {
  return (bin, args, cwd) => new Promise((resolve) => {
    let proc: ReturnType<typeof pty.spawn>
    try {
      proc = pty.spawn(bin, args, { name: 'xterm-256color', cols: 400, rows: 40, cwd, env })
    } catch {
      return resolve({ code: 127, stdout: '', stderr: 'ENOENT' })
    }
    let output = ''
    const timer = setTimeout(() => proc.kill(), timeoutMs)
    proc.onData((data) => { output = (output + data).slice(-64 * 1024) })
    proc.onExit(({ exitCode }) => {
      clearTimeout(timer)
      // the terminal mixes in stderr and control characters, so the answer is the last line that reads as JSON
      const json = stripAnsi(output).split(/\r?\n/).reverse().map(line => line.slice(line.indexOf('{')).trim()).find(line => parseJson(line) !== null)
      resolve({ code: exitCode, stdout: json ?? '', stderr: output })
    })
  })
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

const brainName = (b: { name?: string; key: string }): string => b.name ?? b.key

// runs at most `limit` tasks at once, keeping the order of the inputs
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

interface Viewer {
  child: ChildProcess
  address: string
}

export class Kioku {
  private readonly run: Runner
  private readonly write: Runner
  private terminal: Runner | undefined
  private readonly startTimeoutMs: number
  private readonly projects: () => Record<string, { path: string }>
  private readonly now: () => number
  private binPath: string | undefined
  private viewer: Promise<Viewer> | null = null
  private snapshot: { at: number; value: Promise<Snapshot> } | null = null

  constructor(options: KiokuOptions = {}) {
    this.binPath = options.bin
    this.run = options.run ?? createRunner()
    this.write = options.write ?? createRunner(envWithoutHost(), WRITE_TIMEOUT_MS)
    this.terminal = options.terminal
    this.startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS
    this.projects = options.projects ?? (() => ({}))
    this.now = options.now ?? Date.now
  }

  // resolved on first use, so a Forge that never opens Memory does not search PATH
  private get bin(): string {
    return this.binPath ??= resolveKiokuBin()
  }

  async status(fresh = false): Promise<KiokuStatus> {
    const previous = this.snapshot
    if (fresh || !previous || this.now() - previous.at > CACHE_MS) {
      const value = this.read()
      this.snapshot = { at: this.now(), value }
      value.catch(() => { if (this.snapshot?.value === value) this.snapshot = previous })
    }
    // a stale reading answers at once unless a fresh one was asked for
    const pending = fresh || !previous ? this.snapshot!.value : previous.value
    const [snapshot, viewer] = await Promise.all([pending, this.viewer?.catch(() => null) ?? null])
    return { ...snapshot, viewer: viewer?.address ?? null }
  }

  private async json<T>(args: string[], cwd: string): Promise<T | null> {
    const result = await this.run(this.bin, [...args, '--json'], cwd)
    return result.code === 0 ? parseJson<T>(result.stdout) : null
  }

  private async read(): Promise<Snapshot> {
    const [version, list] = await Promise.all([
      this.run(this.bin, ['--version'], homedir()),
      this.json<{ brains?: ListedBrain[] }>(['brain', 'list'], homedir()),
    ])
    if (version.code !== 0) return MISSING
    const listed = list?.brains ?? []
    const entries = Object.entries(this.projects()).filter(([, p]) => existsSync(p.path))

    // kioku answers for the chain of the folder it runs in, so each brain is read from its own folder
    const readBrain = async (b: ListedBrain) => {
      if (!b.onDisk) return { kinds: {}, namespaces: [] as string[], writes: [] as KiokuWrite[] }
      const [ns, log] = await Promise.all([
        this.json<{ brains?: { brain: string; namespaces: { namespace: string; pages: Record<string, number> }[] }[] }>(['namespace', 'list', '--brain', b.key], b.folder),
        this.json<{ writes?: KiokuWrite[] }>(['brain', 'log', '--since', ACTIVITY_SINCE, '--brain', b.key], b.folder),
      ])
      const kinds: Record<string, number> = {}
      const namespaces = ns?.brains?.find(x => x.brain === brainName(b))?.namespaces ?? []
      for (const n of namespaces) {
        for (const [kind, count] of Object.entries(n.pages)) kinds[kind] = (kinds[kind] ?? 0) + count
      }
      return { kinds, namespaces: namespaces.map(n => n.namespace), writes: log?.writes ?? [] }
    }
    const readChain = async (path: string) =>
      (await this.json<{ chain?: { name: string; tier: string }[] }>(['brain', 'list'], path))?.chain ?? []
    const [perBrain, chains] = await Promise.all([
      mapLimit(listed, PARALLEL / 2, readBrain),
      mapLimit(entries, PARALLEL / 2, ([, p]) => readChain(p.path)),
    ])

    const activity = perBrain.flatMap(p => p.writes).sort((x, y) => y.date.localeCompare(x.date))
    const brains = listed.map((b, i): KiokuBrain => {
      const { kinds, namespaces } = perBrain[i]
      const name = brainName(b)
      return {
        ...b,
        pages: Object.values(kinds).reduce((sum, n) => sum + n, 0),
        kinds,
        namespaces,
        touched: activity.find(w => w.brain === name)?.date ?? null,
      }
    })

    const projects = Object.fromEntries(entries.map(([name], i) => [name, chains[i].map(({ name, tier }) => ({ name, tier }))]))

    return {
      installed: true,
      version: parseJson<{ version?: string }>(version.stdout)?.version ?? null,
      brains,
      projects,
      activity: activity.slice(0, ACTIVITY_LIMIT).map(({ verb, title, path, date, author, brain }) => ({ verb, title, path, date, author, brain })),
    }
  }

  // writes through kioku, which validates, commits and pushes a shared brain; Forge never writes a brain's files
  async save(input: KiokuSaveInput): Promise<KiokuSaveResult> {
    const type = PAGE_TYPES[input.type]
    if (!type) throw new KiokuError(`unknown page type ${input.type}`, 400)
    const brain = await this.findBrain(input.brain)
    const args = [
      'page', 'save', '--brain', brain.key, '--kind', type.kind, ...(type.sub ? ['--sub', type.sub] : []),
      '--title', input.title, '--summary', input.summary, '--source', 'Forge',
      ...(input.namespace ? ['--namespace', input.namespace] : []), ...(input.create ? ['--create'] : []), '--json',
    ]
    const { out, fail } = await this.invoke<{
      path?: string
      publication?: string | null
      similar?: { brain: string; path: string; title: string; summary: string | null }[]
      namespaces?: { namespace: string; summary: string | null }[]
    }>(args, brain.folder, this.write, input.body)
    if (out?.status === 'done' && out.path) {
      this.expire()
      return { status: 'done', brain: brainName(brain), path: out.path, publication: out.publication ?? null }
    }
    if (out?.status === 'similar') return { status: 'similar', similar: (out.similar ?? []).map(({ brain, path, title, summary }) => ({ brain, path, title, summary })) }
    if (out?.status === 'namespace') return { status: 'namespace', namespaces: (out.namespaces ?? []).map(({ namespace, summary }) => ({ namespace, summary })) }
    throw fail('kioku could not save the page')
  }

  // the cached reading when there is one, else only the list of brains
  private async listBrains(): Promise<ListedBrain[]> {
    return this.snapshot
      ? (await this.snapshot.value).brains
      : (await this.json<{ brains?: ListedBrain[] }>(['brain', 'list'], homedir()))?.brains ?? []
  }

  private async findBrain(key: string): Promise<ListedBrain> {
    const brain = (await this.listBrains()).find(b => b.key === key)
    if (!brain?.onDisk) throw new KiokuError(`no brain ${key} on this machine`, 404)
    return brain
  }

  // the next status reads again, while the old reading still answers a poll that is not fresh
  private expire(): void {
    if (this.snapshot) this.snapshot.at = -Infinity
  }

  // runs a verb that writes; fail turns kioku's refusal into a 400 with its message
  private async invoke<T>(args: string[], cwd: string, run: Runner, input?: string): Promise<{ out: (T & Answer) | null; ok: boolean; fail: (fallback: string) => KiokuError }> {
    const result = await run(this.bin, args, cwd, input)
    if (result.code === 127) throw new KiokuError(NOT_INSTALLED, 404)
    const out = parseJson<T & Answer>(result.stdout)
    return { out, ok: result.code === 0 && out !== null && !out.error, fail: (fallback) => new KiokuError(out?.error?.message ?? (tailOutput(result.stderr, 1) || fallback), 400) }
  }

  private async change<T>(args: string[], cwd: string, run = this.write): Promise<T> {
    const { out, ok, fail } = await this.invoke<T>([...args, '--json'], cwd, run)
    if (!ok || !out) throw fail(`kioku ${args.slice(0, 2).join(' ')} failed`)
    this.expire()
    return out
  }

  // makes a brain on this machine only; kioku never makes a repository here
  async createBrain(input: KiokuBrainInput): Promise<{ brain: string; name: string; path: string }> {
    assertRepo(input.repo, 'the brain')
    if (!TIERS.includes(input.tier)) throw new KiokuError(`the tier is one of ${TIERS.join(', ')}`, 400)
    if (input.team) assertRepo(input.team, 'the team brain')
    if (input.language && !LANGUAGE.test(input.language)) throw new KiokuError('the language is a tag such as en or es', 400)
    const args = [
      'brain', 'create', input.repo, '--tier', input.tier,
      ...(input.team && input.tier === 'project' ? ['--team', input.team] : []), ...(input.language ? ['--language', input.language] : []),
    ]
    const { brain, name, path } = await this.change<{ brain: string; name: string; path: string }>(args, homedir())
    return { brain, name, path }
  }

  async addArea(key: string, area: string, summary: string): Promise<{ brain: string; namespace: string }> {
    if (!AREA.test(area)) throw new KiokuError('an area is letters, digits, dots, dashes and underscores, with / between parts', 400)
    if (!summary) throw new KiokuError('say what the area is for', 400)
    const brain = await this.findBrain(key)
    const out = await this.change<{ brain: string; namespace: string }>(['namespace', 'add', area, `--summary=${summary}`, '--brain', brain.key], brain.folder)
    return { brain: out.brain, namespace: out.namespace }
  }

  // writes the project's kioku.yaml; a brain the machine does not know is made first, since kioku links only known brains without a terminal
  async linkProject(input: KiokuLinkInput): Promise<{ file: string; created: string[] }> {
    if (!input.brain && !input.team) throw new KiokuError('name a project brain, a team brain, or both', 400)
    const path = this.projects()[input.project]?.path
    if (!path || !existsSync(path)) throw new KiokuError(`no CW project ${input.project} on this machine`, 404)
    if (input.brain) assertRepo(input.brain, 'the project brain')
    if (input.team) assertRepo(input.team, 'the team brain')
    const known = await this.listBrains()
    // a key is host/owner/repo, and owner/repo names it on any host
    const isKnown = (repo: string) => known.some(b => b.key === repo || b.key.endsWith(`/${repo}`))
    const created: string[] = []
    if (input.team && !isKnown(input.team)) created.push((await this.createBrain({ repo: input.team, tier: 'team' })).brain)
    if (input.brain && !isKnown(input.brain)) created.push((await this.createBrain({ repo: input.brain, tier: 'project', team: input.team })).brain)
    const args = ['init', ...(input.brain ? [input.brain] : []), ...(input.team ? ['--team', input.team] : [])]
    const { file } = await this.change<{ file: string }>(args, path)
    return { file, created }
  }

  // the only verb that reaches a git host: without `to`, kioku makes a private GitHub repository with gh
  async publish(key: string, to?: string): Promise<{ brain: string; status: string; remote: string | null }> {
    if (to?.startsWith('-')) throw new KiokuError('the address cannot start with -', 400)
    const brain = await this.findBrain(key)
    if (brain.remote) throw new KiokuError(`${brainName(brain)} already has a repository: ${brain.remote}`, 400)
    const out = await this.change<{ brain: string; status: string; remote?: string }>(['brain', 'publish', brain.key, ...(to ? ['--to', to] : [])], brain.folder, this.terminal ??= createTerminalRunner(envWithoutHost(), PUBLISH_TIMEOUT_MS))
    return { brain: out.brain, status: out.status, remote: out.remote ?? null }
  }

  // one viewer at a time; a second call reuses the running one
  async openViewer(): Promise<string> {
    this.viewer ??= this.startViewer()
    return (await this.viewer).address
  }

  private startViewer(): Promise<Viewer> {
    const started = new Promise<Viewer>((resolve, reject) => {
      const child = spawn(this.bin, ['web', '--json', '--no-open'], { cwd: homedir(), stdio: ['ignore', 'pipe', 'pipe'] })
      const lines = createInterface({ input: child.stdout! })
      let stderr = ''
      let settled = false
      const finish = () => {
        settled = true
        clearTimeout(timer)
        lines.close()
        child.stdout?.resume()
      }
      const fail = (err: KiokuError) => {
        if (settled) return
        finish()
        child.kill()
        reject(err)
      }
      const timer = setTimeout(() => fail(new KiokuError('kioku web did not start in time')), this.startTimeoutMs)
      child.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4096) })
      lines.on('line', (line) => {
        const event = parseJson<{ event?: string; address?: string }>(line)
        if (settled || event?.event !== 'listening' || !event.address?.startsWith('http://127.0.0.1:')) return
        finish()
        resolve({ child, address: event.address })
      })
      child.on('error', (err: NodeJS.ErrnoException) => {
        const missing = err.code === 'ENOENT'
        fail(new KiokuError(missing ? NOT_INSTALLED : err.message, missing ? 404 : 502))
      })
      // close, not exit: exit can fire before stderr is read, losing kioku's reason
      child.on('close', (code) => {
        if (this.viewer === started) this.viewer = null
        fail(new KiokuError(tailOutput(stderr, 1) || `kioku web exited with code ${code}`))
      })
    })
    started.catch(() => { if (this.viewer === started) this.viewer = null })
    return started
  }

  stopViewer(): void {
    void this.viewer?.then(v => v.child.kill(), () => {})
    this.viewer = null
  }

  dispose(): void {
    this.stopViewer()
  }
}

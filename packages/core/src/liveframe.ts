import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRunner, type Runner, type RunResult } from './task-review.js'
import { stripAnsi, tailOutput } from './output.js'

export interface LiveframeFrame {
  project: string
  frame: string
  dir: string
  key: string
  kind: string
  branch: string
  url: string
}

export interface LiveframeStatus {
  account: string
  installed: boolean
  signedIn: boolean
  api: string
  root: string
}

export interface LiveframeOptions {
  account?: string
  root?: string
  home?: string
  run?: Runner
}

export class LiveframeError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 502 = 502) {
    super(message)
  }
}

const DEFAULT_API = 'https://liveframe.monokulabs.com'
// Liveframe belongs to Monoku, so its agents run on that CW account
const DEFAULT_ACCOUNT = 'monoku'
const INSTALL_HINT = `The Liveframe CLI is not installed. Install it with: npm i -g ${DEFAULT_API}/cli.tgz`
const LF_TIMEOUT_MS = 5 * 60 * 1000
const FRAME_URL_RE = /https?:\/\/\S+\/f\/\S+/
const SEGMENT_RE = /^[a-z0-9][a-z0-9-]*$/

// same rules as lf's own slugify, so folders match Liveframe's slugs
export function slugify(name: string): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return slug || 'untitled'
}

const isFrameSegment = (value: string): boolean => SEGMENT_RE.test(value)

function failureMessage(result: RunResult): string {
  if (result.code === 127) return INSTALL_HINT
  const lastLine = tailOutput(result.stderr, 1) || tailOutput(result.stdout, 1)
  return lastLine.replace(/^✗\s*/, '').trim() || `lf exited with code ${result.code}`
}

// lf push prints the frame's latest URL first, then the pinned version
export function parseFrameUrl(stdout: string): string | null {
  return FRAME_URL_RE.exec(stripAnsi(stdout))?.[0] ?? null
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export class Liveframe {
  readonly account: string
  readonly root: string
  private readonly home: string
  private readonly run: Runner
  private readonly busy = new Set<string>()

  constructor(options: LiveframeOptions = {}) {
    this.account = options.account ?? process.env.FORGE_LIVEFRAME_ACCOUNT ?? DEFAULT_ACCOUNT
    this.root = options.root ?? join(homedir(), 'liveframe')
    this.home = options.home ?? process.env.LIVEFRAME_HOME ?? join(homedir(), '.liveframe')
    this.run = options.run ?? createRunner(undefined, LF_TIMEOUT_MS)
  }

  // reads only the API base and whether a credential exists, never the credential itself
  private config(): { api: string; signedIn: boolean } {
    const file = readJson(join(this.home, 'config.json')) ?? {}
    const api = process.env.LIVEFRAME_API ?? (typeof file.api === 'string' ? file.api : DEFAULT_API)
    return { api: api.replace(/\/+$/, ''), signedIn: Boolean(process.env.LIVEFRAME_TOKEN || file.oauth || file.token) }
  }

  async status(): Promise<LiveframeStatus> {
    const { api, signedIn } = this.config()
    const version = await this.run('lf', ['--version'], homedir())
    return { account: this.account, installed: version.code === 0, signedIn, api, root: this.root }
  }

  private frameDir(project: string, frame: string): string {
    return join(this.root, project, frame)
  }

  private readFrame(project: string, frame: string, api: string): LiveframeFrame | null {
    const dir = this.frameDir(project, frame)
    const json = readJson(join(dir, 'liveframe.json'))
    if (!json || typeof json.key !== 'string') return null
    const branch = typeof json.branch === 'string' ? json.branch : 'main'
    return {
      project,
      frame,
      dir,
      key: json.key,
      kind: typeof json.kind === 'string' ? json.kind : 'view',
      branch,
      url: `${api}/f/${json.key}/${branch === 'main' ? '' : `${branch}/`}`,
    }
  }

  private getFrame(project: string, frame: string): LiveframeFrame | null {
    if (!isFrameSegment(project) || !isFrameSegment(frame)) return null
    return this.readFrame(project, frame, this.config().api)
  }

  listFrames(): LiveframeFrame[] {
    if (!existsSync(this.root)) return []
    const { api } = this.config()
    const frames: LiveframeFrame[] = []
    for (const project of readdirSync(this.root, { withFileTypes: true })) {
      if (!project.isDirectory() || !isFrameSegment(project.name)) continue
      for (const frame of readdirSync(join(this.root, project.name), { withFileTypes: true })) {
        if (!frame.isDirectory() || !isFrameSegment(frame.name)) continue
        const found = this.readFrame(project.name, frame.name, api)
        if (found) frames.push(found)
      }
    }
    return frames
  }

  private async lf(args: string[], cwd: string): Promise<RunResult> {
    const result = await this.run('lf', args, cwd)
    if (result.code !== 0) throw new LiveframeError(failureMessage(result))
    return result
  }

  // one lf command per frame folder at a time
  private async exclusive<T>(project: string, frame: string, work: () => Promise<T>): Promise<T> {
    const key = `${project}/${frame}`
    if (this.busy.has(key)) throw new LiveframeError(`${key} is busy with another lf command`, 409)
    this.busy.add(key)
    try {
      return await work()
    } finally {
      this.busy.delete(key)
    }
  }

  // runs lf into a fresh frame folder, removing whatever it left if it fails
  private intoNewDir(project: string, frame: string, args: (dir: string) => string[]): Promise<LiveframeFrame> {
    return this.exclusive(project, frame, async () => {
      const projectDir = join(this.root, project)
      const dir = this.frameDir(project, frame)
      if (existsSync(dir)) throw new LiveframeError(`${project}/${frame} already exists in ${this.root}`, 409)
      await mkdir(projectDir, { recursive: true })
      try {
        await this.lf(args(dir), this.root)
      } catch (err) {
        await rm(dir, { recursive: true, force: true })
        if (readdirSync(projectDir).length === 0) await rm(projectDir, { recursive: true, force: true })
        throw err
      }
      const found = this.getFrame(project, frame)
      if (!found) throw new LiveframeError(`lf finished but ${dir} has no liveframe.json`)
      return found
    })
  }

  async createFrame(projectName: string, frameName: string): Promise<LiveframeFrame> {
    return this.intoNewDir(slugify(projectName), slugify(frameName), dir => ['new', frameName, '--project', projectName, '--kind', 'view', '--dir', dir, '--yes'])
  }

  async pullFrame(project: string, frame: string): Promise<LiveframeFrame> {
    if (!isFrameSegment(project) || !isFrameSegment(frame)) throw new LiveframeError('Use project/frame slugs, for example reservas/checkout-flow', 400)
    return this.intoNewDir(project, frame, dir => ['pull', `${project}/${frame}`, dir])
  }

  async pushFrame(project: string, frame: string, note?: string): Promise<string> {
    const found = this.getFrame(project, frame)
    if (!found) throw new LiveframeError(`No frame ${project}/${frame} in ${this.root}`, 404)
    const result = await this.exclusive(project, frame, () => this.lf(['push', ...(note ? ['-m', note] : [])], found.dir))
    const url = parseFrameUrl(result.stdout)
    if (!url) throw new LiveframeError('lf push finished without a frame URL')
    return url
  }
}

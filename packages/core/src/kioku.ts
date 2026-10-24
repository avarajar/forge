import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createRunner, type Runner } from './task-review.js'
import { findOnPath } from './cw-install.js'
import { tailOutput } from './output.js'

export interface KiokuBrain {
  key: string
  name?: string
  tier?: string
  folder: string
  onDisk: boolean
  remote?: string
  personal: boolean
}

export interface KiokuStatus {
  installed: boolean
  version: string | null
  brains: KiokuBrain[]
  viewer: string | null
}

export interface KiokuOptions {
  bin?: string
  run?: Runner
  startTimeoutMs?: number
}

export class KiokuError extends Error {
  constructor(message: string, readonly status: 404 | 502 = 502) {
    super(message)
  }
}

const NOT_INSTALLED = 'kioku is not installed on this machine'
const START_TIMEOUT_MS = 20_000

// install.sh puts the launcher in ~/.local/bin, which a Forge started from a GUI may not have on PATH
export function resolveKiokuBin(pathVar = process.env.PATH, home = homedir()): string {
  const fallback = join(home, '.local', 'bin', 'kioku')
  return findOnPath('kioku', pathVar) ?? (existsSync(fallback) ? fallback : 'kioku')
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

interface Viewer {
  child: ChildProcess
  address: string
}

export class Kioku {
  private readonly run: Runner
  private readonly startTimeoutMs: number
  private binPath: string | undefined
  private viewer: Promise<Viewer> | null = null

  constructor(options: KiokuOptions = {}) {
    this.binPath = options.bin
    this.run = options.run ?? createRunner()
    this.startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS
  }

  // resolved on first use, so a Forge that never opens Memory does not search PATH
  private get bin(): string {
    return this.binPath ??= resolveKiokuBin()
  }

  async status(): Promise<KiokuStatus> {
    const [version, list, viewer] = await Promise.all([
      this.run(this.bin, ['--version'], homedir()),
      this.run(this.bin, ['brain', 'list', '--json'], homedir()),
      this.viewer?.catch(() => null) ?? null,
    ])
    if (version.code !== 0) return { installed: false, version: null, brains: [], viewer: null }
    return {
      installed: true,
      version: parseJson<{ version?: string }>(version.stdout)?.version ?? null,
      brains: parseJson<{ brains?: KiokuBrain[] }>(list.stdout)?.brains ?? [],
      viewer: viewer?.address ?? null,
    }
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
      child.on('exit', (code) => {
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

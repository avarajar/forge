import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox, SandboxConfig, SandboxInput, SandboxState } from './sandbox-types.js'

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000      // 10 minutes
const IDLE_THRESHOLD_MS = 2 * 60 * 60 * 1000     // 2 hours
const ARCHIVE_TTL_MS = 24 * 60 * 60 * 1000       // 24 hours
const DEV_SERVER_TIMEOUT_MS = 30 * 1000           // 30 seconds

interface ManagedSandbox extends Sandbox {
  process: ChildProcess | null
}

function toPublic(s: ManagedSandbox): Sandbox {
  const { process: _proc, ...sandbox } = s
  return sandbox
}

export class SandboxManager {
  private sandboxes = new Map<string, ManagedSandbox>()
  private usedPorts = new Set<number>()
  private nextPort: number
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private config: SandboxConfig

  constructor(config: SandboxConfig) {
    this.config = config
    this.nextPort = config.portRangeStart

    if (!existsSync(config.sandboxBaseDir)) {
      mkdirSync(config.sandboxBaseDir, { recursive: true })
    }

    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  private allocatePort(): number {
    let port = this.nextPort
    while (this.usedPorts.has(port)) {
      port++
    }
    this.usedPorts.add(port)
    this.nextPort = port + 1
    return port
  }

  private releasePort(port: number): void {
    this.usedPorts.delete(port)
  }

  create(options: { name: string; projectId?: string; input: SandboxInput }): Sandbox {
    const id = randomUUID().slice(0, 8)
    const port = this.allocatePort()
    const dir = join(this.config.sandboxBaseDir, `forge-proto-${id}`)
    const now = new Date().toISOString()

    // Copy template directory to sandbox directory
    cpSync(this.config.templateDir, dir, { recursive: true })

    const managed: ManagedSandbox = {
      id,
      projectId: options.projectId ?? null,
      name: options.name,
      state: 'creating',
      port,
      dir,
      input: options.input,
      createdAt: now,
      updatedAt: now,
      prUrl: null,
      previewUrl: null,
      branch: null,
      process: null,
    }

    this.sandboxes.set(id, managed)
    return toPublic(managed)
  }

  async startDevServer(id: string): Promise<boolean> {
    const sandbox = this.sandboxes.get(id)
    if (!sandbox || sandbox.port === null) return false

    // Install dependencies first
    try {
      const { execSync } = await import('node:child_process')
      execSync('npm install --prefer-offline --no-audit --no-fund', {
        cwd: sandbox.dir,
        stdio: 'pipe',
        timeout: 60000,
      })
    } catch {
      return false
    }

    return new Promise<boolean>((resolve) => {
      const child = spawn('npx', ['vite', '--port', String(sandbox.port), '--host', '127.0.0.1', '--strictPort'], {
        cwd: sandbox.dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      sandbox.process = child

      const timeout = setTimeout(() => {
        resolve(false)
      }, DEV_SERVER_TIMEOUT_MS)

      const onData = (data: Buffer) => {
        const text = data.toString()
        if (text.includes('Local:') || text.includes('ready in')) {
          clearTimeout(timeout)
          sandbox.state = 'ready'
          sandbox.updatedAt = new Date().toISOString()
          resolve(true)
        }
      }

      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)

      child.on('error', () => {
        clearTimeout(timeout)
        resolve(false)
      })

      child.on('exit', () => {
        sandbox.process = null
      })
    })
  }

  stopDevServer(id: string): void {
    const sandbox = this.sandboxes.get(id)
    if (!sandbox?.process) return

    try {
      sandbox.process.kill()
    } catch { /* best effort */ }
    sandbox.process = null
  }

  updateState(id: string, state: SandboxState): void {
    const sandbox = this.sandboxes.get(id)
    if (!sandbox) return
    sandbox.state = state
    sandbox.updatedAt = new Date().toISOString()
  }

  updatePR(id: string, prUrl: string, previewUrl: string, branch: string): void {
    const sandbox = this.sandboxes.get(id)
    if (!sandbox) return
    sandbox.prUrl = prUrl
    sandbox.previewUrl = previewUrl
    sandbox.branch = branch
    sandbox.state = 'shared'
    sandbox.updatedAt = new Date().toISOString()
  }

  get(id: string): Sandbox | undefined {
    const sandbox = this.sandboxes.get(id)
    if (!sandbox) return undefined
    return toPublic(sandbox)
  }

  list(): Sandbox[] {
    const result: Sandbox[] = []
    for (const sandbox of this.sandboxes.values()) {
      if (sandbox.state !== 'deleted') {
        result.push(toPublic(sandbox))
      }
    }
    return result
  }

  archive(id: string): void {
    this.stopDevServer(id)
    this.updateState(id, 'archived')
  }

  remove(id: string): void {
    const sandbox = this.sandboxes.get(id)
    if (!sandbox) return

    this.stopDevServer(id)

    if (sandbox.port !== null) {
      this.releasePort(sandbox.port)
    }

    if (existsSync(sandbox.dir)) {
      rmSync(sandbox.dir, { recursive: true, force: true })
    }

    this.sandboxes.delete(id)
  }

  cleanup(): void {
    const now = Date.now()

    for (const [id, sandbox] of this.sandboxes) {
      const updatedAt = new Date(sandbox.updatedAt).getTime()

      // Archive live sandboxes idle > 2 hours
      if (sandbox.state === 'live' && now - updatedAt > IDLE_THRESHOLD_MS) {
        this.archive(id)
      }

      // Delete archived sandboxes > 24 hours old
      if (sandbox.state === 'archived' && now - updatedAt > ARCHIVE_TTL_MS) {
        this.remove(id)
      }
    }
  }

  injectProjectContext(id: string, projectPath: string): { tailwind: boolean; tokens: boolean; shadcn: boolean } {
    const sandbox = this.sandboxes.get(id)
    if (!sandbox) return { tailwind: false, tokens: false, shadcn: false }

    // Tailwind: check for config files and copy to sandbox
    const tailwindFiles = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs']
    let tailwind = false
    for (const file of tailwindFiles) {
      const src = join(projectPath, file)
      if (existsSync(src)) {
        cpSync(src, join(sandbox.dir, 'tailwind.config.project.ts'))
        tailwind = true
        break
      }
    }

    // Tokens: check for token directories and copy recursively
    const tokenDirs = ['tokens', 'src/tokens', 'src/design-tokens']
    let tokens = false
    for (const dir of tokenDirs) {
      const src = join(projectPath, dir)
      if (existsSync(src)) {
        cpSync(src, join(sandbox.dir, 'tokens'), { recursive: true })
        tokens = true
        break
      }
    }

    // shadcn: check for components.json and copy to sandbox
    const shadcnSrc = join(projectPath, 'components.json')
    let shadcn = false
    if (existsSync(shadcnSrc)) {
      cpSync(shadcnSrc, join(sandbox.dir, 'components.json'))
      shadcn = true
    }

    return { tailwind, tokens, shadcn }
  }

  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    for (const id of this.sandboxes.keys()) {
      this.stopDevServer(id)
    }
  }
}

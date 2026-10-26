import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ForgeContext, ModuleManifestV1, ModuleServer, ModuleSettings, ModuleSource, ModuleStatus, ShellExecutor } from '@forge-dev/sdk'
import { checkManifest, validateSettings, type SettingsResult } from './module-manifest.js'
import { expandGrants, type Grants } from './module-permissions.js'
import { createForgeContext, type ContextDeps } from './module-context.js'
import { BUNDLED_MODULES } from './modules.js'

export const RESERVED_SEGMENTS = new Set(['settings', 'actions', 'view.js', 'status', 'notifications', 'reload'])

export interface HostHooks {
  loaded?(mod: LoadedModule): void
  unloading?(mod: LoadedModule): void
  settingsChanged?(mod: LoadedModule): void
}

export interface HostOptions {
  modulesDir: string
  bundledDir?: string
  forgeNodeModules?: string
  devFile: string
  localOnly: boolean
  deps: ContextDeps
  hooks?: HostHooks
}

export interface LoadedModule {
  status: ModuleStatus
  dir: string
  manifest: ModuleManifestV1
  server?: ModuleServer
  ctx: ForgeContext
  abort: AbortController
  grants: Grants
}

interface Candidate { dir: string; source: ModuleSource; manifestFile: string; packaged: boolean }

export class ModuleHost {
  private statuses: ModuleStatus[] = []
  private loaded = new Map<string, LoadedModule>()
  private listeners = new Set<(id: string) => void>()

  constructor(private readonly opts: HostOptions) {}

  list(): ModuleStatus[] {
    return this.statuses
  }

  get(id: string): LoadedModule | undefined {
    return this.loaded.get(id)
  }

  onChange(listener: (id: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async scan(): Promise<ModuleStatus[]> {
    for (const id of [...this.loaded.keys()]) this.unload(id)
    const statuses: ModuleStatus[] = []
    const seen = new Map<string, string>()
    for (const candidate of this.candidates()) {
      const status = await this.loadCandidate(candidate, seen)
      if (status) statuses.push(status)
    }
    this.statuses = statuses
    return statuses
  }

  async reload(id: string): Promise<void> {
    await this.scan()
    this.emit(id)
  }

  async addDev(path: string): Promise<ModuleStatus | undefined> {
    const dirs = this.devDirs()
    const dir = resolve(path)
    if (!dirs.includes(dir)) writeFileSync(this.opts.devFile, JSON.stringify([...dirs, dir], null, 2))
    await this.scan()
    return this.statuses.find(s => this.loaded.get(s.id)?.dir === dir) ?? this.statuses.find(s => s.state !== 'enabled' && s.id === basename(dir))
  }

  async removeDev(path: string): Promise<void> {
    const dir = resolve(path)
    writeFileSync(this.opts.devFile, JSON.stringify(this.devDirs().filter(d => d !== dir), null, 2))
    await this.scan()
  }

  settings(id: string): ModuleSettings {
    const mod = this.loaded.get(id)
    return mod ? this.readSettings(mod.manifest) : {}
  }

  saveSettings(id: string, values: unknown): { ok: true } | Extract<SettingsResult, { ok: false }> {
    const mod = this.loaded.get(id)
    if (!mod) return { ok: false, errors: [{ path: '', message: 'module not loaded' }] }
    const result = validateSettings(mod.manifest.settings?.schema ?? {}, values)
    if (!result.ok) return result
    for (const [key, value] of Object.entries(result.value)) this.opts.deps.db.setModuleSetting(id, key, JSON.stringify(value))
    mod.grants = expandGrants(mod.manifest.permissions, result.value)
    this.opts.hooks?.settingsChanged?.(mod)
    this.emit(id)
    return { ok: true }
  }

  async close(): Promise<void> {
    for (const id of [...this.loaded.keys()]) this.unload(id)
  }

  private emit(id: string): void {
    for (const listener of this.listeners) listener(id)
  }

  private unload(id: string): void {
    const mod = this.loaded.get(id)
    if (!mod) return
    this.opts.hooks?.unloading?.(mod)
    mod.abort.abort()
    this.loaded.delete(id)
  }

  private devDirs(): string[] {
    try {
      const raw = JSON.parse(readFileSync(this.opts.devFile, 'utf-8'))
      return Array.isArray(raw) ? raw.filter((d): d is string => typeof d === 'string') : []
    } catch {
      return []
    }
  }

  private candidates(): Candidate[] {
    const out: Candidate[] = []
    const folder = (dir: string, source: ModuleSource) => out.push({ dir, source, manifestFile: join(dir, 'forge-module.json'), packaged: false })
    if (this.opts.bundledDir) for (const name of BUNDLED_MODULES) folder(join(this.opts.bundledDir, name), 'bundled')
    for (const dir of this.devDirs()) folder(dir, 'dev')
    if (existsSync(this.opts.modulesDir)) {
      for (const entry of readdirSync(this.opts.modulesDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) folder(join(this.opts.modulesDir, entry.name), 'installed')
      }
      out.push(...packages(join(this.opts.modulesDir, 'node_modules'), 'node_modules', true))
    }
    if (this.opts.forgeNodeModules) out.push(...packages(this.opts.forgeNodeModules, 'node_modules', false))
    return out
  }

  private async loadCandidate(c: Candidate, seen: Map<string, string>): Promise<ModuleStatus | undefined> {
    const fallbackId = basename(c.dir)
    if (!existsSync(c.manifestFile)) {
      return c.packaged ? disabled(fallbackId, c, `no manifest at ${c.manifestFile}`) : undefined
    }

    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(c.manifestFile, 'utf-8'))
    } catch (err) {
      return disabled(fallbackId, c, `forge-module.json is not valid JSON: ${(err as Error).message}`)
    }

    const check = checkManifest(raw, c.dir)
    const named = raw as { id?: unknown; name?: unknown; version?: unknown; displayName?: unknown }
    const id = typeof named.id === 'string' && named.id ? named.id : fallbackId
    if (check.kind === 'invalid') return disabled(id, c, check.reason, named)
    if (check.kind === 'legacy') {
      return { id: fallbackId, name: check.manifest.name, version: check.manifest.version, displayName: check.manifest.displayName, source: c.source, state: 'legacy', icon: check.manifest.icon, color: check.manifest.color }
    }

    const m = check.manifest
    const firstFrom = seen.get(m.id)
    if (firstFrom) return disabled(m.id, c, `duplicate id, already loaded from ${firstFrom}`, m)
    seen.set(m.id, c.dir)

    if (!this.opts.localOnly && (m.server || m.view)) return disabled(m.id, c, 'modules run only in local mode', m)

    let server: ModuleServer | undefined
    if (m.server) {
      const file = resolve(c.dir, m.server)
      try {
        const imported = await import(`${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`)
        server = imported.default
      } catch (err) {
        return disabled(m.id, c, `server failed to load: ${(err as Error).message}`, m)
      }
      const problem = checkServer(server, m)
      if (problem) return disabled(m.id, c, problem, m)
    }

    const status: ModuleStatus = {
      id: m.id, name: m.name, version: m.version, displayName: m.displayName, source: c.source, state: 'enabled',
      icon: m.icon, color: m.color, settingsSchema: m.settings?.schema, permissions: m.permissions,
      actions: server?.actions?.map(a => ({ id: a.id, label: a.label, effect: a.effect })),
    }
    if (m.view) {
      const entry = resolve(c.dir, m.view.entry)
      const mtime = existsSync(entry) ? Math.floor(statSync(entry).mtimeMs) : 0
      status.view = { url: `/api/modules/${m.id}/view.js`, title: m.view.title ?? m.displayName, version: `${m.version}-${mtime}` }
    }

    const settings = this.readSettings(m)
    const abort = new AbortController()
    const mod: LoadedModule = { status, dir: c.dir, manifest: m, server, abort, grants: expandGrants(m.permissions, settings), ctx: undefined as unknown as ForgeContext }
    mod.ctx = createForgeContext(
      this.opts.deps,
      { id: m.id, version: m.version },
      () => this.readSettings(m),
      () => mod.grants,
      (permission, value) => { status.lastDenial = { permission, value, at: new Date().toISOString() } },
    )
    this.loaded.set(m.id, mod)
    this.opts.hooks?.loaded?.(mod)
    return status
  }

  // stored values are JSON per key; anything unreadable falls back to the schema defaults
  private readSettings(m: ModuleManifestV1): ModuleSettings {
    const schema = m.settings?.schema ?? {}
    const stored: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(this.opts.deps.db.getModuleSettings(m.id))) {
      try { stored[key] = JSON.parse(value) } catch { /* ignored, default applies */ }
    }
    const result = validateSettings(schema, stored)
    if (result.ok) return result.value
    const defaults = validateSettings(schema, {})
    return defaults.ok ? defaults.value : {}
  }
}

function disabled(id: string, c: Candidate, reason: string, m?: { name?: unknown; version?: unknown; displayName?: unknown }): ModuleStatus {
  const text = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback)
  return { id, name: text(m?.name, id), version: text(m?.version, ''), displayName: text(m?.displayName, id), source: c.source, state: 'disabled', reason }
}

function packages(root: string, source: ModuleSource, packaged: boolean): Candidate[] {
  if (!existsSync(root)) return []
  const out: Candidate[] = []
  const consider = (dir: string, name: string) => {
    const pkgFile = join(dir, 'package.json')
    let forge: { manifest?: unknown } | undefined
    try {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf-8')) as { forge?: { manifest?: unknown } }
      forge = pkg.forge
    } catch {
      return
    }
    if (!forge && !/^@forge-dev\/mod-/.test(name)) return
    const manifest = typeof forge?.manifest === 'string' ? forge.manifest : 'forge-module.json'
    out.push({ dir, source, manifestFile: join(dir, manifest), packaged: packaged && Boolean(forge) })
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      for (const sub of readdirSync(join(root, entry.name), { withFileTypes: true })) {
        if (sub.isDirectory()) consider(join(root, entry.name, sub.name), `${entry.name}/${sub.name}`)
      }
    } else {
      consider(join(root, entry.name), entry.name)
    }
  }
  return out
}

function isShell(run: unknown): run is ShellExecutor {
  return typeof run === 'object' && run !== null && (run as ShellExecutor).kind === 'shell'
}

function checkServer(server: unknown, m: ModuleManifestV1): string | null {
  if (typeof server !== 'object' || server === null) return 'server.js must default-export defineModule({...})'
  const s = server as ModuleServer
  for (const key of ['routes', 'actions', 'jobs', 'events', 'detectors'] as const) {
    if (s[key] !== undefined && !Array.isArray(s[key])) return `server ${key} must be a list`
  }
  const dupes = (kind: string, ids: string[]) => {
    const d = ids.find((id, i) => ids.indexOf(id) !== i)
    return d ? `duplicate ${kind} ${d}` : null
  }
  const shellDeclared = (m.permissions?.shell?.length ?? 0) > 0
  for (const action of s.actions ?? []) {
    if (isShell(action.run) && !shellDeclared) return `action ${action.id} uses shell but the manifest does not declare it`
    if (action.effect === 'external' && typeof action.confirm !== 'function') return `action ${action.id} is external but has no confirm`
  }
  for (const route of s.routes ?? []) {
    const first = route.path.split('/').filter(Boolean)[0] ?? ''
    if (RESERVED_SEGMENTS.has(first)) return `route ${route.path} uses a reserved segment`
  }
  return dupes('action', (s.actions ?? []).map(a => a.id))
    ?? dupes('route', (s.routes ?? []).map(r => `${r.method} ${r.path}`))
    ?? dupes('job', (s.jobs ?? []).map(j => j.id))
}

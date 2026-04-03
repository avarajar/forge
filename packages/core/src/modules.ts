import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ModuleManifest, ActionDef } from '@forge-dev/sdk'

export class ModuleLoader {
  private modulesDir: string
  private loaded = new Map<string, ModuleManifest>()

  constructor(modulesDir: string) {
    this.modulesDir = modulesDir
  }

  discover(): ModuleManifest[] {
    this.loaded.clear()
    if (!existsSync(this.modulesDir)) return []

    const entries = readdirSync(this.modulesDir, { withFileTypes: true })
    const manifests: ModuleManifest[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifest = this.load(entry.name)
      if (manifest) manifests.push(manifest)
    }

    return manifests
  }

  load(dirName: string): ModuleManifest | undefined {
    const manifestPath = join(this.modulesDir, dirName, 'forge-module.json')
    if (!existsSync(manifestPath)) return undefined

    try {
      const raw = readFileSync(manifestPath, 'utf-8')
      const manifest: ModuleManifest = JSON.parse(raw)
      this.loaded.set(dirName, manifest)
      return manifest
    } catch {
      return undefined
    }
  }

  getAction(moduleDirName: string, actionId: string): ActionDef | undefined {
    const manifest = this.loaded.get(moduleDirName)
    if (!manifest) return undefined
    return manifest.actions.find(a => a.id === actionId)
  }

  getLoaded(): ReadonlyMap<string, ModuleManifest> {
    return this.loaded
  }

  getLoadedCount(): number {
    return this.loaded.size
  }
}

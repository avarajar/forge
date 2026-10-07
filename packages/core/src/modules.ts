import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ModuleManifest, ActionDef } from '@forge-dev/sdk'

// módulos que viajan con Forge porque la consola los usa (la vista QA llama a mod-qa)
export const BUNDLED_MODULES = ['mod-qa']

export class ModuleLoader {
  private modulesDir: string
  private bundledDir: string | undefined
  private loaded = new Map<string, ModuleManifest>()

  constructor(modulesDir: string, bundledDir?: string) {
    this.modulesDir = modulesDir
    this.bundledDir = bundledDir
  }

  discover(): ModuleManifest[] {
    this.loaded.clear()
    const manifests: ModuleManifest[] = []

    // el incluido gana sobre uno instalado con el mismo nombre: la consola se compiló contra él
    const bundled = new Set<string>()
    if (this.bundledDir) {
      for (const name of BUNDLED_MODULES) {
        const manifest = this.loadFrom(this.bundledDir, name)
        if (!manifest) continue
        bundled.add(name)
        manifests.push(manifest)
      }
    }

    if (!existsSync(this.modulesDir)) return manifests

    for (const entry of readdirSync(this.modulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || bundled.has(entry.name)) continue
      const manifest = this.load(entry.name)
      if (manifest) manifests.push(manifest)
    }

    return manifests
  }

  load(dirName: string): ModuleManifest | undefined {
    return this.loadFrom(this.modulesDir, dirName)
  }

  private loadFrom(dir: string, dirName: string): ModuleManifest | undefined {
    const manifestPath = join(dir, dirName, 'forge-module.json')
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

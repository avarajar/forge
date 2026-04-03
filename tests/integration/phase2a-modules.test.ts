import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-phase2a')
const MODULES_DIR = join(TEST_DIR, 'modules')
const MODULE_NAMES = ['mod-qa', 'mod-design', 'mod-release']

describe('Phase 2a: All ecosystem modules', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    for (const mod of MODULE_NAMES) {
      const src = join(import.meta.dirname, '../../modules', mod, 'forge-module.json')
      if (existsSync(src)) {
        const dest = join(MODULES_DIR, mod)
        mkdirSync(dest, { recursive: true })
        cpSync(src, join(dest, 'forge-module.json'))
      }
    }
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => { server.close(); rmSync(TEST_DIR, { recursive: true, force: true }) })

  it('discovers all 3 Phase 2a modules', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string }[]
    const names = modules.map(m => m.name)
    expect(names).toContain('@forge-dev/mod-qa')
    expect(names).toContain('@forge-dev/mod-design')
    expect(names).toContain('@forge-dev/mod-release')
  })

  it('total panels across 3 modules is 13', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { panels: { id: string }[] }[]
    const totalPanels = modules.reduce((sum, m) => sum + m.panels.length, 0)
    expect(totalPanels).toBe(13)
  })

  it('each module has detectors defined', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; detectors?: { tool: string }[] }[]
    for (const mod of modules) {
      expect(mod.detectors).toBeDefined()
      expect(mod.detectors!.length).toBeGreaterThan(0)
    }
  })
})

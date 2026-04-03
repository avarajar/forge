import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-phase1')
const MODULES_DIR = join(TEST_DIR, 'modules')
const MODULE_NAMES = ['mod-dev', 'mod-monitor', 'mod-scaffold', 'mod-planning']

describe('Phase 1: All modules integration', () => {
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

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers all 4 Phase 1 modules', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string }[]
    const names = modules.map(m => m.name)
    expect(names).toContain('@forge-dev/mod-dev')
    expect(names).toContain('@forge-dev/mod-monitor')
    expect(names).toContain('@forge-dev/mod-scaffold')
    expect(names).toContain('@forge-dev/mod-planning')
  })

  it('each module has at least one panel and one action', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[]; actions: { id: string }[] }[]
    for (const mod of modules) {
      expect(mod.panels.length).toBeGreaterThan(0)
      expect(mod.actions.length).toBeGreaterThan(0)
    }
  })

  it('module settings CRUD works', async () => {
    const putRes = await server.fetch('/api/modules/mod-dev/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwPath: '/usr/local/bin/cw', maxWorktrees: '5' })
    })
    expect(putRes.status).toBe(200)

    const getRes = await server.fetch('/api/modules/mod-dev/settings')
    const settings = await getRes.json() as Record<string, string>
    expect(settings.cwPath).toBe('/usr/local/bin/cw')
    expect(settings.maxWorktrees).toBe('5')
  })

  it('action logs accumulate across modules', async () => {
    await server.fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-proj', path: '/tmp/test-proj' })
    })

    await server.fetch('/api/actions/mod-dev/git-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })

    await server.fetch('/api/actions/mod-planning/list-adrs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })

    const res = await server.fetch('/api/action-logs')
    const logs = await res.json() as { moduleId: string }[]
    expect(logs.length).toBeGreaterThanOrEqual(2)
    const moduleIds = logs.map(l => l.moduleId)
    expect(moduleIds).toContain('mod-dev')
    expect(moduleIds).toContain('mod-planning')
  })

  it('action logs filter by module works', async () => {
    const res = await server.fetch('/api/action-logs?moduleId=mod-dev')
    const logs = await res.json() as { moduleId: string }[]
    for (const log of logs) {
      expect(log.moduleId).toBe('mod-dev')
    }
  })
})

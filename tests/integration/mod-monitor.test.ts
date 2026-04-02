import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-monitor')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-monitor integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modSrc = join(import.meta.dirname, '../../modules/mod-monitor')
    const modDest = join(MODULES_DIR, 'mod-monitor')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(modSrc, 'forge-module.json'), join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers mod-monitor module', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string }[]
    expect(modules.find(m => m.name === '@forge-dev/mod-monitor')).toBeDefined()
  })

  it('has health, activity, costs panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-monitor')!
    expect(mod.panels.map(p => p.id)).toEqual(['health', 'activity', 'costs'])
  })

  it('action-logs endpoint works', async () => {
    const res = await server.fetch('/api/action-logs')
    expect(res.status).toBe(200)
    const logs = await res.json()
    expect(Array.isArray(logs)).toBe(true)
  })

  it('runs check-health action', async () => {
    const res = await server.fetch('/api/actions/mod-monitor/check-health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })
})

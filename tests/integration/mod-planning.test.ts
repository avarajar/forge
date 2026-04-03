import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-planning')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-planning integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modSrc = join(import.meta.dirname, '../../modules/mod-planning')
    const modDest = join(MODULES_DIR, 'mod-planning')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(modSrc, 'forge-module.json'), join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers mod-planning module', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-planning')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Planning')
  })

  it('has board, architecture, docs, adr panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-planning')!
    expect(mod.panels.map(p => p.id)).toEqual(['board', 'architecture', 'docs', 'adr'])
  })

  it('runs list-diagrams action', async () => {
    const res = await server.fetch('/api/actions/mod-planning/list-diagrams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })

  it('runs list-adrs action', async () => {
    const res = await server.fetch('/api/actions/mod-planning/list-adrs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })
})

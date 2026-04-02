import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-scaffold')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-scaffold integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modSrc = join(import.meta.dirname, '../../modules/mod-scaffold')
    const modDest = join(MODULES_DIR, 'mod-scaffold')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(modSrc, 'forge-module.json'), join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers mod-scaffold module', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-scaffold')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Scaffold')
  })

  it('has templates, wizard, recent panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-scaffold')!
    expect(mod.panels.map(p => p.id)).toEqual(['templates', 'wizard', 'recent'])
  })

  it('runs detect-stack action', async () => {
    const res = await server.fetch('/api/actions/mod-scaffold/detect-stack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-qa')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-qa integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modDest = join(MODULES_DIR, 'mod-qa')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(import.meta.dirname, '../../modules/mod-qa/forge-module.json'), join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => { server.close(); rmSync(TEST_DIR, { recursive: true, force: true }) })

  it('discovers mod-qa with correct displayName', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; displayName: string }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-qa')
    expect(mod).toBeDefined()
    expect(mod!.displayName).toBe('Quality Assurance')
  })

  it('has 4 panels', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const mod = modules.find(m => m.name === '@forge-dev/mod-qa')!
    expect(mod.panels.map(p => p.id)).toEqual(['overview', 'test-runner', 'coverage', 'reports'])
  })

  it('runs detect-runner hidden action', async () => {
    const res = await server.fetch('/api/actions/mod-qa/detect-runner', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(typeof result.exitCode).toBe('number')
  })
})

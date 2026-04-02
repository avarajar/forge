import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createForgeServer } from '@forge-dev/core'
import { mkdirSync, rmSync, cpSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-mod-dev')
const MODULES_DIR = join(TEST_DIR, 'modules')

describe('mod-dev integration', () => {
  let server: ReturnType<typeof createForgeServer>

  beforeAll(() => {
    mkdirSync(MODULES_DIR, { recursive: true })
    const modSrc = join(import.meta.dirname, '../../modules/mod-dev')
    const modDest = join(MODULES_DIR, 'mod-dev')
    mkdirSync(modDest, { recursive: true })
    cpSync(join(modSrc, 'forge-module.json'), join(modDest, 'forge-module.json'))
    server = createForgeServer({ dataDir: TEST_DIR })
  })

  afterAll(() => {
    server.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('discovers mod-dev module', async () => {
    const res = await server.fetch('/api/modules/available')
    expect(res.status).toBe(200)
    const modules = await res.json() as { name: string; displayName: string }[]
    const modDev = modules.find(m => m.name === '@forge-dev/mod-dev')
    expect(modDev).toBeDefined()
    expect(modDev!.displayName).toBe('Dev Sessions')
  })

  it('has correct panels in manifest', async () => {
    const res = await server.fetch('/api/modules/available')
    const modules = await res.json() as { name: string; panels: { id: string }[] }[]
    const modDev = modules.find(m => m.name === '@forge-dev/mod-dev')!
    const panelIds = modDev.panels.map(p => p.id)
    expect(panelIds).toContain('workspaces')
    expect(panelIds).toContain('sessions')
    expect(panelIds).toContain('shared-context')
  })

  it('runs list-worktrees action', async () => {
    const res = await server.fetch('/api/actions/mod-dev/list-worktrees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number; output: string }
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('worktree')
  })

  it('runs git-status action', async () => {
    const res = await server.fetch('/api/actions/mod-dev/git-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: null })
    })
    expect(res.status).toBe(200)
    const result = await res.json() as { exitCode: number }
    expect(result.exitCode).toBe(0)
  })
})

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { skillRoutes } from './skill-routes.js'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_HOME = join(import.meta.dirname, '../.test-skill-routes-home')
const TEST_CW = join(import.meta.dirname, '../.test-skill-routes-cw')

describe('Skill Routes', () => {
  let app: Hono

  beforeAll(() => {
    // Set up fake HOME for global skills
    process.env.HOME = TEST_HOME

    // Create global skill fixture
    const globalSkillDir = join(TEST_HOME, '.claude', 'skills', 'test-global-skill')
    mkdirSync(globalSkillDir, { recursive: true })
    writeFileSync(join(globalSkillDir, 'SKILL.md'), [
      '---',
      'name: Test Global Skill',
      'description: A global test skill',
      'domain: testing',
      '---',
      '',
      '# Test Global Skill',
      '',
      'This is the body of the global skill.',
    ].join('\n'), 'utf-8')

    // Create account skill fixture
    const accountSkillDir = join(TEST_CW, 'accounts', 'testaccount', 'skills', 'test-account-skill')
    mkdirSync(accountSkillDir, { recursive: true })
    writeFileSync(join(accountSkillDir, 'SKILL.md'), [
      '---',
      'name: Test Account Skill',
      'description: An account test skill',
      '---',
      '',
      '# Test Account Skill',
      '',
      'This is the body of the account skill.',
    ].join('\n'), 'utf-8')

    // Set up minimal CW structure
    mkdirSync(join(TEST_CW, 'accounts', 'testaccount'), { recursive: true })
    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({}))
    writeFileSync(join(TEST_CW, 'config.yaml'), 'default_account: testaccount\n')

    const reader = new CWReader(TEST_CW)
    app = new Hono()
    app.route('/api/skills', skillRoutes(reader))
  })

  afterAll(() => {
    rmSync(TEST_HOME, { recursive: true, force: true })
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('GET /api/skills returns global skills', async () => {
    const res = await app.request('/api/skills')
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string; scope: string }[]
    const global = body.filter(s => s.scope === 'global')
    expect(global.length).toBeGreaterThan(0)
    expect(global[0]?.name).toBe('Test Global Skill')
  })

  it('GET /api/skills?account=testaccount returns account skills', async () => {
    const res = await app.request('/api/skills?account=testaccount')
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string; scope: string }[]
    const account = body.filter(s => s.scope === 'account')
    expect(account.length).toBeGreaterThan(0)
    expect(account[0]?.name).toBe('Test Account Skill')
  })

  it('GET /api/skills/global/:name returns skill detail', async () => {
    const res = await app.request('/api/skills/global/test-global-skill')
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string; body: string; scope: string }
    expect(body.name).toBe('Test Global Skill')
    expect(body.scope).toBe('global')
    expect(body.body).toContain('body of the global skill')
  })

  it('GET /api/skills/global/:name returns 404 for missing skill', async () => {
    const res = await app.request('/api/skills/global/nonexistent-skill')
    expect(res.status).toBe(404)
  })

  it('POST /api/skills creates a new skill', async () => {
    const res = await app.request('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        name: 'new-test-skill',
        content: '---\nname: New Test Skill\ndescription: Created via API\n---\n\n# New Test Skill\n',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // Verify it appears in list
    const listRes = await app.request('/api/skills')
    const list = await listRes.json() as { name: string }[]
    expect(list.some(s => s.name === 'New Test Skill')).toBe(true)
  })

  it('POST /api/skills returns 409 if skill already exists', async () => {
    const res = await app.request('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        name: 'test-global-skill',
        content: '---\nname: Duplicate\n---\n',
      }),
    })
    expect(res.status).toBe(409)
  })

  it('PUT /api/skills/global/:name updates SKILL.md', async () => {
    const res = await app.request('/api/skills/global/test-global-skill', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '---\nname: Test Global Skill Updated\ndescription: Updated\n---\n\n# Updated body\n',
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // Verify update was applied
    const detailRes = await app.request('/api/skills/global/test-global-skill')
    const detail = await detailRes.json() as { name: string }
    expect(detail.name).toBe('Test Global Skill Updated')
  })

  it('PUT /api/skills/global/:name returns 404 for nonexistent skill', async () => {
    const res = await app.request('/api/skills/global/does-not-exist', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# body' }),
    })
    expect(res.status).toBe(404)
  })

  it('PUT /api/skills/global/:name/references/:filename creates reference', async () => {
    const res = await app.request('/api/skills/global/test-global-skill/references/example.md', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# Example Reference\n\nSome content.' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // Verify reference appears in skill detail
    const detailRes = await app.request('/api/skills/global/test-global-skill')
    const detail = await detailRes.json() as { references: { name: string }[] }
    expect(detail.references.some(r => r.name === 'example.md')).toBe(true)
  })

  it('DELETE /api/skills/global/:name/references/:filename deletes reference', async () => {
    const res = await app.request('/api/skills/global/test-global-skill/references/example.md', {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  it('DELETE /api/skills/global/:name/references/:filename returns 404 if missing', async () => {
    const res = await app.request('/api/skills/global/test-global-skill/references/nope.md', {
      method: 'DELETE',
    })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/skills/global/:name deletes skill directory', async () => {
    const res = await app.request('/api/skills/global/new-test-skill', {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // Confirm gone
    const detailRes = await app.request('/api/skills/global/new-test-skill')
    expect(detailRes.status).toBe(404)
  })

  it('DELETE /api/skills/global/:name returns 404 for nonexistent skill', async () => {
    const res = await app.request('/api/skills/global/ghost-skill', {
      method: 'DELETE',
    })
    expect(res.status).toBe(404)
  })

  it('GET /api/skills/account/:account/:name returns account skill detail', async () => {
    const res = await app.request('/api/skills/account/testaccount/test-account-skill')
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string; scope: string }
    expect(body.name).toBe('Test Account Skill')
    expect(body.scope).toBe('account')
  })
})

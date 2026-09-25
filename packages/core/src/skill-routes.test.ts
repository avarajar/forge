import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { Hono } from 'hono'
import { skillRoutes } from './skill-routes.js'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeMarketplaceFixture, writePluginFixture } from './test-plugins.js'

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

  it('GET /api/skills returns account skills', async () => {
    const res = await app.request('/api/skills')
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string; scope: string }[]
    const account = body.filter(s => s.scope === 'account')
    expect(account.length).toBeGreaterThan(0)
    expect(account[0]?.name).toBe('Test Account Skill')
  })

  it('POST /api/skills/copy copies a global skill with its files into an account', async () => {
    const refs = join(TEST_HOME, '.claude', 'skills', 'test-global-skill', 'references')
    mkdirSync(refs, { recursive: true })
    writeFileSync(join(refs, 'notes.md'), '# notes')
    const copy = () => app.request('/api/skills/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: { scope: 'global', name: 'test-global-skill' }, to: { scope: 'account', scopeRef: 'testaccount' } }),
    })
    expect((await copy()).status).toBe(200)
    const copied = await app.request('/api/skills/account/testaccount/test-global-skill')
    const detail = await copied.json() as { references: { name: string }[] }
    expect(detail.references.map(r => r.name)).toEqual(['notes.md'])
    expect((await copy()).status).toBe(409)
  })

  it('POST /api/skills/copy rejects unknown scopes and path names', async () => {
    const copy = (body: unknown) => app.request('/api/skills/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    expect((await copy({ from: { scope: 'global', name: 'test-global-skill' }, to: { scope: 'account', scopeRef: 'ghost' } })).status).toBe(404)
    expect((await copy({ from: { scope: 'global', name: '../x' }, to: { scope: 'account', scopeRef: 'testaccount' } })).status).toBe(400)
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

describe('Skill registry routes', () => {
  const HOME = join(import.meta.dirname, '../.test-skill-registry-home')
  const CW = join(import.meta.dirname, '../.test-skill-registry-cw')
  const PROJECT = join(HOME, 'my-project')
  const OK = { code: 0, stdout: '[{"name":"skill","status":"installed"}]', stderr: '' }
  const calls: Array<{ bin: string; args: string[]; cwd: string; configDir: string | undefined }> = []
  let cliResult = OK
  let app: Hono

  const install = (body: Record<string, unknown>) => app.request('/api/skills/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  beforeAll(() => {
    process.env.HOME = HOME
    mkdirSync(PROJECT, { recursive: true })
    mkdirSync(join(CW, 'accounts', 'work'), { recursive: true })
    writeFileSync(join(CW, 'projects.json'), JSON.stringify({ web: { path: PROJECT, account: 'work' } }))
    app = new Hono()
    app.route('/api/skills', skillRoutes(new CWReader(CW), {
      runnerFor: (env) => async (bin, args, cwd) => {
        calls.push({ bin, args, cwd, configDir: env.CLAUDE_CONFIG_DIR })
        return cliResult
      },
    }))
  })

  beforeEach(() => {
    calls.length = 0
    cliResult = OK
  })

  afterAll(() => {
    vi.restoreAllMocks()
    rmSync(HOME, { recursive: true, force: true })
    rmSync(CW, { recursive: true, force: true })
  })

  it('GET /explore maps the skills.sh search response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
      skills: [{ id: 'vercel-labs/agent-skills/react-best', skillId: 'react-best', name: 'react-best', installs: 12, source: 'vercel-labs/agent-skills' }],
    }))
    const res = await app.request('/api/skills/explore?q=react')
    const body = await res.json() as { results: unknown[] }
    expect(body.results).toEqual([{
      name: 'react-best',
      slug: 'vercel-labs/agent-skills/react-best',
      skillId: 'react-best',
      installs: 12,
      source: 'skills.sh',
      url: 'https://skills.sh/vercel-labs/agent-skills/react-best',
      repo: 'vercel-labs/agent-skills',
    }])
  })

  it('POST /install installs a global skill into ~/.claude/skills', async () => {
    const res = await install({ repo: 'vercel-labs/agent-skills', skill: 'react-best', scope: 'global' })
    expect(res.status).toBe(200)
    expect(calls).toEqual([{
      bin: 'npx',
      args: ['--yes', 'skills', 'add', 'vercel-labs/agent-skills', '--skill', 'react-best', '--agent', 'claude-code', '--yes', '--json', '--global'],
      cwd: HOME,
      configDir: join(HOME, '.claude'),
    }])
  })

  it('POST /install installs an account skill into the account directory', async () => {
    const res = await install({ repo: 'owner/repo', skill: 'skill', scope: 'account', scopeRef: 'work' })
    expect(res.status).toBe(200)
    expect(calls[0]?.configDir).toBe(join(CW, 'accounts', 'work'))
    expect(calls[0]?.args).toContain('--global')
  })

  it('POST /install installs a project skill from the project directory', async () => {
    const res = await install({ repo: 'owner/repo', skill: 'skill', scope: 'project', scopeRef: 'web' })
    expect(res.status).toBe(200)
    expect(calls[0]?.cwd).toBe(PROJECT)
    expect(calls[0]?.args).not.toContain('--global')
  })

  it('POST /install rejects a request without a skill', async () => {
    const res = await install({ repo: 'owner/repo', scope: 'global' })
    expect(res.status).toBe(400)
    expect(calls).toEqual([])
  })

  it('POST /install rejects an unregistered project', async () => {
    const res = await install({ repo: 'owner/repo', skill: 'skill', scope: 'project', scopeRef: '/tmp' })
    expect(res.status).toBe(404)
    expect(calls).toEqual([])
  })

  it('POST /install reports why the CLI skipped the skill', async () => {
    cliResult = { code: 1, stdout: '[{"name":"skill","status":"skipped","reason":"No matching skill found in source"}]', stderr: '' }
    const res = await install({ repo: 'owner/repo', skill: 'skill', scope: 'global' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to install skill: No matching skill found in source' })
  })
})

describe('Plugin routes', () => {
  const HOME = join(import.meta.dirname, '../.test-plugin-routes-home')
  const CW = join(import.meta.dirname, '../.test-plugin-routes-cw')
  const ID = encodeURIComponent('monoku-skills@monoku-skills')
  const calls: Array<{ bin: string; args: string[]; configDir: string | undefined; harness: string | undefined }> = []
  let results: Array<{ code: number; stdout: string; stderr: string }> = []
  let gate: Promise<void> = Promise.resolve()
  let app: Hono

  const update = (body: Record<string, unknown>) => app.request(`/api/skills/plugins/${ID}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  beforeAll(() => {
    process.env.HOME = HOME
    process.env.CW_HARNESS = 'codex'
    mkdirSync(join(CW, 'accounts', 'monoku'), { recursive: true })
    mkdirSync(join(CW, 'accounts', 'meridian'), { recursive: true })
    writeFileSync(join(CW, 'projects.json'), JSON.stringify({ skills: { path: HOME, account: 'monoku' } }))
    const fixture = {
      name: 'monoku-skills', marketplace: 'monoku-skills', version: '2.1.0',
      marketplaceSource: { source: 'github', repo: 'monoku/skills' },
      listed: ['./skills/engineering/debug'],
      skills: [{ dir: 'skills/engineering/debug', description: 'Hard bugs' }],
    }
    writePluginFixture(join(CW, 'accounts', 'monoku'), [fixture])
    writePluginFixture(join(HOME, '.claude'), [fixture])
    writeMarketplaceFixture(join(CW, 'accounts', 'monoku'), 'monoku-skills', { source: 'github', repo: 'monoku/skills' }, [{ name: 'monoku-skills', description: 'Skills' }])
    app = new Hono()
    app.route('/api/skills', skillRoutes(new CWReader(CW), {
      remoteOf: async () => 'git@github.com:monoku/skills.git',
      runnerFor: (env) => async (bin, args) => {
        calls.push({ bin, args, configDir: env.CLAUDE_CONFIG_DIR, harness: env.CW_HARNESS })
        await gate
        return results.shift() ?? { code: 0, stdout: '', stderr: '' }
      },
    }))
  })

  beforeEach(() => {
    calls.length = 0
    results = []
    gate = Promise.resolve()
  })

  afterAll(() => {
    delete process.env.CW_HARNESS
    rmSync(HOME, { recursive: true, force: true })
    rmSync(CW, { recursive: true, force: true })
  })

  it('GET /plugins lists installed plugins with their project', async () => {
    const res = await app.request('/api/skills/plugins')
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ id: string; project?: string; skills: unknown[] }>
    expect(body).toHaveLength(1)
    expect(body[0]).toMatchObject({ id: 'monoku-skills@monoku-skills', project: 'skills' })
    expect(body[0]?.skills).toHaveLength(1)
  })

  it('GET /plugins/:id/skills/:name returns the SKILL.md', async () => {
    const res = await app.request(`/api/skills/plugins/${ID}/skills/debug`)
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string; content: string }
    expect(body.name).toBe('debug')
    expect(body.content).toContain('description: Hard bugs')
  })

  it('GET /plugins/:id/skills/:name is 404 for an unknown skill or plugin', async () => {
    expect((await app.request(`/api/skills/plugins/${ID}/skills/ghost`)).status).toBe(404)
    expect((await app.request(`/api/skills/plugins/${encodeURIComponent('x@y')}/skills/debug`)).status).toBe(404)
  })

  it('POST update runs marketplace update then plugin update in the account config dir', async () => {
    const res = await update({ scope: 'account', scopeRef: 'monoku' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, version: '2.1.0' })
    expect(calls.map(c => [c.bin, ...c.args])).toEqual([
      ['claude', 'plugin', 'marketplace', 'update', 'monoku-skills'],
      ['claude', 'plugin', 'update', 'monoku-skills@monoku-skills'],
    ])
    expect(calls.every(c => c.configDir === join(CW, 'accounts', 'monoku'))).toBe(true)
    expect(calls.every(c => c.harness === undefined)).toBe(true)
  })

  it('POST update runs without CLAUDE_CONFIG_DIR for the global scope, so Claude Code does not relocate .claude.json', async () => {
    const res = await update({ scope: 'global' })
    expect(res.status).toBe(200)
    expect(calls[0]?.configDir).toBeUndefined()
  })

  it('POST update is 404 for a malformed JSON body', async () => {
    const res = await app.request(`/api/skills/plugins/${ID}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    })
    expect(res.status).toBe(404)
    expect(calls).toEqual([])
  })

  it('POST update is 404 where the plugin is not installed', async () => {
    const res = await update({ scope: 'account', scopeRef: 'meridian' })
    expect(res.status).toBe(404)
    expect(calls).toEqual([])
  })

  it('POST update stops at the first failing command and reports its output', async () => {
    results = [{ code: 128, stdout: '', stderr: 'Cloning…\nfatal: could not read from remote repository' }]
    const res = await update({ scope: 'account', scopeRef: 'monoku' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to update monoku-skills: fatal: could not read from remote repository' })
    expect(calls).toHaveLength(1)
  })

  it('POST update explains a missing claude CLI', async () => {
    results = [{ code: 127, stdout: '', stderr: 'ENOENT' }]
    const res = await update({ scope: 'account', scopeRef: 'monoku' })
    expect(await res.json()).toEqual({ error: 'Failed to update monoku-skills: the claude CLI is not installed' })
  })

  it('POST update is 409 while another update runs for the same account', async () => {
    let release!: () => void
    gate = new Promise(r => { release = r })
    const first = update({ scope: 'account', scopeRef: 'monoku' })
    await new Promise(r => setTimeout(r, 10))
    const second = await update({ scope: 'account', scopeRef: 'monoku' })
    expect(second.status).toBe(409)
    release()
    expect((await first).status).toBe(200)
  })

  const post = (path: string, body: Record<string, unknown>) => app.request(`/api/skills${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  it('GET /marketplaces lists each marketplace with its catalog', async () => {
    const res = await app.request('/api/skills/marketplaces')
    const [market] = await res.json() as Array<{ name: string; scopes: unknown[]; plugins: Array<{ id: string }> }>
    expect(market?.name).toBe('monoku-skills')
    expect(market?.scopes).toEqual([{ scope: 'global', scopeRef: 'global' }, { scope: 'account', scopeRef: 'monoku' }])
    expect(market?.plugins.map(p => p.id)).toEqual(['monoku-skills@monoku-skills'])
  })

  it('POST /plugins/install installs into an account that knows the marketplace', async () => {
    const res = await post('/plugins/install', { id: 'monoku-skills@monoku-skills', account: 'monoku' })
    expect(res.status).toBe(200)
    expect(calls.map(c => [c.bin, ...c.args])).toEqual([['claude', 'plugin', 'install', 'monoku-skills@monoku-skills']])
    expect(calls[0]?.configDir).toBe(join(CW, 'accounts', 'monoku'))
  })

  it('POST /plugins/install adds the marketplace first to an account that lacks it', async () => {
    const res = await post('/plugins/install', { id: 'monoku-skills@monoku-skills', account: 'meridian' })
    expect(res.status).toBe(200)
    expect(calls.map(c => c.args)).toEqual([
      ['plugin', 'marketplace', 'add', 'monoku/skills'],
      ['plugin', 'install', 'monoku-skills@monoku-skills'],
    ])
  })

  it('POST /plugins/install rejects bad ids, global or unknown accounts and unknown marketplaces', async () => {
    expect((await post('/plugins/install', { id: '--help', account: 'monoku' })).status).toBe(400)
    expect((await post('/plugins/install', { id: 'a@monoku-skills', scope: 'global' })).status).toBe(404)
    expect((await post('/plugins/install', { id: 'a@monoku-skills', account: 'nobody' })).status).toBe(404)
    expect((await post('/plugins/install', { id: 'a@nowhere', account: 'meridian' })).status).toBe(404)
    expect(calls).toEqual([])
  })

  it('POST /plugins/install reports the CLI failure', async () => {
    results = [{ code: 1, stdout: '', stderr: 'Error: Plugin "a" not found in marketplace' }]
    const res = await post('/plugins/install', { id: 'a@monoku-skills', account: 'monoku' })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to install a: Error: Plugin "a" not found in marketplace' })
  })

  it('POST /marketplaces adds a marketplace to an account', async () => {
    const res = await post('/marketplaces', { source: ' acme/plugins ', account: 'meridian' })
    expect(res.status).toBe(200)
    expect(calls.map(c => [c.args, c.configDir])).toEqual([[['plugin', 'marketplace', 'add', 'acme/plugins'], join(CW, 'accounts', 'meridian')]])
    expect((await post('/marketplaces', { source: 'acme/plugins', scope: 'global' })).status).toBe(404)
  })

  it('POST /marketplaces rejects an empty source or one that looks like an option', async () => {
    expect((await post('/marketplaces', { source: '', account: 'monoku' })).status).toBe(400)
    expect((await post('/marketplaces', { source: '--scope=project', account: 'monoku' })).status).toBe(400)
    expect(calls).toEqual([])
  })
})

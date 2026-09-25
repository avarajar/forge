import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CWReader } from './cw-reader.js'
import { createRemoteLookup, knowsMarketplace, listMarketplaces, listPlugins, normalizeRepo, readPluginSkill } from './plugins.js'
import { writeMarketplaceFixture, writePluginFixture, type FixturePlugin } from './test-plugins.js'
import { makeFixtureRepo } from './test-git.js'

const noRemote = async () => null

const monoku = (over: Partial<FixturePlugin> = {}): FixturePlugin => ({
  name: 'monoku-skills',
  marketplace: 'monoku-skills',
  version: '2.1.0',
  description: 'Monoku skills',
  marketplaceSource: { source: 'github', repo: 'monoku/skills' },
  listed: ['./skills/engineering/debug', './skills/productivity/handoff'],
  skills: [
    { dir: 'skills/engineering/debug', description: 'Hard bugs' },
    { dir: 'skills/productivity/handoff' },
    { dir: 'skills/in-progress/draft' },
  ],
  ...over,
})

describe('normalizeRepo', () => {
  it.each([
    ['monoku/skills', 'monoku/skills'],
    ['git@github.com:Monoku/Skills.git', 'monoku/skills'],
    ['https://github.com/monoku/skills', 'monoku/skills'],
    ['https://github.com/monoku/skills.git', 'monoku/skills'],
    ['ssh://git@github.com/monoku/skills.git', 'monoku/skills'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeRepo(input)).toBe(expected)
  })

  it('rejects local paths and other hosts', () => {
    expect(normalizeRepo('/Users/me/skills')).toBeUndefined()
    expect(normalizeRepo('https://gitlab.com/a/b')).toBeUndefined()
    expect(normalizeRepo(undefined)).toBeUndefined()
  })
})

describe('listPlugins', () => {
  let home: string
  let cw: string
  let reader: CWReader
  const prevHome = process.env.HOME

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'forge-plugins-home-'))
    cw = join(home, '.cw')
    process.env.HOME = home
    mkdirSync(join(cw, 'accounts', 'monoku'), { recursive: true })
    mkdirSync(join(cw, 'accounts', 'meridian'), { recursive: true })
    writeFileSync(join(cw, 'projects.json'), '{}')
    reader = new CWReader(cw)
  })

  afterEach(() => {
    process.env.HOME = prevHome
    rmSync(home, { recursive: true, force: true })
  })

  it('returns nothing when no config dir has plugins', async () => {
    expect(await listPlugins(reader, noRemote)).toEqual([])
  })

  it('groups one plugin installed in two accounts', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku({ enabled: true })])
    writePluginFixture(join(cw, 'accounts', 'meridian'), [monoku({ version: '2.0.0', enabled: false, lastUpdated: '2026-08-01T00:00:00.000Z' })])
    const [plugin, ...rest] = await listPlugins(reader, noRemote)
    expect(rest).toEqual([])
    expect(plugin?.id).toBe('monoku-skills@monoku-skills')
    expect(plugin?.repo).toBe('monoku/skills')
    expect(plugin?.installs.map(i => [i.scopeRef, i.version, i.enabled]).sort()).toEqual([
      ['meridian', '2.0.0', false],
      ['monoku', '2.1.0', true],
    ])
  })

  it('reads the global config dir as the global scope', async () => {
    writePluginFixture(join(home, '.claude'), [monoku()])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.installs[0]).toMatchObject({ scope: 'global', scopeRef: 'global' })
  })

  it('counts a missing enabledPlugins key as enabled', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku()])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.installs[0]?.enabled).toBe(true)
  })

  it('lists only the skills in the plugin.json array, from the newest install', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku()])
    writePluginFixture(join(cw, 'accounts', 'meridian'), [monoku({ version: '1.0.0', lastUpdated: '2026-01-01T00:00:00.000Z', listed: ['./skills/engineering/debug'] })])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.skills.map(s => s.name)).toEqual(['debug', 'handoff'])
    expect(plugin?.skills[0]?.description).toBe('Hard bugs')
  })

  it('scans skills/* when plugin.json has no skills array', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [{
      name: 'superpowers', marketplace: 'official', version: '6.3.0',
      skills: [{ dir: 'skills/brainstorming' }, { dir: 'skills/writing-plans' }],
    }])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.skills.map(s => s.name).sort()).toEqual(['brainstorming', 'writing-plans'])
  })

  it('ignores listed skill paths outside the install', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku({ listed: ['../../../../../../etc', './skills/engineering/debug'] })])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.skills.map(s => s.name)).toEqual(['debug'])
  })

  it('scans every directory under a string skills root', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [{
      name: 'superpowers', marketplace: 'official', version: '6.3.0', listed: './custom/',
      skills: [{ dir: 'custom/a' }, { dir: 'custom/b' }],
    }])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.skills.map(s => s.name).sort()).toEqual(['a', 'b'])
  })

  it('ignores a string skills root that escapes the install', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [{
      name: 'superpowers', marketplace: 'official', version: '6.3.0', listed: '../../../../../../etc',
      skills: [{ dir: 'skills/brainstorming' }],
    }])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.skills).toEqual([])
  })

  it('falls back to plugin.json repository when the marketplace has no source', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku({ marketplaceSource: undefined, repository: 'https://github.com/monoku/skills' })])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.repo).toBe('monoku/skills')
  })

  it('prefers the plugin.json repository over the marketplace source, for a multi-plugin marketplace', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku({
      marketplaceSource: { source: 'github', repo: 'anthropics/claude-plugins-official' },
      repository: 'https://github.com/obra/superpowers',
    })])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.repo).toBe('obra/superpowers')
  })

  it('leaves repo undefined when neither plugin.json nor the marketplace source normalize', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku({
      marketplaceSource: { source: 'url', url: 'https://example.com/not-github' },
      repository: undefined,
    })])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.repo).toBeUndefined()
  })

  it('treats malformed JSON as no plugins', async () => {
    mkdirSync(join(cw, 'accounts', 'monoku', 'plugins'), { recursive: true })
    writeFileSync(join(cw, 'accounts', 'monoku', 'plugins', 'installed_plugins.json'), '{not json')
    expect(await listPlugins(reader, noRemote)).toEqual([])
  })

  it('reads one plugin skill', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku()])
    const [plugin] = await listPlugins(reader, noRemote)
    const skill = readPluginSkill(plugin!, 'debug')
    expect(skill?.description).toBe('Hard bugs')
    expect(skill?.content).toContain('# body')
    expect(readPluginSkill(plugin!, 'draft')).toBeNull()
  })
})

describe('listPlugins project match', () => {
  let home: string
  let cw: string
  const prevHome = process.env.HOME

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'forge-plugins-match-'))
    cw = join(home, '.cw')
    process.env.HOME = home
    mkdirSync(join(cw, 'accounts', 'monoku'), { recursive: true })
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku()])
  })

  afterEach(() => {
    process.env.HOME = prevHome
    rmSync(home, { recursive: true, force: true })
  })

  it('matches the project whose origin is the plugin repository', async () => {
    const repo = makeFixtureRepo()
    repo.git('remote', 'set-url', 'origin', 'git@github.com:monoku/skills.git')
    writeFileSync(join(repo.work, 'CONTRIBUTING.md'), '# Contributing\n')
    for (const name of ['ship', 'new-skill']) {
      mkdirSync(join(repo.work, '.claude', 'skills', name), { recursive: true })
      writeFileSync(join(repo.work, '.claude', 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\n`)
    }
    mkdirSync(join(repo.work, '.claude', 'skills', 'not-a-skill'), { recursive: true })
    writeFileSync(join(cw, 'projects.json'), JSON.stringify({ skills: { path: repo.work, account: 'monoku' }, other: { path: home, account: 'monoku' } }))

    const [plugin] = await listPlugins(new CWReader(cw), createRemoteLookup(repo.run))
    expect(plugin).toMatchObject({ project: 'skills', contributing: true, projectSkills: ['new-skill', 'ship'] })
    rmSync(repo.root, { recursive: true, force: true })
  })

  it('leaves project unset when no remote matches', async () => {
    const repo = makeFixtureRepo()
    writeFileSync(join(cw, 'projects.json'), JSON.stringify({ web: { path: repo.work, account: 'monoku' } }))
    const [plugin] = await listPlugins(new CWReader(cw), createRemoteLookup(repo.run))
    expect(plugin).toMatchObject({ project: undefined, contributing: false, projectSkills: [] })
    rmSync(repo.root, { recursive: true, force: true })
  })

  it('caches the remote per project path', async () => {
    writeFileSync(join(cw, 'projects.json'), JSON.stringify({ web: { path: home, account: 'monoku' } }))
    let calls = 0
    const lookup = createRemoteLookup(async () => { calls++; return { code: 0, stdout: 'git@github.com:monoku/skills.git\n', stderr: '' } })
    const reader = new CWReader(cw)
    await listPlugins(reader, lookup)
    const [plugin] = await listPlugins(reader, lookup)
    expect(calls).toBe(1)
    expect(plugin?.project).toBe('web')
  })
})

describe('listMarketplaces', () => {
  let home: string
  let cw: string
  const prevHome = process.env.HOME

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'forge-marketplaces-home-'))
    cw = join(home, '.cw')
    process.env.HOME = home
    mkdirSync(join(cw, 'accounts', 'monoku'), { recursive: true })
    mkdirSync(join(cw, 'accounts', 'meridian'), { recursive: true })
    writeFileSync(join(cw, 'projects.json'), '{}')
  })

  afterEach(() => {
    process.env.HOME = prevHome
    rmSync(home, { recursive: true, force: true })
  })

  it('merges a marketplace known by several config dirs and reads its catalog', () => {
    writeMarketplaceFixture(join(home, '.claude'), 'official', { source: 'github', repo: 'anthropics/claude-plugins-official' })
    writeMarketplaceFixture(join(cw, 'accounts', 'monoku'), 'official', { source: 'github', repo: 'anthropics/claude-plugins-official' }, [
      { name: 'zeta', description: 'Z', category: 'dev' },
      { name: 'alpha', description: 'A' },
    ])
    writeMarketplaceFixture(join(cw, 'accounts', 'monoku'), 'local', { source: 'directory', path: '/tmp/plugins' })

    const [local, official] = listMarketplaces(new CWReader(cw))
    expect(local).toEqual({ name: 'local', source: '/tmp/plugins', scopes: [{ scope: 'account', scopeRef: 'monoku' }], plugins: [] })
    expect(official?.source).toBe('anthropics/claude-plugins-official')
    expect(official?.scopes).toEqual([{ scope: 'global', scopeRef: 'global' }, { scope: 'account', scopeRef: 'monoku' }])
    expect(official?.plugins).toEqual([
      { id: 'alpha@official', name: 'alpha', description: 'A', category: undefined },
      { id: 'zeta@official', name: 'zeta', description: 'Z', category: 'dev' },
    ])
  })

  it('knowsMarketplace reads one config dir only', () => {
    writeMarketplaceFixture(join(cw, 'accounts', 'monoku'), 'official', { source: 'github', repo: 'a/b' })
    expect(knowsMarketplace(join(cw, 'accounts', 'monoku'), 'official')).toBe(true)
    expect(knowsMarketplace(join(cw, 'accounts', 'meridian'), 'official')).toBe(false)
  })
})

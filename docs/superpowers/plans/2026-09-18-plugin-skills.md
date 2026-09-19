# Plugin Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Claude Code plugin skills on Forge's Skills page, let a plugin whose repository is a CW project receive a proposed skill through a `cw work` session, and update a plugin per account.

**Architecture:** A pure reader (`packages/core/src/plugins.ts`) turns each config dir's `plugins/*.json` and plugin manifests into `PluginEntry[]`, matching repositories to CW projects through an injected git remote lookup. `skill-routes.ts` exposes list, read and update; update shells out to `claude plugin …` through the injected runner. The console adds a Plugins group to the Skills rail and a plugin pane in its own file.

**Tech Stack:** TypeScript (strict, ESM), Hono, Vitest, Preact + `@preact/signals`, UnoCSS.

**Spec:** `docs/superpowers/specs/2026-09-18-plugin-skills-design.md`

## Global Constraints

- Plugins apply to Claude Code only; the UI shows "Claude Code only" and a proposed-skill session runs with `harness: 'claude'`.
- Only installs with `scope: "user"` in `installed_plugins.json` are account-wide and listed.
- A missing `enabledPlugins` key counts as enabled.
- Skill paths from `plugin.json` must resolve inside the plugin's `installPath`; others are ignored.
- Malformed JSON is treated as empty, never a failed list.
- Commands run with `spawn`/`execFile` and an args array (the existing `Runner`), with `envWithoutHarness()` and `CLAUDE_CONFIG_DIR` set to the account's config dir. Forge never passes `--accept-command`.
- Out of scope: install/uninstall, marketplace add, enable/disable, running plugin skills, "update available", updating all accounts at once.
- Commit messages `feat(scope):`, `test:`, `docs:`; no Claude attribution; commits stay GPG-signed (never pass `--no-gpg-sign`).
- Baseline: `packages/core` has 389 passing tests; `pnpm --filter @forge-dev/console exec tsc --noEmit` is clean.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `packages/core/src/cw-types.ts` | modify | `PluginInstall`, `PluginSkill`, `PluginEntry` types |
| `packages/core/src/cw-reader.ts` | modify | make `parseFrontmatter` public |
| `packages/core/src/plugins.ts` | create | `normalizeRepo`, `createRemoteLookup`, `listPlugins`, `readPluginSkill` |
| `packages/core/src/test-plugins.ts` | create | fixture writer for plugin config dirs (test-only, excluded from build) |
| `packages/core/src/plugins.test.ts` | create | reader tests |
| `packages/core/src/skill-routes.ts` | modify | `GET /plugins`, `GET /plugins/:id/skills/:name`, `POST /plugins/:id/update` |
| `packages/core/src/skill-routes.test.ts` | modify | route tests |
| `packages/core/src/index.ts` | modify | export plugin types |
| `packages/core/tsconfig.json` | modify | exclude `src/test-plugins.ts` |
| `packages/console/src/config/plugins.ts` | create | `pluginAreas`, `proposeTaskName`, `buildProposeDescription` |
| `packages/console/src/hooks/usePlugins.ts` | create | `plugins` signal, `loadPlugins` |
| `packages/console/src/components/PaneHeader.tsx` | create | `PaneHeader` moved out of `Skills.tsx` |
| `packages/console/src/pages/SkillPlugins.tsx` | create | `PluginRailGroup`, `PluginPane`, `PluginSkillView`, `ProposeSkill` |
| `packages/console/src/pages/Skills.tsx` | modify | rail group, `plugin`/`propose` panes |
| `packages/console/src/app.tsx` | modify | `handleProposeSkill` starting the task session |
| `CHANGELOG.md`, `CLAUDE.md` | modify | docs |

---

### Task 1: Plugin reader (installs, skills, repo)

**Files:**
- Modify: `packages/core/src/cw-types.ts` (append after `ExploreResult`)
- Modify: `packages/core/src/cw-reader.ts:224` (`private parseFrontmatter` → public)
- Create: `packages/core/src/plugins.ts`
- Create: `packages/core/src/test-plugins.ts`
- Modify: `packages/core/tsconfig.json` (exclude)
- Test: `packages/core/src/plugins.test.ts`

**Interfaces:**
- Consumes: `CWReader.getAccounts()`, `CWReader.getSkillConfigDir(scope, ref)`, `CWReader.getProjects()`, `CWReader.parseFrontmatter(content)`.
- Produces:
  - `type RemoteLookup = (projectPath: string) => Promise<string | null>`
  - `normalizeRepo(value: string | undefined): string | undefined`
  - `listPlugins(reader: CWReader, remoteOf: RemoteLookup): Promise<PluginEntry[]>` (sorted by `name`)
  - `readPluginSkill(plugin: PluginEntry, name: string): { name: string; description: string; content: string } | null`
  - `createRemoteLookup(run: Runner): RemoteLookup` (Task 2 tests it)
  - `writePluginFixture(configDir, spec)` in `test-plugins.ts`

- [ ] **Step 1: Add the types**

Append to `packages/core/src/cw-types.ts`:

```ts
export interface PluginInstall {
  scope: 'global' | 'account'
  scopeRef: string
  version: string
  enabled: boolean
  installPath: string
  lastUpdated?: string
}

export interface PluginSkill {
  name: string
  description: string
  path: string
}

export interface PluginEntry {
  id: string
  name: string
  marketplace: string
  description: string
  repo?: string
  installs: PluginInstall[]
  skills: PluginSkill[]
  project?: string
  contributing: boolean
  projectSkills: string[]
}
```

In `packages/core/src/cw-reader.ts` change `private parseFrontmatter(` to `parseFrontmatter(`.

In `packages/core/tsconfig.json` change the exclude to:

```json
"exclude": ["src/**/*.test.ts", "src/test-git.ts", "src/test-plugins.ts", "node_modules", "dist"]
```

- [ ] **Step 2: Write the fixture helper**

Create `packages/core/src/test-plugins.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface FixturePlugin {
  name: string
  marketplace: string
  version: string
  lastUpdated?: string
  enabled?: boolean              // omitted → no enabledPlugins key
  description?: string
  repository?: string            // plugin.json repository
  marketplaceSource?: Record<string, string>  // known_marketplaces source
  listed?: string[]              // plugin.json "skills" array; omitted → no array
  skills: Array<{ dir: string; name?: string; description?: string }>  // dir relative to installPath
}

// writes installed_plugins.json, known_marketplaces.json, settings.json and each plugin's cache the way Claude Code lays them out
export function writePluginFixture(configDir: string, plugins: FixturePlugin[]): void {
  const installed: Record<string, unknown[]> = {}
  const marketplaces: Record<string, unknown> = {}
  const enabled: Record<string, boolean> = {}
  for (const p of plugins) {
    const id = `${p.name}@${p.marketplace}`
    const installPath = join(configDir, 'plugins', 'cache', p.marketplace, p.name, p.version)
    mkdirSync(join(installPath, '.claude-plugin'), { recursive: true })
    const manifest: Record<string, unknown> = { name: p.name, version: p.version, description: p.description ?? '' }
    if (p.repository) manifest['repository'] = p.repository
    if (p.listed) manifest['skills'] = p.listed
    writeFileSync(join(installPath, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest))
    for (const s of p.skills) {
      const dir = join(installPath, s.dir)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${s.name ?? s.dir.split('/').pop()}\ndescription: ${s.description ?? ''}\n---\n\n# body\n`)
    }
    installed[id] = [{ scope: 'user', installPath, version: p.version, lastUpdated: p.lastUpdated ?? '2026-09-01T00:00:00.000Z' }]
    if (p.marketplaceSource) marketplaces[p.marketplace] = { source: p.marketplaceSource }
    if (p.enabled !== undefined) enabled[id] = p.enabled
  }
  mkdirSync(join(configDir, 'plugins'), { recursive: true })
  writeFileSync(join(configDir, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: installed }))
  writeFileSync(join(configDir, 'plugins', 'known_marketplaces.json'), JSON.stringify(marketplaces))
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ enabledPlugins: enabled }))
}
```

- [ ] **Step 3: Write the failing tests**

Create `packages/core/src/plugins.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CWReader } from './cw-reader.js'
import { listPlugins, normalizeRepo, readPluginSkill } from './plugins.js'
import { writePluginFixture, type FixturePlugin } from './test-plugins.js'

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

  it('falls back to plugin.json repository when the marketplace has no source', async () => {
    writePluginFixture(join(cw, 'accounts', 'monoku'), [monoku({ marketplaceSource: undefined, repository: 'https://github.com/monoku/skills' })])
    const [plugin] = await listPlugins(reader, noRemote)
    expect(plugin?.repo).toBe('monoku/skills')
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
```

- [ ] **Step 4: Run to verify they fail**

Run: `cd packages/core && npx vitest run src/plugins.test.ts`
Expected: FAIL — cannot resolve `./plugins.js`.

- [ ] **Step 5: Implement `plugins.ts`**

Create `packages/core/src/plugins.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import type { CWReader } from './cw-reader.js'
import type { PluginEntry, PluginInstall, PluginSkill } from './cw-types.js'
import type { Runner } from './task-review.js'

// origin URL of a project's repository, or null when it has none
export type RemoteLookup = (projectPath: string) => Promise<string | null>

type Json = Record<string, unknown>

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function readJson(path: string): Json {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

// "owner/repo", lowercased, for GitHub shorthands and SSH/HTTPS URLs; anything else is not comparable
export function normalizeRepo(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = value.trim().match(/^(?:git@github\.com:|(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i)
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : undefined
}

export function createRemoteLookup(run: Runner): RemoteLookup {
  const cache = new Map<string, Promise<string | null>>()
  return (projectPath) => {
    let hit = cache.get(projectPath)
    if (!hit) {
      hit = run('git', ['remote', 'get-url', 'origin'], projectPath)
        .then(r => (r.code === 0 && r.stdout.trim()) || null)
        .catch(() => null)
      cache.set(projectPath, hit)
    }
    return hit
  }
}

const inside = (root: string, path: string) => {
  const r = resolve(root)
  const p = resolve(path)
  return p === r || p.startsWith(r + sep)
}

// the plugin.json "skills" array when present (Claude Code does not scan nested areas), otherwise skills/*
function skillDirs(installPath: string, manifest: Json): string[] {
  const listed = manifest['skills']
  if (Array.isArray(listed)) {
    return listed
      .filter((p): p is string => typeof p === 'string')
      .map(p => resolve(installPath, p))
      .filter(p => inside(installPath, p))
  }
  const root = join(installPath, 'skills')
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => join(root, e.name))
}

function readSkill(reader: CWReader, dir: string): PluginSkill | null {
  try {
    const { frontmatter } = reader.parseFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf-8'))
    return { name: String(frontmatter['name'] ?? basename(dir)), description: String(frontmatter['description'] ?? ''), path: dir }
  } catch {
    return null
  }
}

function manifestRepo(manifest: Json): string | undefined {
  const repo = manifest['repository']
  if (typeof repo === 'string') return repo
  if (isRecord(repo) && typeof repo['url'] === 'string') return repo['url']
  return undefined
}

function marketplaceRepo(marketplaces: Json, marketplace: string): string | undefined {
  const entry = marketplaces[marketplace]
  const source = isRecord(entry) ? entry['source'] : undefined
  if (!isRecord(source)) return undefined
  const value = source['repo'] ?? source['url']
  return typeof value === 'string' ? value : undefined
}

interface Found { install: PluginInstall; repo?: string }

function projectSkillNames(projectPath: string): string[] {
  const dir = join(projectPath, '.claude', 'skills')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'SKILL.md')))
    .map(e => e.name)
    .sort()
}

export async function listPlugins(reader: CWReader, remoteOf: RemoteLookup): Promise<PluginEntry[]> {
  const scopes: Array<Pick<PluginInstall, 'scope' | 'scopeRef'>> = [
    { scope: 'global', scopeRef: 'global' },
    ...reader.getAccounts().map(a => ({ scope: 'account' as const, scopeRef: a })),
  ]
  const found = new Map<string, Found[]>()

  for (const { scope, scopeRef } of scopes) {
    const configDir = reader.getSkillConfigDir(scope, scopeRef)
    const installed = readJson(join(configDir, 'plugins', 'installed_plugins.json'))['plugins']
    if (!isRecord(installed)) continue
    const marketplaces = readJson(join(configDir, 'plugins', 'known_marketplaces.json'))
    const enabledPlugins = readJson(join(configDir, 'settings.json'))['enabledPlugins']
    for (const [id, entries] of Object.entries(installed)) {
      if (!Array.isArray(entries)) continue
      // project and local scopes belong to one project, not the account
      const user = entries.find((e): e is Json => isRecord(e) && e['scope'] === 'user' && typeof e['installPath'] === 'string')
      if (!user) continue
      const marketplace = id.slice(id.lastIndexOf('@') + 1)
      const install: PluginInstall = {
        scope,
        scopeRef,
        version: String(user['version'] ?? ''),
        enabled: !isRecord(enabledPlugins) || enabledPlugins[id] !== false,
        installPath: String(user['installPath']),
        lastUpdated: typeof user['lastUpdated'] === 'string' ? user['lastUpdated'] : undefined,
      }
      const list = found.get(id) ?? []
      list.push({ install, repo: marketplaceRepo(marketplaces, marketplace) })
      found.set(id, list)
    }
  }

  const projects = Object.entries(reader.getProjects())
  const remotes = await Promise.all(projects.map(async ([name, p]) => ({ name, path: p.path, repo: normalizeRepo((await remoteOf(p.path)) ?? undefined) })))

  const plugins: PluginEntry[] = []
  for (const [id, list] of found) {
    const newest = [...list].sort((a, b) => (b.install.lastUpdated ?? '').localeCompare(a.install.lastUpdated ?? ''))[0]!
    const manifest = readJson(join(newest.install.installPath, '.claude-plugin', 'plugin.json'))
    const repo = normalizeRepo(list.map(f => f.repo).find(Boolean) ?? manifestRepo(manifest))
    const match = repo ? remotes.find(r => r.repo === repo) : undefined
    plugins.push({
      id,
      name: id.slice(0, id.lastIndexOf('@')),
      marketplace: id.slice(id.lastIndexOf('@') + 1),
      description: String(manifest['description'] ?? ''),
      repo,
      installs: list.map(f => f.install),
      skills: skillDirs(newest.install.installPath, manifest).flatMap(dir => readSkill(reader, dir) ?? []),
      project: match?.name,
      contributing: match ? existsSync(join(match.path, 'CONTRIBUTING.md')) : false,
      projectSkills: match ? projectSkillNames(match.path) : [],
    })
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name))
}

export function readPluginSkill(plugin: PluginEntry, name: string): { name: string; description: string; content: string } | null {
  const skill = plugin.skills.find(s => s.name === name)
  if (!skill) return null
  try {
    return { name: skill.name, description: skill.description, content: readFileSync(join(skill.path, 'SKILL.md'), 'utf-8') }
  } catch {
    return null
  }
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd packages/core && npx vitest run src/plugins.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Full suite and build**

Run: `cd packages/core && npx vitest run && npx tsc --noEmit`
Expected: all tests pass (389 + new), no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/cw-types.ts packages/core/src/cw-reader.ts packages/core/src/plugins.ts packages/core/src/plugins.test.ts packages/core/src/test-plugins.ts packages/core/tsconfig.json
git commit -m "feat(core): read Claude Code plugins and their skills per account"
```

---

### Task 2: Project matching (remote lookup, CONTRIBUTING, repo skills)

**Files:**
- Test: `packages/core/src/plugins.test.ts` (append)
- Modify: `packages/core/src/plugins.ts` only if a test fails

**Interfaces:**
- Consumes: `listPlugins`, `createRemoteLookup` (Task 1), `makeFixtureRepo()` from `test-git.ts` (returns `{ work, git, run }`).
- Produces: `PluginEntry.project`, `.contributing`, `.projectSkills` verified.

- [ ] **Step 1: Write the tests**

Append to `packages/core/src/plugins.test.ts` (add `createRemoteLookup` to the `./plugins.js` import and `import { makeFixtureRepo } from './test-git.js'`):

```ts
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
```

- [ ] **Step 2: Run**

Run: `cd packages/core && npx vitest run src/plugins.test.ts`
Expected: PASS. If a test fails, fix `plugins.ts` (not the test) and re-run until green.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/plugins.test.ts packages/core/src/plugins.ts
git commit -m "test(core): match plugin repositories to CW projects"
```

---

### Task 3: List and read routes

**Files:**
- Modify: `packages/core/src/skill-routes.ts`
- Modify: `packages/core/src/index.ts:20`
- Test: `packages/core/src/skill-routes.test.ts` (new `describe` at the end)

**Interfaces:**
- Consumes: `listPlugins`, `readPluginSkill`, `createRemoteLookup`, `RemoteLookup` (Task 1); `runCommand` from `task-review.ts`.
- Produces:
  - `skillRoutes(reader, options: { runnerFor?; remoteOf?: RemoteLookup })`
  - `GET /api/skills/plugins` → `PluginEntry[]`
  - `GET /api/skills/plugins/:id/skills/:name` → `{ name, description, content }` or 404 `{ error }`
  - `export type { PluginEntry, PluginInstall, PluginSkill }` from `@forge-dev/core`

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/skill-routes.test.ts` (add `import { writePluginFixture } from './test-plugins.js'`):

```ts
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
    writePluginFixture(join(CW, 'accounts', 'monoku'), [{
      name: 'monoku-skills', marketplace: 'monoku-skills', version: '2.1.0',
      marketplaceSource: { source: 'github', repo: 'monoku/skills' },
      listed: ['./skills/engineering/debug'],
      skills: [{ dir: 'skills/engineering/debug', description: 'Hard bugs' }],
    }])
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
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/core && npx vitest run src/skill-routes.test.ts -t "Plugin routes"`
Expected: FAIL — `/plugins` returns 404.

- [ ] **Step 3: Implement the routes**

In `packages/core/src/skill-routes.ts`:

Imports:

```ts
import { createRunner, runCommand, type Runner, type RunResult } from './task-review.js'
import { createRemoteLookup, listPlugins, readPluginSkill, type RemoteLookup } from './plugins.js'
```

Signature and setup:

```ts
export function skillRoutes(
  reader: CWReader,
  options: { runnerFor?: (env: NodeJS.ProcessEnv) => Runner; remoteOf?: RemoteLookup } = {},
): Hono {
  const runnerFor = options.runnerFor ?? ((env) => createRunner(env, INSTALL_TIMEOUT_MS))
  const remoteOf = options.remoteOf ?? createRemoteLookup(runCommand)
  const app = new Hono()
```

Before `return app`:

```ts
  app.get('/plugins', async (c) => c.json(await listPlugins(reader, remoteOf)))

  app.get('/plugins/:id/skills/:name', async (c) => {
    const plugin = (await listPlugins(reader, remoteOf)).find(p => p.id === c.req.param('id'))
    const skill = plugin && readPluginSkill(plugin, c.req.param('name'))
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })
```

In `packages/core/src/index.ts` change line 20 to:

```ts
export type { SkillScope, SkillEntry, SkillDetail, ExploreResult, PluginEntry, PluginInstall, PluginSkill } from './cw-types.js'
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/core && npx vitest run src/skill-routes.test.ts`
Expected: PASS (existing and new tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/skill-routes.ts packages/core/src/skill-routes.test.ts packages/core/src/index.ts
git commit -m "feat(core): list plugins and read plugin skills over /api/skills/plugins"
```

---

### Task 4: Update route

**Files:**
- Modify: `packages/core/src/skill-routes.ts`
- Test: `packages/core/src/skill-routes.test.ts` (inside `describe('Plugin routes')`)

**Interfaces:**
- Consumes: `listPlugins` (Task 1), `runnerFor`, `envWithoutHarness`, `reader.getSkillConfigDir`.
- Produces: `POST /api/skills/plugins/:id/update` with body `{ scope: 'global' | 'account'; scopeRef?: string }` → `200 { ok: true, version }`, `404 { error }`, `409 { error }`, `500 { error }`.

- [ ] **Step 1: Write the failing tests**

Add inside `describe('Plugin routes')`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/core && npx vitest run src/skill-routes.test.ts -t "POST update"`
Expected: FAIL — 404 on the route.

- [ ] **Step 3: Implement**

In `packages/core/src/skill-routes.ts`, add after `installFailure`:

```ts
function commandFailure(result: RunResult): string {
  if (result.code === 127) return 'the claude CLI is not installed'
  const lines = `${result.stderr}\n${result.stdout}`.trim().split('\n').filter(Boolean)
  return lines.find(l => /error|fatal/i.test(l)) ?? lines.pop() ?? `claude exited with code ${result.code}`
}
```

Inside `skillRoutes`, after `const app = new Hono()`:

```ts
  // one update per config dir: two CLIs rewriting installed_plugins.json would race
  const updating = new Set<string>()
```

Before `return app`:

```ts
  app.post('/plugins/:id/update', async (c) => {
    const id = c.req.param('id')
    const { scope, scopeRef } = await c.req.json<{ scope?: string; scopeRef?: string }>()
    const ref = scope === 'global' ? 'global' : scopeRef ?? ''
    const find = async () => (await listPlugins(reader, remoteOf)).find(p => p.id === id)
    const plugin = await find()
    const install = plugin?.installs.find(i => i.scope === scope && i.scopeRef === ref)
    if (!plugin || !install) return c.json({ error: `${id} is not installed in ${ref || 'that scope'}` }, 404)

    const configDir = reader.getSkillConfigDir(install.scope, install.scopeRef)
    if (updating.has(configDir)) return c.json({ error: `An update is already running for ${ref}` }, 409)
    updating.add(configDir)
    try {
      const run = runnerFor({ ...envWithoutHarness(), CLAUDE_CONFIG_DIR: configDir })
      for (const args of [['plugin', 'marketplace', 'update', plugin.marketplace], ['plugin', 'update', plugin.id]]) {
        const result = await run('claude', args, configDir)
        if (result.code !== 0) return c.json({ error: `Failed to update ${plugin.name}: ${commandFailure(result)}` }, 500)
      }
    } finally {
      updating.delete(configDir)
    }
    const version = (await find())?.installs.find(i => i.scope === install.scope && i.scopeRef === ref)?.version ?? install.version
    return c.json({ ok: true, version })
  })
```

Note: in the "stops at the first failing command" test the stderr has `fatal: …` as the matching line, so `commandFailure` returns it rather than the last line.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/core && npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/skill-routes.ts packages/core/src/skill-routes.test.ts
git commit -m "feat(core): update a plugin in one account through the claude CLI"
```

---

### Task 5: Console — Plugins group and plugin pane (read-only + Update)

**Files:**
- Create: `packages/console/src/hooks/usePlugins.ts`
- Create: `packages/console/src/components/PaneHeader.tsx`
- Create: `packages/console/src/pages/SkillPlugins.tsx`
- Modify: `packages/console/src/pages/Skills.tsx`

**Interfaces:**
- Consumes: `GET /api/skills/plugins`, `GET /api/skills/plugins/:id/skills/:name`, `POST /api/skills/plugins/:id/update` (Tasks 3–4); `PluginEntry` from `@forge-dev/core`.
- Produces:
  - `plugins: Signal<PluginEntry[] | null>`, `loadPlugins(): Promise<void>`
  - `PaneHeader` (same props as today: `{ title; sub?; children? }`)
  - `PluginRailGroup({ list, query, selected, onSelect })`
  - `PluginPane({ plugin, accounts, query, onSelectSkill, onPropose? })` — `onPropose` stays unset until Task 6 wires it.

- [ ] **Step 1: Store**

Create `packages/console/src/hooks/usePlugins.ts`:

```ts
import { signal } from '@preact/signals'
import type { PluginEntry } from '@forge-dev/core'

export const plugins = signal<PluginEntry[] | null>(null)

export async function loadPlugins(): Promise<void> {
  const res = await fetch('/api/skills/plugins')
  if (!res.ok) throw new Error('fetch failed')
  plugins.value = await res.json() as PluginEntry[]
}
```

- [ ] **Step 2: Move PaneHeader**

Create `packages/console/src/components/PaneHeader.tsx` with the exact `PaneHeader` component currently at `pages/Skills.tsx:36-45`, exported:

```tsx
import { type FunctionComponent, type ComponentChildren } from 'preact'

export const PaneHeader: FunctionComponent<{ title: string; sub?: string; children?: ComponentChildren }> = ({ title, sub, children }) => (
  <div class="glass flex items-center flex-wrap shrink-0" style={{ gap: '10px', padding: '12px 20px', borderBottom: '1px solid var(--hair)' }}>
    <div class="min-w-0">
      <h2 style={{ fontSize: '17px', fontWeight: 650, letterSpacing: '-0.015em', overflowWrap: 'anywhere' }}>{title}</h2>
      {sub && <p class="mono" style={{ marginTop: '1px', fontSize: '11.5px', color: 'var(--ink-3)', overflowWrap: 'anywhere' }}>{sub}</p>}
    </div>
    <span style={{ flex: '1 1 40px' }} />
    {children}
  </div>
)
```

In `pages/Skills.tsx`, delete the local `PaneHeader` and add `import { PaneHeader } from '../components/PaneHeader.js'`. Remove `type ComponentChildren` from its preact import if now unused.

- [ ] **Step 3: Plugin components**

Create `packages/console/src/pages/SkillPlugins.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import type { PluginEntry, PluginInstall } from '@forge-dev/core'
import { PaneHeader } from '../components/PaneHeader.js'
import { loadPlugins } from '../hooks/usePlugins.js'

const pluginPath = (id: string) => `/api/skills/plugins/${encodeURIComponent(id)}`

export const matchingSkills = (p: PluginEntry, q: string) =>
  q ? p.skills.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) : p.skills

/* ── Rail ── */

export const PluginRailGroup: FunctionComponent<{
  list: PluginEntry[]
  query: string
  selected: string | null
  onSelect: (id: string) => void
}> = ({ list, query, selected, onSelect }) => {
  const shown = list.flatMap(p => {
    const count = matchingSkills(p, query).length
    return !query || count > 0 || p.name.toLowerCase().includes(query) ? [{ p, count }] : []
  })
  if (shown.length === 0) return null
  return (
    <div style={{ marginTop: '10px' }}>
      <p style={{ padding: '6px 11px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Plugins</p>
      {shown.map(({ p, count }) => {
        const on = selected === p.id
        return (
          <button
            key={p.id}
            type="button"
            aria-current={on ? 'true' : undefined}
            class="flex items-center w-full text-left cursor-pointer transition-all duration-180 ease-spring hover:bg-elev"
            style={{ gap: '8px', padding: '9px 11px', marginBottom: '4px', borderRadius: '11px', border: `1px solid ${on ? 'var(--hair)' : 'transparent'}`, background: on ? 'var(--card)' : 'transparent', boxShadow: on ? 'var(--shadow-s)' : 'none', color: 'var(--ink)' }}
            onClick={() => onSelect(p.id)}
          >
            <span class="i-lucide-package shrink-0" style={{ width: '13px', height: '13px', color: 'var(--ink-3)' }} />
            <span class="flex-1 min-w-0 truncate" style={{ fontSize: '13px', fontWeight: 600 }}>{p.name}</span>
            <span class="mono" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ── Pane ── */

const sectionTitle = { fontSize: '12px', fontWeight: 600, color: 'var(--ink-2)', margin: '0 0 8px' }
const rowStyle = { gap: '10px', padding: '9px 12px', borderRadius: '11px', border: '1px solid var(--hair)', background: 'var(--card)' }

const AccountRow: FunctionComponent<{ plugin: PluginEntry; install: PluginInstall }> = ({ plugin, install }) => {
  const [busy, setBusy] = useState(false)
  const label = install.scope === 'global' ? 'global' : install.scopeRef

  const runUpdate = async () => {
    setBusy(true)
    try {
      const res = await fetch(`${pluginPath(plugin.id)}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: install.scope, scopeRef: install.scopeRef }),
      })
      const result = await res.json() as { ok?: boolean; version?: string; error?: string }
      if (result.ok) {
        showToast(`${plugin.name} ${result.version ?? ''} · applies to new sessions`, 'success')
        await loadPlugins()
      } else {
        showToast(result.error ?? 'Failed to update plugin', 'error')
      }
    } catch {
      showToast('Failed to update plugin', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex items-center" style={rowStyle}>
      <span class="flex-1 min-w-0 truncate" style={{ fontSize: '13px', fontWeight: 600 }}>{label}</span>
      <span class="mono" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>{install.version}</span>
      <span style={{ fontSize: '11.5px', color: install.enabled ? 'var(--green)' : 'var(--ink-3)' }}>{install.enabled ? 'on' : 'off'}</span>
      <ActionButton label={busy ? 'Updating…' : 'Update'} variant="secondary" size="sm" loading={busy} onClick={runUpdate} />
    </div>
  )
}

export const PluginSkillView: FunctionComponent<{ plugin: PluginEntry; name: string; onBack: () => void }> = ({ plugin, name, onBack }) => {
  const [content, setContent] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setFailed(false)
    fetch(`${pluginPath(plugin.id)}/skills/${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() as Promise<{ content: string }> : Promise.reject(new Error('not found')))
      .then(d => { if (!cancelled) setContent(d.content) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [plugin.id, name])

  return (
    <>
      <PaneHeader title={name} sub={`${plugin.name} · read-only`}>
        <ActionButton label="Back" variant="secondary" size="sm" onClick={onBack} />
      </PaneHeader>
      <div class="flex-1 min-h-0 overflow-auto" style={{ padding: '12px 20px 20px' }}>
        <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', margin: '0 0 10px' }}>Comes from the plugin. To change it, propose the change in the repository.</p>
        {failed ? (
          <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>Skill not found.</p>
        ) : content === null ? (
          <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>Loading skill…</p>
        ) : (
          <pre class="mono" style={{ margin: 0, padding: '14px 16px', borderRadius: '14px', border: '1px solid var(--hair)', background: 'var(--card)', fontSize: '12.5px', lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', boxShadow: 'var(--shadow-s)' }}>{content}</pre>
        )}
      </div>
    </>
  )
}

export const PluginPane: FunctionComponent<{
  plugin: PluginEntry
  accounts: string[]
  query: string
  onSelectSkill: (name: string) => void
  onPropose?: () => void
}> = ({ plugin, accounts, query, onSelectSkill, onPropose }) => {
  const installed = new Set(plugin.installs.map(i => i.scopeRef))
  const missing = accounts.filter(a => !installed.has(a))
  return (
    <>
      <PaneHeader title={plugin.name} sub={plugin.repo ? `${plugin.repo} · Claude Code only` : 'Claude Code only'}>
        {plugin.repo && (
          <a href={`https://github.com/${plugin.repo}`} target="_blank" rel="noreferrer" style={{ fontSize: '12.5px', color: 'var(--blue)' }}>GitHub</a>
        )}
        {plugin.project && onPropose && <ActionButton label="Propose a skill" variant="primary" size="sm" onClick={onPropose} />}
      </PaneHeader>
      <div class="flex-1 min-h-0 overflow-auto">
        <div class="flex flex-col" style={{ padding: '16px 20px 24px', gap: '18px', maxWidth: '720px' }}>
          {plugin.description && <p style={{ fontSize: '13px', color: 'var(--ink-2)', margin: 0 }}>{plugin.description}</p>}
          {!plugin.project && plugin.repo && (
            <p style={{ fontSize: '12.5px', color: 'var(--ink-3)', margin: 0 }}>Register <span class="mono">{plugin.repo}</span> as a CW project to propose skills.</p>
          )}
          <section>
            <h3 style={sectionTitle}>Accounts</h3>
            <div class="flex flex-col" style={{ gap: '6px' }}>
              {plugin.installs.map(i => <AccountRow key={`${i.scope}/${i.scopeRef}`} plugin={plugin} install={i} />)}
              {missing.map(a => (
                <div key={a} class="flex items-center" style={{ ...rowStyle, opacity: 0.55 }}>
                  <span class="flex-1" style={{ fontSize: '13px' }}>{a}</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>not installed</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 style={sectionTitle}>Skills ({plugin.skills.length})</h3>
            <div class="flex flex-col" style={{ gap: '4px' }}>
              {matchingSkills(plugin, query).map(s => (
                <button
                  key={s.name}
                  type="button"
                  class="flex items-center w-full text-left cursor-pointer hover:bg-elev"
                  style={{ gap: '10px', padding: '8px 11px', borderRadius: '10px', border: 0, background: 'transparent', color: 'var(--ink)' }}
                  onClick={() => onSelectSkill(s.name)}
                >
                  <span class="shrink-0" style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</span>
                  <span class="flex-1 min-w-0 truncate" style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{s.description}</span>
                  <span class="i-lucide-chevron-right shrink-0" style={{ width: '13px', height: '13px', color: 'var(--ink-3)' }} />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Wire into Skills.tsx**

In `pages/Skills.tsx`:

1. Imports:

```ts
import { plugins, loadPlugins } from '../hooks/usePlugins.js'
import { PluginRailGroup, PluginPane, PluginSkillView } from './SkillPlugins.js'
```

2. Extend `Pane`:

```ts
type Pane = { kind: 'editor'; skill: SkillEntry } | { kind: 'create' } | { kind: 'explore'; query: string }
  | { kind: 'plugin'; id: string; skill?: string } | { kind: 'empty' }
```

3. In `Skills`, make `refresh` load both, and read the store:

```ts
  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadSkills(firstAccount, firstProject), loadPlugins()])
    } catch {
      showToast('Failed to load skills', 'error')
    } finally {
      setLoading(false)
    }
  }, [firstAccount, firstProject])

  useEffect(() => { if (skills.value === null || plugins.value === null) void refresh() }, [refresh])

  const pluginList = plugins.value ?? []
  const activePlugin = pane.kind === 'plugin' ? pluginList.find(p => p.id === pane.id) : undefined
```

4. Rail: after the installed-skill `filtered.map(...)` block and before the `{q && (` skills.sh button, add:

```tsx
          <PluginRailGroup
            list={pluginList}
            query={q}
            selected={pane.kind === 'plugin' ? pane.id : null}
            onSelect={(id) => setPane({ kind: 'plugin', id })}
          />
```

Change the empty message condition to `!loading && filtered.length === 0 && pluginList.length === 0`.

5. Pane: after the `explore` line add:

```tsx
        {pane.kind === 'plugin' && activePlugin && !pane.skill && (
          <PluginPane
            plugin={activePlugin}
            accounts={accounts}
            query={q}
            onSelectSkill={(name) => setPane({ kind: 'plugin', id: activePlugin.id, skill: name })}
          />
        )}
        {pane.kind === 'plugin' && activePlugin && pane.skill && (
          <PluginSkillView key={pane.skill} plugin={activePlugin} name={pane.skill} onBack={() => setPane({ kind: 'plugin', id: activePlugin.id })} />
        )}
```

- [ ] **Step 5: Typecheck and build**

Run: `pnpm --filter @forge-dev/core build && pnpm --filter @forge-dev/console exec tsc --noEmit && pnpm --filter @forge-dev/console build`
Expected: no errors.

- [ ] **Step 6: Manual check**

Run `pnpm start` (or rebuild and restart `FORGE_NO_OPEN=1 node packages/platform/dist/index.js`), open Skills:
- PLUGINS group lists monoku-skills, superpowers, etc. once each.
- monoku-skills pane: repo, "Claude Code only", accounts monoku (2.1.0, on, Update) and meridian "not installed", 15 skills; clicking one shows its SKILL.md read-only.
- Typing `debug` in search keeps monoku-skills in the rail with count 1.

- [ ] **Step 7: Commit**

```bash
git add packages/console/src/hooks/usePlugins.ts packages/console/src/components/PaneHeader.tsx packages/console/src/pages/SkillPlugins.tsx packages/console/src/pages/Skills.tsx
git commit -m "feat(console): plugin skills and per-account plugin update on the Skills page"
```

---

### Task 6: Console — Propose a skill

**Files:**
- Create: `packages/console/src/config/plugins.ts`
- Modify: `packages/console/src/pages/SkillPlugins.tsx` (add `ProposeSkill`)
- Modify: `packages/console/src/pages/Skills.tsx` (pane + prop)
- Modify: `packages/console/src/app.tsx` (`handleProposeSkill`)

**Interfaces:**
- Consumes: `PluginEntry` (`project`, `contributing`, `projectSkills`, `skills[].path`, `installs`); `POST /api/cw/start` with `{ type: 'task', project, task, description, account, harness: 'claude' }` → `{ ok, session?, error? }`.
- Produces:
  - `pluginAreas(plugin: PluginEntry): string[]`
  - `proposeTaskName(text: string): string`
  - `buildProposeDescription(plugin: PluginEntry, text: string, area?: string): string`
  - `SkillsProps.onProposeSkill: (plugin: PluginEntry, text: string, area: string | undefined, account: string) => void`

- [ ] **Step 1: Pure helpers**

Create `packages/console/src/config/plugins.ts`:

```ts
import type { PluginEntry } from '@forge-dev/core'

// area folders the plugin already uses: the segment after skills/ in each skill path
export function pluginAreas(plugin: PluginEntry): string[] {
  const areas = new Set<string>()
  for (const s of plugin.skills) {
    const parts = s.path.split(/[\\/]/)
    const i = parts.lastIndexOf('skills')
    if (i >= 0 && parts.length - i === 3) areas.add(parts[i + 1]!)
  }
  return [...areas].sort()
}

// task slug for the cw work session, e.g. "add-skill-summarize-release-notes"
export function proposeTaskName(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '')
  return `add-skill-${slug || Date.now()}`
}

export function buildProposeDescription(plugin: PluginEntry, text: string, area?: string): string {
  return [
    'Add a new skill to this repository and open a pull request.',
    `The skill: ${text}`,
    area ? `Area: ${area}` : '',
    plugin.contributing ? 'Follow CONTRIBUTING.md.' : '',
    plugin.projectSkills.length > 0 ? `Use this repository's own skills: ${plugin.projectSkills.map(s => `/${s}`).join(', ')}` : '',
  ].filter(Boolean).join('\n')
}
```

- [ ] **Step 2: Form component**

Append to `pages/SkillPlugins.tsx` (add `import { Field } from '../components/Field.js'` and `import { pluginAreas } from '../config/plugins.js'`):

```tsx
export const ProposeSkill: FunctionComponent<{
  plugin: PluginEntry
  onSubmit: (text: string, area: string | undefined, account: string) => Promise<void>
  onCancel: () => void
}> = ({ plugin, onSubmit, onCancel }) => {
  const areas = pluginAreas(plugin)
  const accounts = plugin.installs.filter(i => i.scope === 'account').map(i => i.scopeRef)
  const [text, setText] = useState('')
  const [area, setArea] = useState(areas[0] ?? '')
  const [account, setAccount] = useState(accounts[0] ?? '')
  const [starting, setStarting] = useState(false)

  const submit = async () => {
    setStarting(true)
    try {
      await onSubmit(text.trim(), areas.length > 1 ? area : undefined, account)
    } finally {
      setStarting(false)
    }
  }

  return (
    <>
      <PaneHeader title="Propose a skill" sub={`${plugin.repo ?? plugin.name} · project ${plugin.project ?? ''}`} />
      <div class="flex-1 min-h-0 overflow-auto">
        <div class="flex flex-col" style={{ padding: '16px 20px 24px', gap: '14px', maxWidth: '560px' }}>
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', margin: 0 }}>
            Starts a task in <span class="mono">{plugin.project}</span> that writes the skill and opens a pull request for review.
          </p>
          <Field label="What the skill does and when to use it">
            <textarea class="field" rows={4} value={text} placeholder="Summarize a release's merged PRs into notes when someone asks for a changelog" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
          </Field>
          {areas.length > 1 && (
            <Field label="Area">
              <select class="field" value={area} onChange={(e) => setArea((e.target as HTMLSelectElement).value)}>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
          )}
          {accounts.length > 0 && (
            <Field label="Account">
              <select class="field" value={account} onChange={(e) => setAccount((e.target as HTMLSelectElement).value)}>
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
          )}
          <div class="flex flex-wrap" style={{ gap: '8px' }}>
            <ActionButton label={starting ? 'Starting…' : 'Start task'} variant="primary" loading={starting} disabled={!text.trim() || !account} onClick={submit} />
            <ActionButton label="Cancel" variant="secondary" onClick={onCancel} />
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Wire the page**

In `pages/Skills.tsx`:

1. `import type { SkillEntry, SkillDetail, ExploreResult, PluginEntry } from '@forge-dev/core'` and add `ProposeSkill` to the `./SkillPlugins.js` import.
2. Add to `SkillsProps`:

```ts
  onProposeSkill: (plugin: PluginEntry, text: string, area: string | undefined, account: string) => Promise<boolean>
```

3. Extend `Pane` with `| { kind: 'propose'; id: string }`, destructure `onProposeSkill` in `Skills`, and compute `activePlugin` for both kinds:

```ts
  const activePlugin = pane.kind === 'plugin' || pane.kind === 'propose' ? pluginList.find(p => p.id === pane.id) : undefined
```

4. Pass `onPropose={() => setPane({ kind: 'propose', id: activePlugin.id })}` to `PluginPane`, and add:

```tsx
        {pane.kind === 'propose' && activePlugin && (
          <ProposeSkill
            plugin={activePlugin}
            onCancel={() => setPane({ kind: 'plugin', id: activePlugin.id })}
            onSubmit={async (text, area, account) => {
              if (await onProposeSkill(activePlugin, text, area, account)) setPane({ kind: 'plugin', id: activePlugin.id })
            }}
          />
        )}
```

- [ ] **Step 4: Start the session from app.tsx**

In `packages/console/src/app.tsx` add imports `import type { PluginEntry } from '@forge-dev/core'` (merge into the existing `@forge-dev/core` type import) and `import { buildProposeDescription, proposeTaskName } from './config/plugins.js'`. After `handleRunSkill`:

```ts
  // plugins load in Claude Code only, so the session that writes the skill runs there too
  const handleProposeSkill = useCallback(async (plugin: PluginEntry, text: string, area: string | undefined, account: string) => {
    if (!plugin.project) return false
    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'task',
          project: plugin.project,
          task: proposeTaskName(text),
          description: buildProposeDescription(plugin, text, area),
          account,
          harness: 'claude',
        }),
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok && result.session) {
        openSession(result.session)
        refreshAfterAction()
        showToast(`Proposing a skill in ${plugin.project}`, 'success')
        return true
      }
      showToast(result.error ?? 'Failed to start session', 'error')
    } catch {
      showToast('Failed to start session', 'error')
    }
    return false
  }, [openSession, refreshAfterAction])
```

Pass `onProposeSkill={handleProposeSkill}` to `<Skills …>`.

- [ ] **Step 5: Typecheck and build**

Run: `pnpm --filter @forge-dev/console exec tsc --noEmit && pnpm --filter @forge-dev/console build`
Expected: no errors.

- [ ] **Step 6: Manual check**

Restart the server, open Skills → monoku-skills → Propose a skill. Area lists documentation, engineering, productivity; account defaults to monoku. Type a short description and Start task: a tab opens on project `skills` with a task named `add-skill-…`, and its TASK_NOTES.md description names CONTRIBUTING.md and `/new-skill, /ship`. Close the task afterwards with Done (no PR is expected from this check).

- [ ] **Step 7: Commit**

```bash
git add packages/console/src/config/plugins.ts packages/console/src/pages/SkillPlugins.tsx packages/console/src/pages/Skills.tsx packages/console/src/app.tsx
git commit -m "feat(console): propose a skill to a plugin's repository as a task"
```

---

### Task 7: Docs

**Files:**
- Modify: `CHANGELOG.md` (Unreleased → Added)
- Modify: `CLAUDE.md` (Key Files → Core and Console; API Endpoints → Other)

- [ ] **Step 1: CHANGELOG**

Add under `## Unreleased` → `### Added`, as the first bullets:

```markdown
- Skills lists Claude Code plugin skills: each installed plugin once, the accounts that have it with version and state, and its skills read-only. Plugins apply to Claude Code only.
- Propose a skill: when a plugin's repository is a registered CW project, a task in that project writes the skill following its CONTRIBUTING.md and repository skills, and opens a pull request.
- Update a plugin in one account (`claude plugin marketplace update` and `claude plugin update`), so a merged skill applies to new sessions without waiting for auto-update.
- `GET /api/skills/plugins`, `GET /api/skills/plugins/:id/skills/:name` and `POST /api/skills/plugins/:id/update`.
```

- [ ] **Step 2: CLAUDE.md**

Under Key Files → Core, after the `skill-routes.ts` line:

```markdown
- `packages/core/src/plugins.ts` — Claude Code plugins per config dir (global and each account): installs, skills from `plugin.json`, repository matched to a CW project by git remote
```

Under Key Files → Console, after the `Skills.tsx` line:

```markdown
- `packages/console/src/pages/SkillPlugins.tsx` — Plugins group, plugin pane (accounts, Update, read-only skills), Propose a skill form (`config/plugins.ts` builds the task)
```

Under API Endpoints → Other, replace the `/api/skills` line with:

```markdown
- `/api/skills` — `GET /`, `GET|PUT|DELETE /{global,account/:account,project/:project}/:name`, references, `POST /`, `GET /explore` (skills.sh), `POST /install`, `GET /plugins`, `GET /plugins/:id/skills/:name`, `POST /plugins/:id/update`
```

Update the test count in the Stack table to the new total printed by `cd packages/core && npx vitest run`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md CLAUDE.md
git commit -m "docs: plugin skills, propose a skill and plugin update"
```

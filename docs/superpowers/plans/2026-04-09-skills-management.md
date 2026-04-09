# Skills Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add skill browsing, creation, editing, and deletion to Forge with global/account/project scoping, plus online discovery via skills.sh.

**Architecture:** New `skill-routes.ts` for API endpoints, skill reader methods added to `CWReader`, new `Skills.tsx` page in console with list/editor/explore views. CW gets account-level skill symlinks on session start.

**Tech Stack:** Hono (API routes), Preact (UI), simple YAML frontmatter parser (no external dep), skills.sh API for discovery, `npx skills` CLI for installation.

---

### Task 1: Add skill types to cw-types.ts

**Files:**
- Modify: `packages/core/src/cw-types.ts`
- Test: `packages/core/src/cw-routes.test.ts` (types are used indirectly by later tasks)

- [ ] **Step 1: Add SkillEntry and SkillDetail interfaces**

Add at the end of `packages/core/src/cw-types.ts`:

```ts
export type SkillScope = 'global' | 'account' | 'project'

export interface SkillEntry {
  name: string
  dirName: string
  scope: SkillScope
  scopeRef: string
  description: string
  domain?: string
  triggers?: string
  hasReferences: boolean
}

export interface SkillDetail {
  name: string
  scope: SkillScope
  scopeRef: string
  frontmatter: Record<string, unknown>
  body: string
  references: { name: string; content: string }[]
}

export interface ExploreResult {
  name: string
  slug: string
  installs: number
  source: 'skills.sh'
  url: string
  repo: string
}
```

- [ ] **Step 2: Export new types from index.ts**

Add to `packages/core/src/index.ts`:

```ts
export type { SkillScope, SkillEntry, SkillDetail, ExploreResult } from './cw-types.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/cw-types.ts packages/core/src/index.ts
git commit -m "feat(core): add skill type definitions"
```

---

### Task 2: Add skill reader methods to CWReader

**Files:**
- Modify: `packages/core/src/cw-reader.ts`
- Create: `packages/core/src/cw-reader.test.ts` (add tests to existing file)

- [ ] **Step 1: Write failing tests for parseFrontmatter, getSkills, getSkill, getSkillDir**

Add to `packages/core/src/cw-reader.test.ts`. First check the existing test structure — tests use a `TEST_CW` directory with fixtures created in `beforeAll`. Add a new `describe('Skills')` block.

Create test fixture skills in `beforeAll`:

```ts
// Inside the existing beforeAll, add:
// Global skill fixture
const globalSkillDir = join(TEST_HOME, '.claude', 'skills', 'test-skill')
mkdirSync(join(globalSkillDir, 'references'), { recursive: true })
writeFileSync(join(globalSkillDir, 'SKILL.md'), [
  '---',
  'name: test-skill',
  'description: A test skill for unit tests',
  'metadata:',
  '  domain: testing',
  '  triggers: test, unit test',
  '---',
  '',
  '# Test Skill',
  '',
  'This is the skill body.',
].join('\n'))
writeFileSync(join(globalSkillDir, 'references', 'checklist.md'), '# Checklist\n- Item 1')

// Account skill fixture
const acctSkillDir = join(TEST_CW, 'accounts', 'default', 'skills', 'acct-skill')
mkdirSync(acctSkillDir, { recursive: true })
writeFileSync(join(acctSkillDir, 'SKILL.md'), [
  '---',
  'name: acct-skill',
  'description: An account-level skill',
  '---',
  '',
  '# Account Skill',
].join('\n'))
```

Tests:

```ts
describe('Skills', () => {
  it('getSkills returns global skills', () => {
    const skills = reader.getSkills()
    const skill = skills.find(s => s.dirName === 'test-skill')
    expect(skill).toBeDefined()
    expect(skill!.scope).toBe('global')
    expect(skill!.name).toBe('test-skill')
    expect(skill!.description).toBe('A test skill for unit tests')
    expect(skill!.domain).toBe('testing')
    expect(skill!.hasReferences).toBe(true)
  })

  it('getSkills includes account skills when account provided', () => {
    const skills = reader.getSkills('default')
    const acct = skills.find(s => s.dirName === 'acct-skill')
    expect(acct).toBeDefined()
    expect(acct!.scope).toBe('account')
    expect(acct!.scopeRef).toBe('default')
  })

  it('getSkill returns full detail with references', () => {
    const detail = reader.getSkill('global', '', 'test-skill')
    expect(detail).not.toBeNull()
    expect(detail!.body).toContain('# Test Skill')
    expect(detail!.frontmatter.name).toBe('test-skill')
    expect(detail!.references).toHaveLength(1)
    expect(detail!.references[0].name).toBe('checklist.md')
  })

  it('getSkillDir resolves paths correctly', () => {
    const globalDir = reader.getSkillDir('global', '', 'test-skill')
    expect(globalDir).toContain('.claude/skills/test-skill')

    const acctDir = reader.getSkillDir('account', 'default', 'acct-skill')
    expect(acctDir).toContain('accounts/default/skills/acct-skill')
  })

  it('getSkill returns null for nonexistent skill', () => {
    expect(reader.getSkill('global', '', 'nonexistent')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx turbo test --filter=@forge-dev/core
```

Expected: FAIL — `getSkills`, `getSkill`, `getSkillDir` not defined on CWReader.

- [ ] **Step 3: Implement parseFrontmatter helper**

Add a private method to `CWReader` in `packages/core/src/cw-reader.ts` (before `getProjects`):

```ts
/** Parse YAML frontmatter from a markdown string. Returns { frontmatter, body }. */
private parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const fm: Record<string, unknown> = {}
  const metadata: Record<string, unknown> = {}
  let inMetadata = false

  for (const line of match[1].split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed === 'metadata:') {
      inMetadata = true
      continue
    }

    const kvMatch = line.match(/^(\s*)(\w[\w-]*):\s*(.*)$/)
    if (!kvMatch) continue

    const indent = kvMatch[1].length
    const key = kvMatch[2]
    let value: string | boolean | number = kvMatch[3].trim()

    // Strip quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (indent > 0 && inMetadata) {
      metadata[key] = value
    } else {
      inMetadata = false
      fm[key] = value
    }
  }

  if (Object.keys(metadata).length > 0) fm.metadata = metadata
  return { frontmatter: fm, body: match[2].trim() }
}
```

- [ ] **Step 4: Implement getSkillDir**

Add to `CWReader`:

```ts
getSkillDir(scope: 'global' | 'account' | 'project', scopeRef: string, name: string): string {
  const home = process.env.HOME ?? ''
  if (scope === 'global') return join(home, '.claude', 'skills', name)
  if (scope === 'account') return join(this.cwDir, 'accounts', scopeRef, 'skills', name)
  // project
  const projects = this.getProjects()
  const projPath = projects[scopeRef]?.path ?? ''
  return join(projPath, '.claude', 'skills', name)
}
```

- [ ] **Step 5: Implement getSkills**

Add to `CWReader`:

```ts
getSkills(account?: string, project?: string): SkillEntry[] {
  const home = process.env.HOME ?? ''
  const skills: SkillEntry[] = []

  const scanDir = (dir: string, scope: 'global' | 'account' | 'project', scopeRef: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillFile = join(dir, entry.name, 'SKILL.md')
      if (!existsSync(skillFile)) continue
      try {
        const { frontmatter } = this.parseFrontmatter(readFileSync(skillFile, 'utf-8'))
        const meta = (frontmatter.metadata ?? {}) as Record<string, string>
        const refsDir = join(dir, entry.name, 'references')
        skills.push({
          name: String(frontmatter.name ?? entry.name),
          dirName: entry.name,
          scope,
          scopeRef,
          description: String(frontmatter.description ?? ''),
          domain: meta.domain,
          triggers: meta.triggers,
          hasReferences: existsSync(refsDir) && readdirSync(refsDir).length > 0,
        })
      } catch { /* skip corrupt skill files */ }
    }
  }

  scanDir(join(home, '.claude', 'skills'), 'global', '')
  if (account) scanDir(join(this.cwDir, 'accounts', account, 'skills'), 'account', account)
  if (project) {
    const projects = this.getProjects()
    const projPath = projects[project]?.path
    if (projPath) scanDir(join(projPath, '.claude', 'skills'), 'project', project)
  }

  return skills
}
```

- [ ] **Step 6: Implement getSkill**

Add to `CWReader`:

```ts
getSkill(scope: 'global' | 'account' | 'project', scopeRef: string, name: string): SkillDetail | null {
  const dir = this.getSkillDir(scope, scopeRef, name)
  const skillFile = join(dir, 'SKILL.md')
  if (!existsSync(skillFile)) return null

  const { frontmatter, body } = this.parseFrontmatter(readFileSync(skillFile, 'utf-8'))
  const references: { name: string; content: string }[] = []
  const refsDir = join(dir, 'references')
  if (existsSync(refsDir)) {
    for (const f of readdirSync(refsDir).filter(f => f.endsWith('.md'))) {
      references.push({ name: f, content: readFileSync(join(refsDir, f), 'utf-8') })
    }
  }

  return { name: String(frontmatter.name ?? name), scope, scopeRef, frontmatter, body, references }
}
```

Import `SkillEntry` and `SkillDetail` from `./cw-types.js` at the top.

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx turbo test --filter=@forge-dev/core
```

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/cw-reader.ts packages/core/src/cw-reader.test.ts
git commit -m "feat(core): add skill reader methods to CWReader"
```

---

### Task 3: Create skill API routes

**Files:**
- Create: `packages/core/src/skill-routes.ts`
- Create: `packages/core/src/skill-routes.test.ts`
- Modify: `packages/core/src/server.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for skill CRUD endpoints**

Create `packages/core/src/skill-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Hono } from 'hono'
import { skillRoutes } from './skill-routes.js'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TEST_HOME = join(import.meta.dirname, '../.test-skills-home')
const TEST_CW = join(TEST_HOME, '.cw')

describe('Skill Routes', () => {
  let app: Hono

  beforeAll(() => {
    process.env.HOME = TEST_HOME

    // Global skill
    const globalDir = join(TEST_HOME, '.claude', 'skills', 'my-skill')
    mkdirSync(join(globalDir, 'references'), { recursive: true })
    writeFileSync(join(globalDir, 'SKILL.md'), '---\nname: my-skill\ndescription: Test skill\n---\n\n# My Skill\nBody here.')
    writeFileSync(join(globalDir, 'references', 'ref.md'), '# Ref')

    // Account skill
    mkdirSync(join(TEST_CW, 'accounts', 'default', 'skills', 'acct-sk'), { recursive: true })
    writeFileSync(join(TEST_CW, 'accounts', 'default', 'skills', 'acct-sk', 'SKILL.md'), '---\nname: acct-sk\ndescription: Account skill\n---\n\nBody.')

    // Projects
    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({}))

    const reader = new CWReader(TEST_CW)
    app = new Hono()
    app.route('/api/skills', skillRoutes(reader))
  })

  afterAll(() => {
    rmSync(TEST_HOME, { recursive: true, force: true })
    delete process.env.HOME
  })

  it('GET /api/skills lists skills across scopes', async () => {
    const res = await app.request('/api/skills?account=default')
    expect(res.status).toBe(200)
    const body = await res.json() as unknown[]
    expect(body.length).toBeGreaterThanOrEqual(2)
  })

  it('GET /api/skills/global/my-skill returns detail', async () => {
    const res = await app.request('/api/skills/global/my-skill')
    expect(res.status).toBe(200)
    const body = await res.json() as { name: string; body: string; references: unknown[] }
    expect(body.name).toBe('my-skill')
    expect(body.body).toContain('# My Skill')
    expect(body.references).toHaveLength(1)
  })

  it('POST /api/skills creates a new skill', async () => {
    const res = await app.request('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global', name: 'new-skill',
        content: '---\nname: new-skill\ndescription: Fresh\n---\n\n# New'
      })
    })
    expect(res.status).toBe(201)
    const skillPath = join(TEST_HOME, '.claude', 'skills', 'new-skill', 'SKILL.md')
    expect(existsSync(skillPath)).toBe(true)
  })

  it('PUT /api/skills/global/my-skill updates content', async () => {
    const res = await app.request('/api/skills/global/my-skill', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '---\nname: my-skill\ndescription: Updated\n---\n\n# Updated' })
    })
    expect(res.status).toBe(200)
    const content = readFileSync(join(TEST_HOME, '.claude', 'skills', 'my-skill', 'SKILL.md'), 'utf-8')
    expect(content).toContain('Updated')
  })

  it('PUT reference file creates/updates it', async () => {
    const res = await app.request('/api/skills/global/my-skill/references/new-ref.md', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# New Reference' })
    })
    expect(res.status).toBe(200)
    expect(existsSync(join(TEST_HOME, '.claude', 'skills', 'my-skill', 'references', 'new-ref.md'))).toBe(true)
  })

  it('DELETE reference file removes it', async () => {
    const res = await app.request('/api/skills/global/my-skill/references/new-ref.md', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(existsSync(join(TEST_HOME, '.claude', 'skills', 'my-skill', 'references', 'new-ref.md'))).toBe(false)
  })

  it('DELETE /api/skills/global/new-skill removes skill', async () => {
    const res = await app.request('/api/skills/global/new-skill', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(existsSync(join(TEST_HOME, '.claude', 'skills', 'new-skill'))).toBe(false)
  })

  it('GET nonexistent skill returns 404', async () => {
    const res = await app.request('/api/skills/global/nope')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx turbo test --filter=@forge-dev/core
```

Expected: FAIL — `skill-routes.js` does not exist.

- [ ] **Step 3: Implement skill-routes.ts**

Create `packages/core/src/skill-routes.ts`:

```ts
import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'

export function skillRoutes(reader: CWReader): Hono {
  const app = new Hono()

  // List all skills
  app.get('/', (c) => {
    const account = c.req.query('account')
    const project = c.req.query('project')
    return c.json(reader.getSkills(account, project))
  })

  // Get skill detail — global
  app.get('/global/:name', (c) => {
    const detail = reader.getSkill('global', '', c.req.param('name'))
    return detail ? c.json(detail) : c.json({ error: 'Not found' }, 404)
  })

  // Get skill detail — account
  app.get('/account/:account/:name', (c) => {
    const detail = reader.getSkill('account', c.req.param('account'), c.req.param('name'))
    return detail ? c.json(detail) : c.json({ error: 'Not found' }, 404)
  })

  // Get skill detail — project
  app.get('/project/:project/:name', (c) => {
    const detail = reader.getSkill('project', c.req.param('project'), c.req.param('name'))
    return detail ? c.json(detail) : c.json({ error: 'Not found' }, 404)
  })

  // Create skill
  app.post('/', async (c) => {
    const { scope, scopeRef, name, content } = await c.req.json<{
      scope: 'global' | 'account' | 'project'; scopeRef?: string; name: string; content: string
    }>()
    const dir = reader.getSkillDir(scope, scopeRef ?? '', name)
    if (existsSync(join(dir, 'SKILL.md'))) {
      return c.json({ error: 'Skill already exists' }, 409)
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), content)
    return c.json({ ok: true, path: dir }, 201)
  })

  // Update skill — supports global/:name, account/:account/:name, project/:project/:name
  for (const pattern of ['global/:name', 'account/:account/:name', 'project/:project/:name']) {
    const scopeFromPattern = pattern.startsWith('global') ? 'global' as const
      : pattern.startsWith('account') ? 'account' as const : 'project' as const

    app.put(`/${pattern}`, async (c) => {
      const name = c.req.param('name')
      const scopeRef = c.req.param('account') ?? c.req.param('project') ?? ''
      const dir = reader.getSkillDir(scopeFromPattern, scopeRef, name)
      const skillFile = join(dir, 'SKILL.md')
      if (!existsSync(skillFile)) return c.json({ error: 'Not found' }, 404)
      const { content } = await c.req.json<{ content: string }>()
      writeFileSync(skillFile, content)
      return c.json({ ok: true })
    })

    // Update reference
    app.put(`/${pattern}/references/:filename`, async (c) => {
      const name = c.req.param('name')
      const scopeRef = c.req.param('account') ?? c.req.param('project') ?? ''
      const filename = c.req.param('filename')
      const dir = reader.getSkillDir(scopeFromPattern, scopeRef, name)
      if (!existsSync(join(dir, 'SKILL.md'))) return c.json({ error: 'Skill not found' }, 404)
      const refsDir = join(dir, 'references')
      mkdirSync(refsDir, { recursive: true })
      const { content } = await c.req.json<{ content: string }>()
      writeFileSync(join(refsDir, filename), content)
      return c.json({ ok: true })
    })

    // Delete reference
    app.delete(`/${pattern}/references/:filename`, (c) => {
      const name = c.req.param('name')
      const scopeRef = c.req.param('account') ?? c.req.param('project') ?? ''
      const filename = c.req.param('filename')
      const dir = reader.getSkillDir(scopeFromPattern, scopeRef, name)
      const refPath = join(dir, 'references', filename)
      if (!existsSync(refPath)) return c.json({ error: 'Not found' }, 404)
      unlinkSync(refPath)
      return c.json({ ok: true })
    })

    // Delete skill
    app.delete(`/${pattern}`, (c) => {
      const name = c.req.param('name')
      const scopeRef = c.req.param('account') ?? c.req.param('project') ?? ''
      const dir = reader.getSkillDir(scopeFromPattern, scopeRef, name)
      if (!existsSync(dir)) return c.json({ error: 'Not found' }, 404)
      rmSync(dir, { recursive: true, force: true })
      return c.json({ ok: true })
    })
  }

  // Explore — proxy skills.sh search
  app.get('/explore', async (c) => {
    const q = c.req.query('q') ?? ''
    if (!q) return c.json([])
    try {
      const res = await globalThis.fetch(`https://skills.sh/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json() as { results?: Array<{ name: string; id: string; installs: number; source?: { repo: string } }> }
      const results = (data.results ?? []).map(r => ({
        name: r.name ?? r.id,
        slug: r.id,
        installs: r.installs ?? 0,
        source: 'skills.sh' as const,
        url: `https://skills.sh/${(r.id ?? '').replace('@', '/')}`,
        repo: r.source?.repo ?? r.id?.split('@')[0] ?? '',
      }))
      return c.json(results)
    } catch {
      return c.json([])
    }
  })

  // Install from skills.sh
  app.post('/install', async (c) => {
    const { slug, scope, scopeRef } = await c.req.json<{
      slug: string; scope: 'global' | 'account' | 'project'; scopeRef?: string
    }>()

    if (scope === 'global') {
      // Use skills CLI for global install
      const { execSync } = await import('node:child_process')
      try {
        execSync(`npx skills add ${slug} --global --yes --agent claude`, { timeout: 30000 })
        return c.json({ ok: true })
      } catch (err) {
        return c.json({ error: 'Installation failed' }, 500)
      }
    }

    // For account/project scope: fetch from GitHub and write locally
    const [repo, skillName] = slug.split('@')
    if (!repo || !skillName) return c.json({ error: 'Invalid slug' }, 400)

    try {
      const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${skillName}/SKILL.md`
      const res = await globalThis.fetch(rawUrl)
      if (!res.ok) return c.json({ error: 'Failed to fetch skill from GitHub' }, 502)
      const content = await res.text()

      const dir = reader.getSkillDir(scope, scopeRef ?? '', skillName)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), content)
      return c.json({ ok: true, path: dir })
    } catch {
      return c.json({ error: 'Installation failed' }, 500)
    }
  })

  return app
}
```

- [ ] **Step 4: Mount routes in server.ts**

In `packages/core/src/server.ts`, add import at line 17 (after prototypeRoutes):

```ts
import { skillRoutes } from './skill-routes.js'
```

Add route mount after the cwRoutes line (after line 46):

```ts
app.route('/api/skills', skillRoutes(cwReader))
```

- [ ] **Step 5: Export from index.ts**

Add to `packages/core/src/index.ts`:

```ts
export { skillRoutes } from './skill-routes.js'
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx turbo test --filter=@forge-dev/core
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/skill-routes.ts packages/core/src/skill-routes.test.ts packages/core/src/server.ts packages/core/src/index.ts
git commit -m "feat(core): add skill CRUD and explore API routes"
```

---

### Task 4: Build Skills page — list view

**Files:**
- Create: `packages/console/src/pages/Skills.tsx`
- Modify: `packages/console/src/app.tsx`

- [ ] **Step 1: Create Skills.tsx with skill list**

Create `packages/console/src/pages/Skills.tsx`:

```tsx
import { type FunctionComponent } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import type { SkillEntry, SkillDetail } from '@forge-dev/core'

interface SkillsProps {
  accounts: string[]
  projects: Record<string, { path: string; account: string }>
  onBack: () => void
  onCreateWithAI?: (scope: string, scopeRef: string, description: string) => void
}

const SCOPE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  global: { bg: 'rgba(99,102,241,0.1)', color: '#6366f1', label: 'Global' },
  account: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', label: 'Account' },
  project: { bg: 'rgba(16,185,129,0.1)', color: '#10b981', label: 'Project' },
}

export const Skills: FunctionComponent<SkillsProps> = ({ accounts, projects, onBack, onCreateWithAI }) => {
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterScope, setFilterScope] = useState<string>('')

  // Editor state
  const [editing, setEditing] = useState<{ scope: string; scopeRef: string; name: string } | null>(null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [activeFile, setActiveFile] = useState<string>('SKILL.md')
  const [editorContent, setEditorContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Explore state
  const [showExplore, setShowExplore] = useState(false)
  const [exploreQuery, setExploreQuery] = useState('')
  const [exploreResults, setExploreResults] = useState<Array<{ name: string; slug: string; installs: number; url: string; repo: string }>>([])
  const [exploring, setExploring] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)

  // Create state
  const [showCreate, setShowCreate] = useState(false)
  const [createScope, setCreateScope] = useState<'global' | 'account' | 'project'>('global')
  const [createScopeRef, setCreateScopeRef] = useState('')
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')

  const fetchSkills = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (accounts[0]) params.set('account', accounts[0])
      const projectNames = Object.keys(projects)
      if (projectNames[0]) params.set('project', projectNames[0])
      const res = await fetch(`/api/skills?${params}`)
      setSkills(await res.json() as SkillEntry[])
    } catch {
      showToast('Failed to load skills', 'error')
    } finally {
      setLoading(false)
    }
  }, [accounts, projects])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  const filtered = skills.filter(s => {
    if (filterScope && s.scope !== filterScope) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const grouped = {
    global: filtered.filter(s => s.scope === 'global'),
    account: filtered.filter(s => s.scope === 'account'),
    project: filtered.filter(s => s.scope === 'project'),
  }

  // --- Editor ---
  const openEditor = async (skill: SkillEntry) => {
    const scopePath = skill.scope === 'global' ? 'global' : skill.scope === 'account' ? `account/${skill.scopeRef}` : `project/${skill.scopeRef}`
    const res = await fetch(`/api/skills/${scopePath}/${skill.dirName}`)
    if (!res.ok) { showToast('Failed to load skill', 'error'); return }
    const d = await res.json() as SkillDetail
    setDetail(d)
    setEditing({ scope: skill.scope, scopeRef: skill.scopeRef, name: skill.dirName })
    setActiveFile('SKILL.md')
    setEditorContent(d.body)
    setDirty(false)
  }

  const handleSave = async () => {
    if (!editing || !detail) return
    setSaving(true)
    try {
      const scopePath = editing.scope === 'global' ? 'global' : editing.scope === 'account' ? `account/${editing.scopeRef}` : `project/${editing.scopeRef}`
      if (activeFile === 'SKILL.md') {
        // Reconstruct full SKILL.md: frontmatter + body
        const fmLines = ['---']
        for (const [k, v] of Object.entries(detail.frontmatter)) {
          if (k === 'metadata') {
            fmLines.push('metadata:')
            for (const [mk, mv] of Object.entries(v as Record<string, unknown>)) {
              fmLines.push(`  ${mk}: ${mv}`)
            }
          } else {
            fmLines.push(`${k}: ${v}`)
          }
        }
        fmLines.push('---')
        const fullContent = fmLines.join('\n') + '\n\n' + editorContent
        await fetch(`/api/skills/${scopePath}/${editing.name}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: fullContent })
        })
      } else {
        await fetch(`/api/skills/${scopePath}/${editing.name}/references/${activeFile}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editorContent })
        })
      }
      showToast('Saved', 'success')
      setDirty(false)
      fetchSkills()
    } catch {
      showToast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    const scopePath = editing.scope === 'global' ? 'global' : editing.scope === 'account' ? `account/${editing.scopeRef}` : `project/${editing.scopeRef}`
    await fetch(`/api/skills/${scopePath}/${editing.name}`, { method: 'DELETE' })
    setEditing(null)
    setDetail(null)
    showToast('Skill deleted', 'info')
    fetchSkills()
  }

  const handleDeleteRef = async (filename: string) => {
    if (!editing) return
    const scopePath = editing.scope === 'global' ? 'global' : editing.scope === 'account' ? `account/${editing.scopeRef}` : `project/${editing.scopeRef}`
    await fetch(`/api/skills/${scopePath}/${editing.name}/references/${filename}`, { method: 'DELETE' })
    showToast('Reference deleted', 'info')
    // Reload detail
    const res = await fetch(`/api/skills/${scopePath}/${editing.name}`)
    const d = await res.json() as SkillDetail
    setDetail(d)
    setActiveFile('SKILL.md')
    setEditorContent(d.body)
  }

  const handleAddRef = async () => {
    const name = prompt('Reference filename (e.g. checklist.md):')
    if (!name || !editing) return
    const scopePath = editing.scope === 'global' ? 'global' : editing.scope === 'account' ? `account/${editing.scopeRef}` : `project/${editing.scopeRef}`
    await fetch(`/api/skills/${scopePath}/${editing.name}/references/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `# ${name.replace('.md', '')}\n` })
    })
    const res = await fetch(`/api/skills/${scopePath}/${editing.name}`)
    const d = await res.json() as SkillDetail
    setDetail(d)
    setActiveFile(name)
    setEditorContent(`# ${name.replace('.md', '')}\n`)
  }

  // --- Explore ---
  const handleExplore = async () => {
    if (!exploreQuery.trim()) return
    setExploring(true)
    try {
      const res = await fetch(`/api/skills/explore?q=${encodeURIComponent(exploreQuery)}`)
      setExploreResults(await res.json() as typeof exploreResults)
    } catch {
      showToast('Search failed', 'error')
    } finally {
      setExploring(false)
    }
  }

  const handleInstall = async (slug: string, scope: 'global' | 'account' | 'project', scopeRef?: string) => {
    setInstalling(slug)
    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, scope, scopeRef })
      })
      const result = await res.json() as { ok?: boolean; error?: string }
      if (result.ok) {
        showToast('Skill installed', 'success')
        fetchSkills()
      } else {
        showToast(result.error ?? 'Install failed', 'error')
      }
    } catch {
      showToast('Install failed', 'error')
    } finally {
      setInstalling(null)
    }
  }

  // --- Create ---
  const handleCreateManual = async () => {
    if (!createName.trim()) return
    const content = [
      '---',
      `name: ${createName}`,
      `description: ${createDesc}`,
      '---',
      '',
      `# ${createName}`,
      '',
      createDesc || 'Skill description here.',
    ].join('\n')
    const res = await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: createScope, scopeRef: createScopeRef, name: createName, content })
    })
    const result = await res.json() as { ok?: boolean; error?: string }
    if (result.ok) {
      showToast('Skill created', 'success')
      setShowCreate(false)
      setCreateName('')
      setCreateDesc('')
      fetchSkills()
    } else {
      showToast(result.error ?? 'Failed', 'error')
    }
  }

  const handleCreateWithAI = () => {
    if (!createDesc.trim() || !onCreateWithAI) return
    onCreateWithAI(createScope, createScopeRef, createDesc)
    setShowCreate(false)
  }

  // --- Render: Editor view ---
  if (editing && detail) {
    const scopeCfg = SCOPE_COLORS[editing.scope]
    return (
      <div>
        <div class="flex items-center gap-3 mb-4">
          <button
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={() => { setEditing(null); setDetail(null) }}
          >
            ← Skills
          </button>
          <span class="text-lg font-bold">{detail.name}</span>
          <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{ color: scopeCfg.color, backgroundColor: scopeCfg.bg }}>{scopeCfg.label}</span>
          {editing.scopeRef && <span class="text-xs text-forge-muted">{editing.scopeRef}</span>}
          <div class="flex-1" />
          {dirty && <span class="text-xs text-forge-warning">Unsaved</span>}
          <ActionButton label={saving ? 'Saving...' : 'Save'} variant="primary" loading={saving} onClick={handleSave} />
          <button class="text-xs text-forge-error hover:underline" onClick={handleDelete}>Delete</button>
        </div>
        <div class="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
          {/* Left: metadata + files */}
          <div class="w-56 shrink-0 space-y-4">
            <div class="rounded-lg border border-forge-border p-3 space-y-2 text-xs">
              <div><span class="text-forge-muted">Name:</span> {detail.frontmatter.name as string}</div>
              <div><span class="text-forge-muted">Description:</span> {(detail.frontmatter.description as string ?? '').slice(0, 100)}</div>
              {(detail.frontmatter.metadata as Record<string, string>)?.domain && (
                <div><span class="text-forge-muted">Domain:</span> {(detail.frontmatter.metadata as Record<string, string>).domain}</div>
              )}
              {(detail.frontmatter.metadata as Record<string, string>)?.triggers && (
                <div><span class="text-forge-muted">Triggers:</span> {(detail.frontmatter.metadata as Record<string, string>).triggers}</div>
              )}
            </div>
            <div class="rounded-lg border border-forge-border p-3 text-xs space-y-1">
              <div class="font-bold text-forge-muted uppercase tracking-wider mb-2">Files</div>
              <button
                class={`block w-full text-left px-2 py-1 rounded ${activeFile === 'SKILL.md' ? 'bg-forge-accent text-white' : 'hover:bg-forge-surface'}`}
                onClick={() => { setActiveFile('SKILL.md'); setEditorContent(detail.body); setDirty(false) }}
              >
                SKILL.md
              </button>
              {detail.references.map(r => (
                <div key={r.name} class="flex items-center group">
                  <button
                    class={`flex-1 text-left px-2 py-1 rounded truncate ${activeFile === r.name ? 'bg-forge-accent text-white' : 'hover:bg-forge-surface'}`}
                    onClick={() => { setActiveFile(r.name); setEditorContent(r.content); setDirty(false) }}
                  >
                    {r.name}
                  </button>
                  <button class="text-forge-error text-[10px] opacity-0 group-hover:opacity-100 px-1" onClick={() => handleDeleteRef(r.name)}>×</button>
                </div>
              ))}
              <button class="text-forge-accent text-[10px] hover:underline mt-1" onClick={handleAddRef}>+ Add reference</button>
            </div>
          </div>
          {/* Right: editor */}
          <textarea
            class="flex-1 px-4 py-3 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm font-mono resize-none focus:border-forge-accent focus:outline-none"
            value={editorContent}
            onInput={(e) => { setEditorContent((e.target as HTMLTextAreaElement).value); setDirty(true) }}
          />
        </div>
      </div>
    )
  }

  // --- Render: Explore panel ---
  if (showExplore) {
    return (
      <div>
        <div class="flex items-center gap-3 mb-6">
          <button
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={() => setShowExplore(false)}
          >
            ← Skills
          </button>
          <h2 class="text-xl font-bold">Explore Skills</h2>
        </div>
        <div class="flex gap-2 mb-6">
          <input
            type="text"
            value={exploreQuery}
            onInput={(e) => setExploreQuery((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && handleExplore()}
            placeholder="Search skills.sh..."
            class="flex-1 px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
          />
          <ActionButton label={exploring ? 'Searching...' : 'Search'} variant="primary" loading={exploring} onClick={handleExplore} />
        </div>
        <div class="grid gap-3">
          {exploreResults.map(r => (
            <div key={r.slug} class="rounded-lg border border-forge-border p-4 flex items-center gap-4">
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-sm">{r.name}</div>
                <div class="text-xs text-forge-muted truncate">{r.repo}</div>
                <div class="text-xs text-forge-muted">{r.installs.toLocaleString()} installs</div>
              </div>
              <ActionButton
                label={installing === r.slug ? 'Installing...' : 'Install'}
                variant="primary"
                loading={installing === r.slug}
                onClick={() => handleInstall(r.slug, 'global')}
              />
            </div>
          ))}
          {exploreResults.length === 0 && exploreQuery && !exploring && (
            <div class="text-center text-forge-muted py-8 text-sm">No results found.</div>
          )}
        </div>
      </div>
    )
  }

  // --- Render: Create modal ---
  if (showCreate) {
    return (
      <div>
        <div class="flex items-center gap-3 mb-6">
          <button
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
            style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
            onClick={() => setShowCreate(false)}
          >
            ← Skills
          </button>
          <h2 class="text-xl font-bold">New Skill</h2>
        </div>
        <div class="max-w-lg space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Scope</label>
            <div class="flex gap-2">
              {(['global', 'account', 'project'] as const).map(s => (
                <button
                  key={s}
                  class={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${createScope === s ? 'text-forge-accent' : 'border-forge-border bg-forge-surface text-forge-muted'}`}
                  style={createScope === s ? { backgroundColor: SCOPE_COLORS[s].bg, borderColor: SCOPE_COLORS[s].color } : undefined}
                  onClick={() => setCreateScope(s)}
                >
                  {SCOPE_COLORS[s].label}
                </button>
              ))}
            </div>
          </div>
          {createScope === 'account' && accounts.length > 0 && (
            <div>
              <label class="block text-sm font-medium mb-1">Account</label>
              <select
                class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm"
                value={createScopeRef}
                onChange={(e) => setCreateScopeRef((e.target as HTMLSelectElement).value)}
              >
                <option value="">Select...</option>
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          {createScope === 'project' && (
            <div>
              <label class="block text-sm font-medium mb-1">Project</label>
              <select
                class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm"
                value={createScopeRef}
                onChange={(e) => setCreateScopeRef((e.target as HTMLSelectElement).value)}
              >
                <option value="">Select...</option>
                {Object.keys(projects).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <div>
            <label class="block text-sm font-medium mb-1">Skill Name</label>
            <input
              type="text"
              value={createName}
              onInput={(e) => setCreateName((e.target as HTMLInputElement).value)}
              placeholder="e.g. django-expert"
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={createDesc}
              onInput={(e) => setCreateDesc((e.target as HTMLTextAreaElement).value)}
              placeholder="What should this skill do?"
              rows={4}
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
            />
          </div>
          <div class="flex gap-3">
            <ActionButton label="Create Manually" variant="secondary" onClick={handleCreateManual} disabled={!createName.trim()} />
            {onCreateWithAI && (
              <ActionButton label="Create with AI" variant="primary" onClick={handleCreateWithAI} disabled={!createDesc.trim()} />
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- Render: Main list ---
  return (
    <div>
      <div class="flex items-center gap-3 mb-6">
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
          style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
          onClick={onBack}
        >
          ← Back to tasks
        </button>
        <h2 class="text-xl font-bold">Skills</h2>
        <div class="flex-1" />
        <ActionButton label="Explore" variant="secondary" onClick={() => setShowExplore(true)} />
        <ActionButton label="+ New Skill" variant="primary" onClick={() => setShowCreate(true)} />
      </div>

      {/* Filters */}
      <div class="flex gap-2 mb-6">
        <input
          type="text"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          placeholder="Filter skills..."
          class="flex-1 px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
        />
        <select
          class="px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm"
          value={filterScope}
          onChange={(e) => setFilterScope((e.target as HTMLSelectElement).value)}
        >
          <option value="">All scopes</option>
          <option value="global">Global</option>
          <option value="account">Account</option>
          <option value="project">Project</option>
        </select>
      </div>

      {loading ? (
        <div class="py-20 text-center text-forge-muted">Loading skills...</div>
      ) : filtered.length === 0 ? (
        <div class="py-20 text-center text-forge-muted">
          {skills.length === 0 ? 'No skills found. Create one or explore skills.sh.' : 'No skills match your filter.'}
        </div>
      ) : (
        <div class="space-y-6">
          {(['global', 'account', 'project'] as const).map(scope => {
            const items = grouped[scope]
            if (items.length === 0) return null
            const cfg = SCOPE_COLORS[scope]
            return (
              <div key={scope}>
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-[10px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>{cfg.label}</span>
                  <span class="text-[10px] text-forge-muted">({items.length})</span>
                </div>
                <div class="grid gap-2">
                  {items.map(s => (
                    <button
                      key={`${s.scope}-${s.scopeRef}-${s.dirName}`}
                      class="w-full text-left rounded-lg border border-forge-border p-3 hover:border-forge-accent transition-colors cursor-pointer"
                      style={{ backgroundColor: 'var(--forge-surface)' }}
                      onClick={() => openEditor(s)}
                    >
                      <div class="flex items-center gap-2">
                        <span class="font-semibold text-sm">{s.name}</span>
                        {s.domain && (
                          <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: cfg.color, backgroundColor: cfg.bg }}>{s.domain}</span>
                        )}
                        {s.scopeRef && <span class="text-[10px] text-forge-muted">{s.scopeRef}</span>}
                        {s.hasReferences && <span class="text-[10px] text-forge-muted">+ refs</span>}
                      </div>
                      <div class="text-xs text-forge-muted mt-1 truncate">{s.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire Skills page into app.tsx**

In `packages/console/src/app.tsx`:

Add import at line 7 (after NewTask import):
```ts
import { Skills } from './pages/Skills.js'
```

Change `listView` type at line 83:
```ts
const [listView, setListView] = useState<'list' | 'new-task' | 'skills'>('list')
```

Add handler for "Create with AI" flow (after `handleStartPrototype`):
```ts
const handleCreateSkillWithAI = useCallback((scope: string, scopeRef: string, description: string) => {
  // TODO Task 5: spawn CW session with skill-creator prompt
  showToast('AI skill creation coming soon', 'info')
}, [])
```

In the list view render section, after the `NewTask` block (after line 235's closing `)`), add:
```tsx
) : listView === 'skills' ? (
  <Skills
    accounts={filters.accountNames}
    projects={projects}
    onBack={() => setListView('list')}
    onCreateWithAI={handleCreateSkillWithAI}
  />
```

Add a "Skills" button to the TaskList. Pass `onSkills` prop:

In the `<TaskList>` component usage, add a new prop:
```tsx
onSkills={() => setListView('skills')}
```

- [ ] **Step 3: Add onSkills prop to TaskList**

In `packages/console/src/pages/TaskList.tsx`, add `onSkills?: () => void` to the props interface (around line 105). Add a "Skills" button next to the "+ New Task" button:

```tsx
{onSkills && (
  <ActionButton label="Skills" variant="secondary" onClick={onSkills} />
)}
```

- [ ] **Step 4: Build and verify no TypeScript errors**

```bash
npx turbo build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/console/src/pages/Skills.tsx packages/console/src/app.tsx packages/console/src/pages/TaskList.tsx
git commit -m "feat(console): add Skills page with list, editor, explore, and create views"
```

---

### Task 5: "Create with AI" CW session flow

**Files:**
- Modify: `packages/console/src/app.tsx`

- [ ] **Step 1: Implement handleCreateSkillWithAI to spawn a CW session**

Replace the placeholder `handleCreateSkillWithAI` in `app.tsx`:

```ts
const handleCreateSkillWithAI = useCallback(async (scope: string, scopeRef: string, description: string) => {
  // Determine the target directory
  let targetDir = ''
  if (scope === 'global') targetDir = '~/.claude/skills/'
  else if (scope === 'account') targetDir = `~/.cw/accounts/${scopeRef}/skills/`
  else targetDir = `<project>/.claude/skills/`

  const taskName = `skill-${Date.now()}`
  const initDescription = [
    `Use the skill-creator skill to create a new Claude Code skill.`,
    ``,
    `The user wants: ${description}`,
    `Target scope: ${scope}${scopeRef ? ` (${scopeRef})` : ''}`,
    `Save location: ${targetDir}`,
    ``,
    `Before creating from scratch, search for existing similar skills:`,
    `1. Search skills.sh for related skills (WebSearch or WebFetch https://skills.sh/api/search?q=<keywords>)`,
    `2. Search GitHub for claude-code skill repos`,
    `3. Present what you find — let the user pick a base or start fresh`,
    ``,
    `Then use skill-creator to build/customize the skill and save it.`,
  ].join('\n')

  try {
    const res = await fetch('/api/cw/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'general',
        account: accounts[0] || 'default',
        description: initDescription,
      })
    })
    const result = await res.json() as { ok: boolean; session?: CWSession }
    if (result.ok && result.session) {
      tabs.openTab(result.session)
      setListView('list')
      showToast('AI skill creation session started', 'success')
    }
  } catch {
    showToast('Failed to start skill creation session', 'error')
  }
}, [accounts, tabs])
```

- [ ] **Step 2: Build and verify**

```bash
npx turbo build
```

- [ ] **Step 3: Commit**

```bash
git add packages/console/src/app.tsx
git commit -m "feat(console): implement Create with AI skill session flow"
```

---

### Task 6: CW — symlink account skills on session start

**Files:**
- Modify: `/Users/joselito/Workspace/personal/cw-repo/cw`

- [ ] **Step 1: Find the session start section in cw work**

In the `cw` script, after the session metadata is saved (around the `python3 -c "import json"` block that writes `session.json`, approximately line 1504-1530), add the account skills symlink logic.

- [ ] **Step 2: Add symlink logic after session setup**

Add after the session.json write block in the `work` function:

```bash
# ── Account skills: symlink into ~/.claude/skills/ for discovery ──
local acct_skills_dir="$acct_dir/skills"
if [[ -d "$acct_skills_dir" ]]; then
    for skill_dir in "$acct_skills_dir"/*/; do
        [[ -d "$skill_dir" ]] || continue
        local skill_name
        skill_name=$(basename "$skill_dir")
        local target="$HOME/.claude/skills/acct--${account}--${skill_name}"
        [[ -e "$target" ]] || ln -sf "$skill_dir" "$target"
    done
fi
```

- [ ] **Step 3: Add the same symlink logic to the review function**

Find the `review` function in the `cw` script (search for the review session setup section) and add the same block after session setup.

- [ ] **Step 4: Add cleanup in _space_done function**

In the `_space_done` function, add cleanup of account skill symlinks:

```bash
# Clean up account skill symlinks
for link in "$HOME/.claude/skills"/acct--*; do
    [[ -L "$link" ]] && rm -f "$link"
done
```

- [ ] **Step 5: Test manually**

```bash
mkdir -p ~/.cw/accounts/monoku/skills/test-symlink
echo -e "---\nname: test-symlink\ndescription: test\n---\n\n# Test" > ~/.cw/accounts/monoku/skills/test-symlink/SKILL.md
# Verify it exists
ls -la ~/.claude/skills/acct--* 2>/dev/null
# Start a cw session and check that the symlink appears
# Clean up after
rm -rf ~/.cw/accounts/monoku/skills/test-symlink
```

- [ ] **Step 6: Commit CW changes**

```bash
cd /Users/joselito/Workspace/personal/cw-repo
git add cw
git commit -m "feat(work): symlink account-level skills into ~/.claude/skills/ on session start"
```

---

### Task 7: Run all tests and verify build

**Files:**
- No new files — verification only

- [ ] **Step 1: Run full test suite in Forge**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/improve
npx turbo test
```

Expected: All tests pass.

- [ ] **Step 2: Run full build**

```bash
npx turbo build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Verify CW script syntax**

```bash
bash -n /Users/joselito/Workspace/personal/cw-repo/cw
```

Expected: No syntax errors.

---

### Task 8: Create PRs for both repos

**Files:**
- No code changes — git operations only

- [ ] **Step 1: Push Forge improve branch and create PR**

```bash
cd /Users/joselito/Workspace/personal/forge/.tasks/improve
git push -u origin improve
gh pr create --title "feat: skills management + description fix" --body "..."
```

- [ ] **Step 2: Push CW changes and create PR**

```bash
cd /Users/joselito/Workspace/personal/cw-repo
git checkout -b feat/skills-and-description
git push -u origin feat/skills-and-description
gh pr create --title "feat: description in init_prompt + account skill symlinks" --body "..."
```

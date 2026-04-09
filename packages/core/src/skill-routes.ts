import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import type { ExploreResult, SkillScope } from './cw-types.js'
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

type ScopePath =
  | { scope: 'global'; scopeRef: string; name: string }
  | { scope: 'account'; scopeRef: string; name: string }
  | { scope: 'project'; scopeRef: string; name: string }

function parseScopeParams(
  scope: SkillScope,
  params: Record<string, string>
): ScopePath {
  if (scope === 'global') {
    return { scope: 'global', scopeRef: 'global', name: params['name'] ?? '' }
  }
  if (scope === 'account') {
    return { scope: 'account', scopeRef: params['account'] ?? '', name: params['name'] ?? '' }
  }
  return { scope: 'project', scopeRef: params['project'] ?? '', name: params['name'] ?? '' }
}

export function skillRoutes(reader: CWReader): Hono {
  const app = new Hono()

  // GET / — list skills (optional ?account= ?project=)
  app.get('/', (c) => {
    const account = c.req.query('account')
    const project = c.req.query('project')
    return c.json(reader.getSkills(account, project))
  })

  // GET /global/:name — get global skill detail
  app.get('/global/:name', (c) => {
    const name = c.req.param('name')
    const skill = reader.getSkill('global', 'global', name)
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })

  // GET /account/:account/:name — get account skill detail
  app.get('/account/:account/:name', (c) => {
    const { account, name } = c.req.param()
    const skill = reader.getSkill('account', account, name)
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })

  // GET /project/:project/:name — get project skill detail
  app.get('/project/:project/:name', (c) => {
    const { project, name } = c.req.param()
    const skill = reader.getSkill('project', project, name)
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })

  // POST / — create skill
  app.post('/', async (c) => {
    const { scope, scopeRef, name, content } = await c.req.json<{
      scope: SkillScope
      scopeRef?: string
      name: string
      content: string
    }>()

    const ref = scopeRef ?? (scope === 'global' ? 'global' : '')
    const dir = reader.getSkillDir(scope, ref, name)

    if (existsSync(join(dir, 'SKILL.md'))) {
      return c.json({ error: 'Skill already exists' }, 409)
    }

    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8')
      return c.json({ ok: true, dir })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return c.json({ error: `Failed to create skill: ${message}` }, 500)
    }
  })

  // PUT/DELETE helpers registered for all three scope patterns
  const scopePatterns: Array<{ pattern: string; scope: SkillScope; paramKey?: string }> = [
    { pattern: '/global/:name', scope: 'global' },
    { pattern: '/account/:account/:name', scope: 'account', paramKey: 'account' },
    { pattern: '/project/:project/:name', scope: 'project', paramKey: 'project' },
  ]

  for (const { pattern, scope, paramKey } of scopePatterns) {
    // PUT /{scope-path}/:name — update SKILL.md
    app.put(pattern, async (c) => {
      const params = c.req.param() as Record<string, string>
      const scopeRef = paramKey ? (params[paramKey] ?? '') : 'global'
      const name = params['name'] ?? ''
      const dir = reader.getSkillDir(scope, scopeRef, name)
      const skillMd = join(dir, 'SKILL.md')

      if (!existsSync(skillMd)) {
        return c.json({ error: 'Skill not found' }, 404)
      }

      const { content } = await c.req.json<{ content: string }>()
      try {
        writeFileSync(skillMd, content, 'utf-8')
        return c.json({ ok: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return c.json({ error: `Failed to update skill: ${message}` }, 500)
      }
    })

    // PUT /{scope-path}/:name/references/:filename — create/update reference file
    app.put(`${pattern}/references/:filename`, async (c) => {
      const params = c.req.param() as Record<string, string>
      const scopeRef = paramKey ? (params[paramKey] ?? '') : 'global'
      const name = params['name'] ?? ''
      const filename = params['filename'] ?? ''
      const dir = reader.getSkillDir(scope, scopeRef, name)
      const skillMd = join(dir, 'SKILL.md')

      if (!existsSync(skillMd)) {
        return c.json({ error: 'Skill not found' }, 404)
      }

      const { content } = await c.req.json<{ content: string }>()
      try {
        const refsDir = join(dir, 'references')
        mkdirSync(refsDir, { recursive: true })
        writeFileSync(join(refsDir, filename), content, 'utf-8')
        return c.json({ ok: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return c.json({ error: `Failed to write reference: ${message}` }, 500)
      }
    })

    // DELETE /{scope-path}/:name/references/:filename — delete reference file
    app.delete(`${pattern}/references/:filename`, (c) => {
      const params = c.req.param() as Record<string, string>
      const scopeRef = paramKey ? (params[paramKey] ?? '') : 'global'
      const name = params['name'] ?? ''
      const filename = params['filename'] ?? ''
      const dir = reader.getSkillDir(scope, scopeRef, name)
      const refFile = join(dir, 'references', filename)

      if (!existsSync(refFile)) {
        return c.json({ error: 'Reference not found' }, 404)
      }

      try {
        unlinkSync(refFile)
        return c.json({ ok: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return c.json({ error: `Failed to delete reference: ${message}` }, 500)
      }
    })

    // DELETE /{scope-path}/:name — delete entire skill directory
    app.delete(pattern, (c) => {
      const params = c.req.param() as Record<string, string>
      const scopeRef = paramKey ? (params[paramKey] ?? '') : 'global'
      const name = params['name'] ?? ''
      const dir = reader.getSkillDir(scope, scopeRef, name)

      if (!existsSync(join(dir, 'SKILL.md'))) {
        return c.json({ error: 'Skill not found' }, 404)
      }

      try {
        rmSync(dir, { recursive: true, force: true })
        return c.json({ ok: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        return c.json({ error: `Failed to delete skill: ${message}` }, 500)
      }
    })
  }

  // GET /explore — proxy to skills.sh
  app.get('/explore', async (c) => {
    const q = c.req.query('q') ?? ''
    try {
      const res = await globalThis.fetch(
        `https://skills.sh/api/search?q=${encodeURIComponent(q)}`
      )
      if (!res.ok) {
        return c.json({ results: [] })
      }
      const data = await res.json() as {
        skills?: Array<{
          name?: string
          slug?: string
          installs?: number
          repo?: string
          url?: string
        }>
      }
      const results: ExploreResult[] = (data.skills ?? []).map(s => ({
        name: s.name ?? s.slug ?? '',
        slug: s.slug ?? '',
        installs: s.installs ?? 0,
        source: 'skills.sh' as const,
        url: s.url ?? `https://skills.sh/${s.slug ?? ''}`,
        repo: s.repo ?? '',
      }))
      return c.json({ results })
    } catch {
      return c.json({ results: [] })
    }
  })

  // POST /install — install a skill from skills.sh
  app.post('/install', async (c) => {
    const { slug, scope, scopeRef } = await c.req.json<{
      slug: string
      scope: SkillScope
      scopeRef?: string
    }>()

    if (!slug) {
      return c.json({ error: 'slug is required' }, 400)
    }

    try {
      if (scope === 'global') {
        execFileSync('npx', ['skills', 'add', slug, '--global', '--yes', '--agent', 'claude'], {
          encoding: 'utf-8',
          timeout: 60000,
          stdio: 'pipe',
        })
        return c.json({ ok: true })
      }

      // For account/project: fetch raw SKILL.md from GitHub and write locally
      const ref = scopeRef ?? ''
      if (!ref) {
        return c.json({ error: 'scopeRef is required for account/project scope' }, 400)
      }

      // slug format: "owner/repo/skill-name" or just "skill-name"
      // Determine repo and skill name from slug
      const parts = slug.split('/')
      let repo: string
      let skillName: string
      if (parts.length >= 3) {
        repo = `${parts[0]}/${parts[1]}`
        skillName = parts.slice(2).join('/')
      } else {
        // Assume skills-sh org
        repo = `skills-sh/${slug}`
        skillName = slug
      }

      const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${skillName}/SKILL.md`
      const rawRes = await globalThis.fetch(rawUrl)
      if (!rawRes.ok) {
        return c.json({ error: `Failed to fetch SKILL.md from ${rawUrl}` }, 502)
      }

      const content = await rawRes.text()
      const dir = reader.getSkillDir(scope, ref, skillName)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), content, 'utf-8')
      return c.json({ ok: true, dir })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return c.json({ error: `Failed to install skill: ${message}` }, 500)
    }
  })

  return app
}

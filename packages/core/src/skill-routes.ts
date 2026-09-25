import { Hono } from 'hono'
import { CWReader } from './cw-reader.js'
import type { ExploreResult, PluginTarget, SkillScope } from './cw-types.js'
import { mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync, cpSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { envWithoutHarness } from './cw-doctor.js'
import { createRunner, runCommand, type Runner, type RunResult } from './task-review.js'
import { createRemoteLookup, knowsMarketplace, listMarketplaces, listPlugins, marketplaceSourceOf, readPluginSkill, splitPluginId, type RemoteLookup } from './plugins.js'

const INSTALL_TIMEOUT_MS = 120_000
const SKILL_NAME_RE = /^\w[\w.-]*$/
const PLUGIN_ID_RE = /^\w[\w.-]*@\w[\w.-]*$/

// the CLI prints one JSON entry per requested skill; a non-installed one carries the reason
function installFailure(result: RunResult): string {
  try {
    const entries = JSON.parse(result.stdout) as Array<{ status?: string; reason?: string }>
    const reason = entries.find(e => e.status !== 'installed')?.reason
    if (reason) return reason
  } catch {}
  return result.stderr.trim().split('\n').pop() || `skills CLI exited with code ${result.code}`
}

function commandFailure(result: RunResult): string {
  if (result.code === 127) return 'the claude CLI is not installed'
  const lines = `${result.stderr}\n${result.stdout}`.trim().split('\n').filter(Boolean)
  return lines.find(l => /error|fatal/i.test(l)) ?? lines.pop() ?? `claude exited with code ${result.code}`
}

export function skillRoutes(
  reader: CWReader,
  options: { runnerFor?: (env: NodeJS.ProcessEnv) => Runner; remoteOf?: RemoteLookup } = {},
): Hono {
  const runnerFor = options.runnerFor ?? ((env) => createRunner(env, INSTALL_TIMEOUT_MS))
  const remoteOf = options.remoteOf ?? createRemoteLookup(runCommand)
  const app = new Hono()
  // one plugin command per config dir: two CLIs rewriting installed_plugins.json would race
  const busy = new Set<string>()

  type PluginScope = PluginTarget['scope']
  type Outcome = { error: string; status: 404 | 409 | 500 } | null
  // runs `claude` commands in a config dir, holding its lock; the first failure stops the rest
  const runClaude = async (scope: PluginScope, ref: string, commands: string[][], failure: string): Promise<Outcome> => {
    const configDir = reader.getSkillConfigDir(scope, ref)
    if (busy.has(configDir)) return { error: `A plugin command is already running for ${ref}`, status: 409 }
    busy.add(configDir)
    try {
      // the CLI relocates .claude.json when CLAUDE_CONFIG_DIR is set to ~/.claude; accounts keep it, global does not
      const { CLAUDE_CONFIG_DIR: _ignored, ...base } = envWithoutHarness()
      const run = runnerFor(scope === 'global' ? base : { ...base, CLAUDE_CONFIG_DIR: configDir })
      for (const args of commands) {
        const result = await run('claude', args, configDir)
        if (result.code !== 0) return { error: `${failure}: ${commandFailure(result)}`, status: 500 }
      }
      return null
    } finally {
      busy.delete(configDir)
    }
  }
  // CW sessions read plugins from the account's config dir only, so new installs go to an account
  const knownAccount = (account: string | undefined) => account && reader.getAccounts().includes(account) ? account : null

  const refOf = (scope: SkillScope, scopeRef?: string) => scope === 'global' ? 'global' : scopeRef ?? ''
  // a scope ref must be a known account or project
  const knownScope = (scope: SkillScope, ref: string) =>
    scope === 'global' || (scope === 'account' ? reader.getAccounts().includes(ref) : scope === 'project' && ref in reader.getProjects())

  app.get('/', (c) => c.json(reader.getSkills()))

  app.post('/copy', async (c) => {
    const { from, to } = await c.req.json<{
      from: { scope: SkillScope; scopeRef?: string; name: string }
      to: { scope: SkillScope; scopeRef?: string }
    }>()
    const fromRef = refOf(from.scope, from.scopeRef)
    const toRef = refOf(to.scope, to.scopeRef)
    if (!SKILL_NAME_RE.test(from.name)) return c.json({ error: 'Invalid skill name' }, 400)
    if (!knownScope(from.scope, fromRef)) return c.json({ error: `Unknown ${from.scope}: ${fromRef}` }, 404)
    if (!knownScope(to.scope, toRef)) return c.json({ error: `Unknown ${to.scope}: ${toRef}` }, 404)

    const source = reader.getSkillDir(from.scope, fromRef, from.name)
    const target = reader.getSkillDir(to.scope, toRef, from.name)
    if (!existsSync(join(source, 'SKILL.md'))) return c.json({ error: 'Skill not found' }, 404)
    if (existsSync(target)) return c.json({ error: `${from.name} already exists in ${toRef}` }, 409)
    try {
      cpSync(source, target, { recursive: true })
      return c.json({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return c.json({ error: `Failed to copy skill: ${message}` }, 500)
    }
  })

  app.get('/global/:name', (c) => {
    const name = c.req.param('name')
    const skill = reader.getSkill('global', 'global', name)
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })

  app.get('/account/:account/:name', (c) => {
    const { account, name } = c.req.param()
    const skill = reader.getSkill('account', account, name)
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })

  app.get('/project/:project/:name', (c) => {
    const { project, name } = c.req.param()
    const skill = reader.getSkill('project', project, name)
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })

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

  const scopePatterns: Array<{ pattern: string; scope: SkillScope; paramKey?: string }> = [
    { pattern: '/global/:name', scope: 'global' },
    { pattern: '/account/:account/:name', scope: 'account', paramKey: 'account' },
    { pattern: '/project/:project/:name', scope: 'project', paramKey: 'project' },
  ]

  for (const { pattern, scope, paramKey } of scopePatterns) {
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
        skills?: Array<{ id?: string; skillId?: string; name?: string; installs?: number; source?: string }>
      }
      const results: ExploreResult[] = (data.skills ?? []).flatMap(s => s.id ? [{
        name: s.name ?? s.id,
        slug: s.id,
        skillId: s.skillId ?? '',
        installs: s.installs ?? 0,
        source: 'skills.sh' as const,
        url: `https://skills.sh/${s.id}`,
        repo: s.source ?? '',
      }] : [])
      return c.json({ results })
    } catch {
      return c.json({ results: [] })
    }
  })

  app.post('/install', async (c) => {
    const { repo, skill, scope, scopeRef } = await c.req.json<{
      repo: string
      skill: string
      scope: SkillScope
      scopeRef?: string
    }>()

    if (!repo || !skill) {
      return c.json({ error: 'repo and skill are required' }, 400)
    }
    const ref = refOf(scope, scopeRef)
    if (!knownScope(scope, ref)) {
      return c.json({ error: `Unknown ${scope}: ${ref}` }, 404)
    }

    // the skills CLI writes Claude Code skills into $CLAUDE_CONFIG_DIR/skills, where the reader lists them
    const configDir = reader.getSkillConfigDir(scope, ref)
    const args = ['--yes', 'skills', 'add', repo, '--skill', skill, '--agent', 'claude-code', '--yes', '--json']
    if (scope !== 'project') args.push('--global')
    const run = runnerFor({ ...envWithoutHarness(), CLAUDE_CONFIG_DIR: configDir })
    const result = await run('npx', args, dirname(configDir))
    if (result.code !== 0) {
      return c.json({ error: `Failed to install skill: ${installFailure(result)}` }, 500)
    }
    return c.json({ ok: true })
  })

  app.get('/plugins', async (c) => c.json(await listPlugins(reader, remoteOf)))

  app.get('/plugins/:id/skills/:name', async (c) => {
    const plugin = (await listPlugins(reader, remoteOf)).find(p => p.id === c.req.param('id'))
    const skill = plugin && readPluginSkill(plugin, c.req.param('name'))
    if (!skill) return c.json({ error: 'Skill not found' }, 404)
    return c.json(skill)
  })

  app.post('/plugins/:id/update', async (c) => {
    const id = c.req.param('id')
    const { scope, scopeRef } = await c.req.json<{ scope?: string; scopeRef?: string }>().catch(() => ({}) as { scope?: string; scopeRef?: string })
    const ref = scope === 'global' ? 'global' : scopeRef ?? ''
    const find = async () => (await listPlugins(reader, remoteOf)).find(p => p.id === id)
    const plugin = await find()
    const install = plugin?.installs.find(i => i.scope === scope && i.scopeRef === ref)
    if (!plugin || !install) return c.json({ error: `${id} is not installed in ${ref || 'that scope'}` }, 404)

    const failed = await runClaude(install.scope, ref, [['plugin', 'marketplace', 'update', plugin.marketplace], ['plugin', 'update', plugin.id]], `Failed to update ${plugin.name}`)
    if (failed) return c.json({ error: failed.error }, failed.status)
    const version = (await find())?.installs.find(i => i.scope === install.scope && i.scopeRef === ref)?.version ?? install.version
    return c.json({ ok: true, version })
  })

  app.get('/marketplaces', (c) => c.json(listMarketplaces(reader)))

  app.post('/marketplaces', async (c) => {
    type Body = { source?: string; account?: string }
    const body = await c.req.json<Body>().catch((): Body => ({}))
    const source = body.source?.trim() ?? ''
    // a leading dash would reach the CLI as an option
    if (!source || source.startsWith('-')) return c.json({ error: 'A GitHub repo, URL or path is required' }, 400)
    const account = knownAccount(body.account)
    if (!account) return c.json({ error: 'Unknown account' }, 404)
    const failed = await runClaude('account', account, [['plugin', 'marketplace', 'add', source]], `Failed to add ${source}`)
    if (failed) return c.json({ error: failed.error }, failed.status)
    return c.json({ ok: true })
  })

  app.post('/plugins/install', async (c) => {
    type Body = { id?: string; account?: string }
    const body = await c.req.json<Body>().catch((): Body => ({}))
    const id = body.id ?? ''
    if (!PLUGIN_ID_RE.test(id)) return c.json({ error: 'Invalid plugin id' }, 400)
    const account = knownAccount(body.account)
    if (!account) return c.json({ error: 'Unknown account' }, 404)
    const { name, marketplace } = splitPluginId(id)
    const commands = [['plugin', 'install', id]]
    // an account that lacks the marketplace gets it from wherever it is known
    if (!knowsMarketplace(reader.getSkillConfigDir('account', account), marketplace)) {
      const source = marketplaceSourceOf(reader, marketplace)
      if (!source) return c.json({ error: `Unknown marketplace ${marketplace}` }, 404)
      commands.unshift(['plugin', 'marketplace', 'add', source])
    }
    const failed = await runClaude('account', account, commands, `Failed to install ${name}`)
    if (failed) return c.json({ error: failed.error }, failed.status)
    return c.json({ ok: true })
  })

  return app
}

import { type FunctionComponent } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import { ActionButton, Tabs, showToast } from '@forge-dev/ui'
import type { SkillEntry, SkillDetail, ExploreResult, PluginEntry } from '@forge-dev/core'
import { skills, loadSkills } from '../hooks/useSkills.js'
import { plugins, loadPlugins } from '../hooks/usePlugins.js'
import { PluginBrowser, PluginRailGroup, PluginPane, PluginSkillView, ProposeSkill } from './SkillPlugins.js'
import { MenuButton } from '../components/PageHeader.js'
import { PaneHeader } from '../components/PaneHeader.js'
import { Field, labelStyle } from '../components/Field.js'

interface SkillsProps {
  accounts: string[]
  projects: Record<string, { path: string; account: string }>
  onCreateWithAI?: (scope: string, scopeRef: string, description: string) => void
  onRunSkill: (skill: SkillEntry) => void
  onProposeSkill: (plugin: PluginEntry, text: string, area: string | undefined, account: string) => Promise<boolean>
}

type Scope = SkillEntry['scope']
type Pane = { kind: 'editor'; skill: SkillEntry } | { kind: 'create' } | { kind: 'explore'; query: string }
  | { kind: 'plugin'; id: string; skill?: string } | { kind: 'propose'; id: string } | { kind: 'plugins' } | { kind: 'empty' }

const SCOPE_TOKEN: Record<Scope, string> = { global: '--blue', account: '--orange', project: '--green' }

const skillId = (s: SkillEntry) => `${s.scope}/${s.scopeRef}/${s.dirName}`

function scopePath(scope: string, scopeRef: string): string {
  if (scope === 'global') return 'global'
  if (scope === 'account') return `account/${encodeURIComponent(scopeRef)}`
  return `project/${encodeURIComponent(scopeRef)}`
}

const scopeLabel = (s: Pick<SkillEntry, 'scope' | 'scopeRef'>) =>
  s.scope === 'global' ? 'Global' : `${s.scope === 'account' ? 'Account' : 'Project'} · ${s.scopeRef}`

const skillDir = (s: Pick<SkillEntry, 'scope' | 'scopeRef' | 'dirName'>) =>
  s.scope === 'global' ? `~/.claude/skills/${s.dirName}` : s.scope === 'account' ? `~/.cw/accounts/${s.scopeRef}/skills/${s.dirName}` : `<${s.scopeRef}>/.claude/skills/${s.dirName}`

/* ── Scope ── */

type Target = Pick<SkillEntry, 'scope' | 'scopeRef'>

const SCOPE_HINT: Record<Scope, string> = {
  global: 'Lands in ~/.claude/skills; CW links it into every account when a Claude Code session starts.',
  account: 'Every session on this account loads it.',
  project: 'Sessions in this project load it from its .claude/skills.',
}

const defaultTarget = (accounts: string[]): Target => accounts[0] ? { scope: 'account', scopeRef: accounts[0] } : { scope: 'global', scopeRef: 'global' }

const targetReady = (t: Target) => t.scope === 'global' || t.scopeRef !== ''

const ScopeFields: FunctionComponent<{ accounts: string[]; projects: string[]; value: Target; onChange: (t: Target) => void }> = ({ accounts, projects, value, onChange }) => {
  const change = (scope: Scope) => {
    const options = scope === 'account' ? accounts : projects
    onChange({ scope, scopeRef: scope === 'global' ? 'global' : options.includes(value.scopeRef) ? value.scopeRef : options[0] ?? '' })
  }
  return (
    <>
      <div class="flex flex-col" style={{ gap: '5px' }}>
        <span style={labelStyle}>Scope</span>
        <Tabs label="Scope" tabs={[{ id: 'account', label: 'Account' }, { id: 'project', label: 'Project' }, { id: 'global', label: 'Global' }]} active={value.scope} onChange={(id) => change(id as Scope)} />
        <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{SCOPE_HINT[value.scope]}</span>
      </div>
      {value.scope !== 'global' && (
        <Field label={value.scope === 'account' ? 'Account' : 'Project'}>
          <select class="field" value={value.scopeRef} onChange={(e) => onChange({ ...value, scopeRef: (e.target as HTMLSelectElement).value })}>
            {(value.scope === 'account' ? accounts : projects).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      )}
    </>
  )
}

// every other scope the skill could be copied into
const copyTargets = (skill: SkillEntry, accounts: string[], projects: string[]): Target[] => [
  ...accounts.map(a => ({ scope: 'account' as const, scopeRef: a })),
  ...projects.map(p => ({ scope: 'project' as const, scopeRef: p })),
  { scope: 'global' as const, scopeRef: 'global' },
].filter(t => t.scope !== skill.scope || t.scopeRef !== skill.scopeRef)

/* ── Editor ── */

const serializeFrontmatter = (obj: Record<string, unknown>, indent = ''): string[] => {
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      lines.push(`${indent}${k}:`)
      lines.push(...serializeFrontmatter(v as Record<string, unknown>, indent + '  '))
    } else {
      lines.push(`${indent}${k}: ${String(v ?? '')}`)
    }
  }
  return lines
}

const SkillEditor: FunctionComponent<{ skill: SkillEntry; accounts: string[]; projects: string[]; onDeleted: () => void; onCopied: () => void; onRun: () => void }> = ({ skill, accounts, projects, onDeleted, onCopied, onRun }) => {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFile, setActiveFile] = useState('SKILL.md')
  const [content, setContent] = useState('')
  const [refContents, setRefContents] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const base = `/api/skills/${scopePath(skill.scope, skill.scopeRef)}/${encodeURIComponent(skill.dirName)}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setActiveFile('SKILL.md')
    fetch(base)
      .then(res => { if (!res.ok) throw new Error('fetch failed'); return res.json() as Promise<SkillDetail> })
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        const fm = serializeFrontmatter(d.frontmatter)
        setContent(fm.length > 0 ? `---\n${fm.join('\n')}\n---\n\n${d.body}` : d.body)
        setRefContents(Object.fromEntries(d.references.map(r => [r.name, r.content])))
      })
      .catch(() => { if (!cancelled) { setDetail(null); showToast('Failed to load skill', 'error') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [base])

  const handleSave = async () => {
    setSaving(true)
    const isMain = activeFile === 'SKILL.md'
    try {
      const res = await fetch(isMain ? base : `${base}/references/${encodeURIComponent(activeFile)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: isMain ? content : refContents[activeFile] ?? '' }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) showToast(isMain ? 'Skill saved' : 'Reference saved', 'success')
      else showToast(result.error ?? 'Failed to save', 'error')
    } catch {
      showToast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete the skill "${skill.name}" permanently?`)) return
    try {
      const res = await fetch(base, { method: 'DELETE' })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Skill deleted', 'info')
        onDeleted()
      } else {
        showToast(result.error ?? 'Failed to delete', 'error')
      }
    } catch {
      showToast('Failed to delete', 'error')
    }
  }

  const handleCopy = async (target: Target) => {
    try {
      const res = await fetch('/api/skills/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: { scope: skill.scope, scopeRef: skill.scopeRef, name: skill.dirName }, to: target }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast(`Copied to ${scopeLabel(target)}`, 'success')
        onCopied()
      } else {
        showToast(result.error ?? 'Failed to copy', 'error')
      }
    } catch {
      showToast('Failed to copy', 'error')
    }
  }

  const handleAddReference = async () => {
    const filename = prompt('Reference filename (e.g. examples.md):')
    if (!filename?.trim()) return
    const name = filename.trim()
    const initial = `# ${name}\n`
    try {
      const res = await fetch(`${base}/references/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: initial }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        setRefContents(prev => ({ ...prev, [name]: initial }))
        setDetail(prev => prev ? { ...prev, references: [...prev.references, { name, content: initial }] } : prev)
        setActiveFile(name)
        showToast('Reference added', 'success')
      } else {
        showToast(result.error ?? 'Failed to add reference', 'error')
      }
    } catch {
      showToast('Failed to add reference', 'error')
    }
  }

  const handleDeleteReference = async (name: string) => {
    if (!confirm(`Delete reference "${name}"?`)) return
    try {
      const res = await fetch(`${base}/references/${encodeURIComponent(name)}`, { method: 'DELETE' })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        setRefContents(prev => {
          const { [name]: _gone, ...rest } = prev
          return rest
        })
        setDetail(prev => prev ? { ...prev, references: prev.references.filter(r => r.name !== name) } : prev)
        if (activeFile === name) setActiveFile('SKILL.md')
        showToast('Reference deleted', 'info')
      } else {
        showToast(result.error ?? 'Failed to delete reference', 'error')
      }
    } catch {
      showToast('Failed to delete reference', 'error')
    }
  }

  const files = ['SKILL.md', ...(detail?.references.map(r => r.name) ?? [])]
  const targets = copyTargets(skill, accounts, projects)

  return (
    <>
      <PaneHeader title={skill.name} sub={`${scopeLabel(skill)} · ${skillDir(skill)}`}>
        <ActionButton label="Delete" variant="danger" size="sm" onClick={handleDelete} />
        <select
          class="field"
          aria-label="Copy to"
          style={{ height: '30px', padding: '0 8px', fontSize: '12.5px', width: 'auto' }}
          value=""
          disabled={!detail}
          onChange={(e) => {
            const el = e.target as HTMLSelectElement
            const target = targets[Number(el.value)]
            el.value = ''
            if (target) void handleCopy(target)
          }}
        >
          <option value="" disabled>Copy to…</option>
          {targets.map((t, i) => <option key={`${t.scope}/${t.scopeRef}`} value={i}>{scopeLabel(t)}</option>)}
        </select>
        <ActionButton label="Run in session" variant="secondary" size="sm" onClick={onRun} />
        <ActionButton label={saving ? 'Saving…' : 'Save'} variant="primary" size="sm" loading={saving} disabled={!detail} onClick={handleSave} />
      </PaneHeader>
      <div class="flex items-center flex-wrap shrink-0" style={{ gap: '6px', padding: '10px 20px 0' }} role="tablist" aria-label="Files">
        {files.map(f => {
          const on = activeFile === f
          return (
            <span key={f} class="inline-flex items-center" style={{ gap: '4px', padding: on ? '5px 8px 5px 11px' : '5px 11px', borderRadius: '9px', background: on ? 'var(--card)' : 'transparent', border: `1px solid ${on ? 'var(--hair)' : 'transparent'}`, boxShadow: on ? 'var(--shadow-s)' : 'none' }}>
              <button type="button" role="tab" aria-selected={on} class="mono cursor-pointer" style={{ border: 0, background: 'none', padding: 0, fontSize: '12px', fontWeight: on ? 600 : 400, color: on ? 'var(--ink)' : 'var(--ink-3)' }} onClick={() => setActiveFile(f)}>{f}</button>
              {on && f !== 'SKILL.md' && (
                <button type="button" aria-label={`Delete ${f}`} class="grid place-items-center cursor-pointer text-ink3 hover:text-red" style={{ border: 0, background: 'none', padding: 0 }} onClick={() => handleDeleteReference(f)}>
                  <span class="i-lucide-x" style={{ width: '12px', height: '12px' }} />
                </button>
              )}
            </span>
          )
        })}
        <span class="flex-1" />
        <button type="button" class="cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px" style={{ padding: '5px 10px', borderRadius: '9px', border: '1px solid var(--hair)', background: 'var(--card)', color: 'var(--blue)', fontSize: '12px', fontWeight: 500 }} onClick={handleAddReference} disabled={!detail}>
          + Reference
        </button>
      </div>
      <div class="flex-1 min-h-0" style={{ padding: '12px 20px 20px' }}>
        {loading ? (
          <p style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: 'var(--ink-2)' }}>Loading skill…</p>
        ) : !detail ? (
          <p style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', color: 'var(--ink-2)' }}>Skill not found.</p>
        ) : (
          <textarea
            class="field mono w-full h-full"
            aria-label={activeFile}
            spellcheck={false}
            style={{ height: '100%', padding: '14px 16px', borderRadius: '14px', border: '1px solid var(--hair)', background: 'var(--card)', color: 'var(--ink)', fontSize: '12.5px', lineHeight: 1.7, resize: 'none', outline: 'none', boxShadow: 'var(--shadow-s)', minHeight: '240px' }}
            value={activeFile === 'SKILL.md' ? content : (refContents[activeFile] ?? '')}
            onInput={(e) => {
              const val = (e.target as HTMLTextAreaElement).value
              if (activeFile === 'SKILL.md') setContent(val)
              else setRefContents(prev => ({ ...prev, [activeFile]: val }))
            }}
          />
        )}
      </div>
    </>
  )
}

/* ── Explore ── */

const SkillExplore: FunctionComponent<{ query: string; accounts: string[]; projects: string[]; onInstalled: () => void }> = ({ query, accounts, projects, onInstalled }) => {
  const [results, setResults] = useState<ExploreResult[] | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [target, setTarget] = useState<Target>(() => defaultTarget(accounts))

  useEffect(() => {
    let cancelled = false
    setResults(null)
    fetch(`/api/skills/explore?q=${encodeURIComponent(query)}`)
      .then(res => { if (!res.ok) throw new Error('search failed'); return res.json() as Promise<{ results: ExploreResult[] }> })
      .then(data => { if (!cancelled) setResults(data.results) })
      .catch(() => { if (!cancelled) { setResults([]); showToast('Failed to search skills', 'error') } })
    return () => { cancelled = true }
  }, [query])

  const install = async (skill: ExploreResult) => {
    setInstalling(skill.slug)
    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: skill.repo, skill: skill.skillId, ...target }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast(`Installed in ${scopeLabel(target)}`, 'success')
        onInstalled()
      } else {
        showToast(result.error ?? 'Failed to install', 'error')
      }
    } catch {
      showToast('Failed to install', 'error')
    } finally {
      setInstalling(null)
    }
  }

  return (
    <>
      <PaneHeader title={`skills.sh · “${query}”`} sub={`Installs into ${scopeLabel(target)}`} />
      <div class="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '14px 20px 20px', gap: '8px' }}>
        <div class="flex flex-col" style={{ gap: '10px', maxWidth: '560px', marginBottom: '6px' }}>
          <ScopeFields accounts={accounts} projects={projects} value={target} onChange={setTarget} />
        </div>
        {results === null && <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>Searching…</p>}
        {results?.length === 0 && <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>No results on skills.sh.</p>}
        {results?.map((r, i) => (
          <div key={r.slug} class="flex items-center" style={{ gap: '12px', padding: '11px 15px', borderRadius: '13px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', animation: `riseIn .3s var(--ease) ${Math.min(i, 8) * 40}ms both` }}>
            <div class="flex-1 min-w-0">
              <div class="truncate" style={{ fontSize: '13.5px', fontWeight: 600 }}>{r.name}</div>
              <div class="mono truncate" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>{r.repo} · {r.installs} installs</div>
            </div>
            <ActionButton label={installing === r.slug ? 'Installing…' : 'Install'} variant="secondary" size="sm" loading={installing === r.slug} disabled={!targetReady(target)} onClick={() => install(r)} />
          </div>
        ))}
      </div>
    </>
  )
}

/* ── Create ── */

const SkillCreate: FunctionComponent<{
  accounts: string[]
  projects: Record<string, { path: string; account: string }>
  onCreated: () => void
  onCreateWithAI?: (scope: string, scopeRef: string, description: string) => void
}> = ({ accounts, projects, onCreated, onCreateWithAI }) => {
  const [target, setTarget] = useState<Target>(() => defaultTarget(accounts))
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const { scope, scopeRef } = target

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    const template = `---\nname: ${name.trim()}\ndescription: ${description.trim()}\ndomain: general\n---\n\n# ${name.trim()}\n\n${description.trim()}\n`
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, scopeRef, name: name.trim(), content: template }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Skill created', 'success')
        onCreated()
      } else {
        showToast(result.error ?? 'Failed to create skill', 'error')
      }
    } catch {
      showToast('Failed to create skill', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <PaneHeader title="New skill" sub="Write it yourself or let an agent draft it with skill-creator" />
      <div class="flex-1 min-h-0 overflow-auto">
        <div class="flex flex-col" style={{ padding: '16px 20px 24px', gap: '14px', maxWidth: '560px' }}>
          <ScopeFields accounts={accounts} projects={Object.keys(projects)} value={target} onChange={setTarget} />
          <Field label="Name">
            <input class="field" value={name} placeholder="my-skill" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Description">
            <textarea class="field" rows={3} value={description} placeholder="What does this skill do?" onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
          </Field>
          <div class="flex flex-wrap" style={{ gap: '8px' }}>
            <ActionButton label={creating ? 'Creating…' : 'Create'} variant="primary" loading={creating} disabled={!name.trim() || !targetReady(target)} onClick={create} />
            {onCreateWithAI && (
              <ActionButton label="Create with AI" variant="secondary" disabled={!description.trim() || !targetReady(target)} title="Starts a session that drafts the skill" onClick={() => onCreateWithAI(scope, scopeRef, description.trim())} />
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Page ── */

export const Skills: FunctionComponent<SkillsProps> = ({ accounts, projects, onCreateWithAI, onRunSkill, onProposeSkill }) => {
  const [search, setSearch] = useState('')
  const [pane, setPane] = useState<Pane>({ kind: 'empty' })
  const [loading, setLoading] = useState(skills.value === null)

  const projectNames = Object.keys(projects)

  const refresh = useCallback(async () => {
    try {
      await Promise.all([loadSkills(), loadPlugins()])
    } catch {
      showToast('Failed to load skills', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (skills.value === null || plugins.value === null) void refresh() }, [refresh])

  const list = skills.value ?? []
  const q = search.trim().toLowerCase()
  const filtered = q ? list.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) : list

  const pluginList = plugins.value ?? []
  const activePlugin = pane.kind === 'plugin' || pane.kind === 'propose' ? pluginList.find(p => p.id === pane.id) : undefined

  // open the first skill once the list arrives
  useEffect(() => {
    if (pane.kind === 'empty' && list.length > 0) setPane({ kind: 'editor', skill: list[0] })
  }, [list.length])

  const selectedId = pane.kind === 'editor' ? skillId(pane.skill) : null

  return (
    <main class="skills-page grid min-w-0" style={{ gridTemplateColumns: '292px minmax(0,1fr)', height: '100vh' }}>
      <div class="skills-rail flex flex-col min-h-0 overflow-hidden" style={{ borderRight: '1px solid var(--hair)', background: 'var(--bg-2)' }}>
        <div class="flex flex-col shrink-0" style={{ padding: '12px 14px', borderBottom: '1px solid var(--hair)', gap: '10px' }}>
          <div class="flex items-center" style={{ gap: '10px' }}>
            <MenuButton />
            <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>Skills</h1>
            <span class="mono" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{list.length}</span>
            <span class="flex-1" />
            <ActionButton label="New" variant="primary" size="sm" onClick={() => setPane({ kind: 'create' })} />
          </div>
          <input
            class="field"
            type="search"
            aria-label="Search skills"
            style={{ height: '32px', padding: '0 11px', borderRadius: '9px', border: '1px solid var(--hair)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', outline: 'none' }}
            placeholder="Search installed or skills.sh"
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) setPane({ kind: 'explore', query: search.trim() }) }}
          />
        </div>
        <div class="overflow-auto min-h-0" style={{ padding: '8px' }}>
          {loading && <p style={{ padding: '12px', fontSize: '12.5px', color: 'var(--ink-2)' }}>Loading skills…</p>}
          {!loading && filtered.length === 0 && pluginList.length === 0 && (
            <p style={{ padding: '12px', fontSize: '12.5px', color: 'var(--ink-2)' }}>{q ? 'No installed skill matches.' : 'No skills yet.'}</p>
          )}
          {filtered.map(s => {
            const on = selectedId === skillId(s)
            return (
              <button
                key={skillId(s)}
                type="button"
                aria-current={on ? 'true' : undefined}
                class="block w-full text-left cursor-pointer transition-all duration-180 ease-spring hover:bg-elev"
                style={{ padding: '9px 11px', marginBottom: '4px', borderRadius: '11px', border: `1px solid ${on ? 'var(--hair)' : 'transparent'}`, background: on ? 'var(--card)' : 'transparent', boxShadow: on ? 'var(--shadow-s)' : 'none', color: 'var(--ink)' }}
                onClick={() => setPane({ kind: 'editor', skill: s })}
              >
                <span class="flex items-center" style={{ gap: '8px' }}>
                  <span class="shrink-0" style={{ width: '7px', height: '7px', borderRadius: '50%', background: `var(${SCOPE_TOKEN[s.scope]})` }} />
                  <span class="flex-1 min-w-0 truncate" style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</span>
                  <span class="truncate" style={{ fontSize: '11px', color: 'var(--ink-3)', maxWidth: '90px' }}>{s.scope === 'global' ? 'global' : s.scopeRef}</span>
                </span>
                {s.description && <span class="block truncate" style={{ fontSize: '12px', color: 'var(--ink-2)', marginTop: '2px' }}>{s.description}</span>}
              </button>
            )
          })}
          <PluginRailGroup
            list={pluginList}
            query={q}
            selected={pane.kind === 'plugin' || pane.kind === 'propose' ? pane.id : null}
            onSelect={(id) => setPane({ kind: 'plugin', id })}
          />
          {!q && (
            <button
              type="button"
              aria-current={pane.kind === 'plugins' ? 'true' : undefined}
              class="flex items-center w-full text-left cursor-pointer hover:bg-elev"
              style={{ gap: '8px', padding: '9px 11px', marginTop: '6px', borderRadius: '11px', border: '1px dashed var(--hair-2)', background: 'transparent', color: 'var(--blue)', fontSize: '12.5px', fontWeight: 500 }}
              onClick={() => setPane({ kind: 'plugins' })}
            >
              <span class="i-lucide-plus shrink-0" style={{ width: '13px', height: '13px' }} />
              <span class="truncate">Add a plugin</span>
            </button>
          )}
          {q && (
            <button
              type="button"
              class="flex items-center w-full text-left cursor-pointer hover:bg-elev"
              style={{ gap: '8px', padding: '9px 11px', borderRadius: '11px', border: '1px dashed var(--hair-2)', background: 'transparent', color: 'var(--blue)', fontSize: '12.5px', fontWeight: 500 }}
              onClick={() => setPane({ kind: 'explore', query: search.trim() })}
            >
              <span class="i-lucide-search shrink-0" style={{ width: '13px', height: '13px' }} />
              <span class="truncate">Search skills.sh for “{search.trim()}”</span>
            </button>
          )}
        </div>
      </div>

      <div class="flex flex-col min-h-0 min-w-0">
        {pane.kind === 'editor' && (
          <SkillEditor
            key={skillId(pane.skill)}
            skill={pane.skill}
            accounts={accounts}
            projects={projectNames}
            onCopied={() => { void refresh() }}
            onRun={() => onRunSkill(pane.skill)}
            onDeleted={() => { setPane({ kind: 'empty' }); void refresh() }}
          />
        )}
        {pane.kind === 'create' && (
          <SkillCreate
            accounts={accounts}
            projects={projects}
            onCreateWithAI={onCreateWithAI}
            onCreated={() => { setPane({ kind: 'empty' }); void refresh() }}
          />
        )}
        {pane.kind === 'explore' && <SkillExplore query={pane.query} accounts={accounts} projects={projectNames} onInstalled={() => { void refresh() }} />}
        {pane.kind === 'plugins' && <PluginBrowser accounts={accounts} />}
        {pane.kind === 'plugin' && activePlugin && !pane.skill && (
          <PluginPane
            plugin={activePlugin}
            accounts={accounts}
            query={q}
            onSelectSkill={(name) => setPane({ kind: 'plugin', id: activePlugin.id, skill: name })}
            onPropose={() => setPane({ kind: 'propose', id: activePlugin.id })}
          />
        )}
        {pane.kind === 'plugin' && activePlugin && pane.skill && (
          <PluginSkillView key={pane.skill} plugin={activePlugin} name={pane.skill} onBack={() => setPane({ kind: 'plugin', id: activePlugin.id })} />
        )}
        {pane.kind === 'propose' && activePlugin && (
          <ProposeSkill
            plugin={activePlugin}
            accounts={accounts}
            onCancel={() => setPane({ kind: 'plugin', id: activePlugin.id })}
            onSubmit={async (text, area, account) => {
              if (await onProposeSkill(activePlugin, text, area, account)) setPane({ kind: 'plugin', id: activePlugin.id })
            }}
          />
        )}
        {pane.kind === 'empty' && !loading && (
          <div class="flex-1 grid place-items-center" style={{ padding: '24px' }}>
            <div class="flex flex-col items-center text-center" style={{ gap: '12px' }}>
              <p style={{ fontSize: '13.5px', color: 'var(--ink-2)' }}>Pick a skill to edit it, or write a new one.</p>
              <ActionButton label="New skill" variant="primary" onClick={() => setPane({ kind: 'create' })} />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

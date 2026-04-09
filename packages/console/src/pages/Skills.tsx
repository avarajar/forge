import { type FunctionComponent } from 'preact'
import { useState, useEffect, useCallback } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import type { SkillEntry, SkillDetail, ExploreResult } from '@forge-dev/core'

/* ── Types ── */

interface SkillsProps {
  accounts: string[]
  projects: Record<string, { path: string; account: string }>
  onBack: () => void
  onCreateWithAI?: (scope: string, scopeRef: string, description: string) => void
}

type SubView = 'list' | 'editor' | 'explore' | 'create'

const SCOPE_COLORS: Record<string, string> = {
  global: '#6366f1',
  account: '#f59e0b',
  project: '#10b981',
}

function scopePath(scope: string, scopeRef: string): string {
  if (scope === 'global') return 'global'
  if (scope === 'account') return `account/${scopeRef}`
  return `project/${scopeRef}`
}

/* ── Scope Badge ── */

const ScopeBadge: FunctionComponent<{ scope: string }> = ({ scope }) => {
  const color = SCOPE_COLORS[scope] ?? 'var(--forge-muted)'
  return (
    <span
      class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
      style={{ color, backgroundColor: `${color}18` }}
    >
      {scope}
    </span>
  )
}

/* ── Domain Badge ── */

const DomainBadge: FunctionComponent<{ domain: string }> = ({ domain }) => (
  <span
    class="text-[9px] font-medium uppercase px-1.5 py-0.5 rounded"
    style={{ color: 'var(--forge-muted)', backgroundColor: 'var(--forge-ghost-bg)', border: '1px solid var(--forge-ghost-border)' }}
  >
    {domain}
  </span>
)

/* ── Back Button ── */

const BackButton: FunctionComponent<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    class="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
    style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
    onClick={onClick}
  >
    ← {label}
  </button>
)

/* ================================================================== */
/*  List sub-view                                                      */
/* ================================================================== */

const SkillListView: FunctionComponent<{
  skills: SkillEntry[]
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
  scopeFilter: string
  onScopeFilter: (v: string) => void
  onSelect: (skill: SkillEntry) => void
  onExplore: () => void
  onCreate: () => void
}> = ({ skills, loading, search, onSearchChange, scopeFilter, onScopeFilter, onSelect, onExplore, onCreate }) => {
  const filtered = skills.filter(s => {
    if (scopeFilter && s.scope !== scopeFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    }
    return true
  })

  const grouped = new Map<string, SkillEntry[]>()
  for (const s of filtered) {
    const key = s.scope === 'global' ? 'Global' : s.scope === 'account' ? `Account: ${s.scopeRef}` : `Project: ${s.scopeRef}`
    const arr = grouped.get(key) ?? []
    arr.push(s)
    grouped.set(key, arr)
  }

  return (
    <div>
      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-forge-text">Skills</h2>
          <p class="text-sm text-forge-muted mt-0.5">{skills.length} skill{skills.length !== 1 ? 's' : ''} available</p>
        </div>
        <div class="flex items-center gap-3">
          <ActionButton label="Explore" variant="secondary" onClick={onExplore} />
          <ActionButton label="+ New Skill" variant="primary" onClick={onCreate} />
        </div>
      </div>

      {/* Search + scope filter */}
      <div class="flex items-center gap-3 mb-6 pb-5" style={{ borderBottom: '1px solid var(--forge-ghost-border)' }}>
        <input
          type="text"
          value={search}
          onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
          placeholder="Search skills..."
          class="flex-1 px-3 py-2 text-sm rounded-lg bg-forge-surface border text-forge-text focus:border-forge-accent focus:outline-none"
          style={{ borderColor: 'var(--forge-ghost-border)' }}
        />
        <select
          class="px-3 py-2 text-xs rounded-lg bg-forge-surface border text-forge-text appearance-none cursor-pointer min-w-[120px]"
          style={{ borderColor: 'var(--forge-ghost-border)' }}
          value={scopeFilter}
          onChange={(e) => onScopeFilter((e.target as HTMLSelectElement).value)}
        >
          <option value="">All scopes</option>
          <option value="global">Global</option>
          <option value="account">Account</option>
          <option value="project">Project</option>
        </select>
      </div>

      {/* Loading */}
      {loading && <div class="py-12 text-center text-forge-muted text-sm">Loading skills...</div>}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div class="py-16 text-center">
          <p class="text-sm text-forge-muted">{search || scopeFilter ? 'No skills match your filters.' : 'No skills found. Create one or explore the registry.'}</p>
        </div>
      )}

      {/* Grouped list */}
      {!loading && Array.from(grouped.entries()).map(([group, items]) => (
        <div key={group} class="mb-6">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-xs font-semibold text-forge-muted uppercase tracking-wider">{group}</span>
            <span class="text-xs text-forge-muted">{items.length}</span>
          </div>
          <div class="space-y-2">
            {items.map(s => (
              <button
                key={`${s.scope}-${s.scopeRef}-${s.dirName}`}
                class="w-full text-left px-4 py-3 rounded-xl border transition-all cursor-pointer"
                style={{ backgroundColor: 'var(--forge-surface)', borderColor: 'var(--forge-ghost-border)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-border)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-ghost-border)' }}
                onClick={() => onSelect(s)}
              >
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm font-semibold text-forge-text">{s.name}</span>
                  {s.domain && <DomainBadge domain={s.domain} />}
                  <ScopeBadge scope={s.scope} />
                </div>
                {s.description && (
                  <p class="text-xs text-forge-muted line-clamp-2">{s.description}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ================================================================== */
/*  Editor sub-view                                                    */
/* ================================================================== */

const SkillEditorView: FunctionComponent<{
  skill: SkillEntry
  onBack: () => void
  onDeleted: () => void
}> = ({ skill, onBack, onDeleted }) => {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeFile, setActiveFile] = useState('SKILL.md')
  const [content, setContent] = useState('')
  const [refContents, setRefContents] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const sp = scopePath(skill.scope, skill.scopeRef)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/skills/${sp}/${encodeURIComponent(skill.dirName)}`)
      if (!res.ok) throw new Error('fetch failed')
      const d = await res.json() as SkillDetail
      setDetail(d)
      // Reconstruct full SKILL.md with frontmatter
      const serializeFm = (obj: Record<string, unknown>, indent = ''): string[] => {
        const lines: string[] = []
        for (const [k, v] of Object.entries(obj)) {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            lines.push(`${indent}${k}:`)
            lines.push(...serializeFm(v as Record<string, unknown>, indent + '  '))
          } else {
            lines.push(`${indent}${k}: ${String(v ?? '')}`)
          }
        }
        return lines
      }
      const fmLines = serializeFm(d.frontmatter)
      const fullContent = fmLines.length > 0
        ? `---\n${fmLines.join('\n')}\n---\n\n${d.body}`
        : d.body
      setContent(fullContent)
      const rc: Record<string, string> = {}
      for (const ref of d.references) {
        rc[ref.name] = ref.content
      }
      setRefContents(rc)
    } catch {
      showToast('Failed to load skill', 'error')
    } finally {
      setLoading(false)
    }
  }, [sp, skill.dirName])

  useEffect(() => { fetchDetail() }, [fetchDetail])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (activeFile === 'SKILL.md') {
        const res = await fetch(`/api/skills/${sp}/${encodeURIComponent(skill.dirName)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        const result = await res.json() as { ok: boolean; error?: string }
        if (result.ok) showToast('Skill saved', 'success')
        else showToast(result.error ?? 'Failed to save', 'error')
      } else {
        const res = await fetch(`/api/skills/${sp}/${encodeURIComponent(skill.dirName)}/references/${encodeURIComponent(activeFile)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: refContents[activeFile] ?? '' }),
        })
        const result = await res.json() as { ok: boolean; error?: string }
        if (result.ok) showToast('Reference saved', 'success')
        else showToast(result.error ?? 'Failed to save reference', 'error')
      }
    } catch {
      showToast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this skill permanently?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/skills/${sp}/${encodeURIComponent(skill.dirName)}`, { method: 'DELETE' })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Skill deleted', 'info')
        onDeleted()
      } else {
        showToast(result.error ?? 'Failed to delete', 'error')
      }
    } catch {
      showToast('Failed to delete', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const handleAddReference = async () => {
    const filename = prompt('Reference filename (e.g. examples.md):')
    if (!filename?.trim()) return
    const name = filename.trim()
    try {
      const res = await fetch(`/api/skills/${sp}/${encodeURIComponent(skill.dirName)}/references/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `# ${name}\n` }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        setRefContents(prev => ({ ...prev, [name]: `# ${name}\n` }))
        setDetail(prev => prev ? { ...prev, references: [...prev.references, { name, content: `# ${name}\n` }] } : prev)
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
      const res = await fetch(`/api/skills/${sp}/${encodeURIComponent(skill.dirName)}/references/${encodeURIComponent(name)}`, { method: 'DELETE' })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        setRefContents(prev => {
          const copy = { ...prev }
          delete copy[name]
          return copy
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

  if (loading) {
    return (
      <div>
        <BackButton label="Back to skills" onClick={onBack} />
        <div class="py-12 text-center text-forge-muted text-sm">Loading skill...</div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div>
        <BackButton label="Back to skills" onClick={onBack} />
        <div class="py-12 text-center text-forge-muted text-sm">Skill not found.</div>
      </div>
    )
  }

  const fm = detail.frontmatter
  const files = ['SKILL.md', ...detail.references.map(r => r.name)]

  return (
    <div>
      <BackButton label="Back to skills" onClick={onBack} />

      <div class="flex gap-6" style={{ minHeight: '500px' }}>
        {/* Left sidebar */}
        <div class="w-64 shrink-0">
          {/* Metadata */}
          <div class="rounded-xl p-4 mb-4" style={{ backgroundColor: 'var(--forge-surface)', border: '1px solid var(--forge-ghost-border)' }}>
            <h3 class="text-sm font-bold text-forge-text mb-3">{detail.name}</h3>
            {fm.description && <p class="text-xs text-forge-muted mb-2">{String(fm.description)}</p>}
            {fm.domain && (
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[10px] text-forge-muted uppercase">Domain:</span>
                <DomainBadge domain={String(fm.domain)} />
              </div>
            )}
            <div class="flex items-center gap-2 mb-2">
              <span class="text-[10px] text-forge-muted uppercase">Scope:</span>
              <ScopeBadge scope={detail.scope} />
              {detail.scopeRef && <span class="text-[10px] text-forge-muted">{detail.scopeRef}</span>}
            </div>
            {fm.triggers && (
              <div class="mt-2">
                <span class="text-[10px] text-forge-muted uppercase block mb-1">Triggers:</span>
                <p class="text-xs text-forge-text">{String(fm.triggers)}</p>
              </div>
            )}
          </div>

          {/* File list */}
          <div class="rounded-xl p-3" style={{ backgroundColor: 'var(--forge-surface)', border: '1px solid var(--forge-ghost-border)' }}>
            <div class="flex items-center justify-between mb-2">
              <span class="text-[10px] font-bold text-forge-muted uppercase tracking-wider">Files</span>
              <button
                class="text-[10px] text-forge-accent hover:underline"
                onClick={handleAddReference}
              >
                + Add ref
              </button>
            </div>
            {files.map(f => (
              <div key={f} class="flex items-center gap-1">
                <button
                  class="flex-1 text-left px-2 py-1.5 text-xs rounded-lg transition-colors truncate"
                  style={activeFile === f
                    ? { backgroundColor: 'var(--forge-tint-accent-bg)', color: 'var(--forge-accent)', fontWeight: 600 }
                    : { color: 'var(--forge-muted)' }
                  }
                  onClick={() => setActiveFile(f)}
                >
                  {f}
                </button>
                {f !== 'SKILL.md' && (
                  <button
                    class="text-xs text-forge-muted hover:text-forge-error px-1 shrink-0"
                    onClick={() => handleDeleteReference(f)}
                    title={`Delete ${f}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right editor */}
        <div class="flex-1 flex flex-col min-w-0">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs text-forge-muted font-medium">{activeFile}</span>
            <div class="flex items-center gap-2">
              <ActionButton label={saving ? 'Saving...' : 'Save'} variant="primary" loading={saving} onClick={handleSave} />
              <ActionButton label={deleting ? 'Deleting...' : 'Delete'} variant="danger" loading={deleting} onClick={handleDelete} />
            </div>
          </div>
          <textarea
            class="flex-1 w-full px-4 py-3 text-sm font-mono rounded-xl bg-forge-surface border text-forge-text focus:border-forge-accent focus:outline-none resize-none"
            style={{ borderColor: 'var(--forge-ghost-border)', minHeight: '400px' }}
            value={activeFile === 'SKILL.md' ? content : (refContents[activeFile] ?? '')}
            onInput={(e) => {
              const val = (e.target as HTMLTextAreaElement).value
              if (activeFile === 'SKILL.md') {
                setContent(val)
              } else {
                setRefContents(prev => ({ ...prev, [activeFile]: val }))
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Explore sub-view                                                   */
/* ================================================================== */

const SkillExploreView: FunctionComponent<{
  onBack: () => void
}> = ({ onBack }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ExploreResult[]>([])
  const [searching, setSearching] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/skills/explore?q=${encodeURIComponent(query.trim())}`)
      if (!res.ok) throw new Error('search failed')
      const data = await res.json() as { results: ExploreResult[] }
      setResults(data.results)
    } catch {
      showToast('Failed to search skills', 'error')
    } finally {
      setSearching(false)
    }
  }

  const handleInstall = async (slug: string) => {
    setInstalling(slug)
    try {
      const res = await fetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, scope: 'global' }),
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) showToast('Skill installed', 'success')
      else showToast(result.error ?? 'Failed to install', 'error')
    } catch {
      showToast('Failed to install', 'error')
    } finally {
      setInstalling(null)
    }
  }

  return (
    <div>
      <BackButton label="Back to skills" onClick={onBack} />
      <h2 class="text-xl font-bold text-forge-text mb-6">Explore Skills</h2>

      {/* Search */}
      <div class="flex items-center gap-3 mb-6">
        <input
          type="text"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if ((e as KeyboardEvent).key === 'Enter') handleSearch() }}
          placeholder="Search the skills registry..."
          class="flex-1 px-3 py-2 text-sm rounded-lg bg-forge-surface border text-forge-text focus:border-forge-accent focus:outline-none"
          style={{ borderColor: 'var(--forge-ghost-border)' }}
        />
        <ActionButton label={searching ? 'Searching...' : 'Search'} variant="primary" loading={searching} onClick={handleSearch} />
      </div>

      {/* Results */}
      {results.length === 0 && !searching && (
        <div class="py-12 text-center text-forge-muted text-sm">
          {query ? 'No results found.' : 'Search for skills to install.'}
        </div>
      )}

      <div class="space-y-2">
        {results.map(r => (
          <div
            key={r.slug}
            class="flex items-center justify-between px-4 py-3 rounded-xl border"
            style={{ backgroundColor: 'var(--forge-surface)', borderColor: 'var(--forge-ghost-border)' }}
          >
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-semibold text-forge-text">{r.name}</span>
                <span class="text-[10px] text-forge-muted">{r.repo}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-forge-muted">{r.installs} installs</span>
              </div>
            </div>
            <ActionButton
              label={installing === r.slug ? 'Installing...' : 'Install'}
              variant="secondary"
              loading={installing === r.slug}
              onClick={() => handleInstall(r.slug)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Create sub-view                                                    */
/* ================================================================== */

const SkillCreateView: FunctionComponent<{
  accounts: string[]
  projects: Record<string, { path: string; account: string }>
  onBack: () => void
  onCreated: () => void
  onCreateWithAI?: (scope: string, scopeRef: string, description: string) => void
}> = ({ accounts, projects, onBack, onCreated, onCreateWithAI }) => {
  const [scope, setScope] = useState<'global' | 'account' | 'project'>('global')
  const [scopeRef, setScopeRef] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const projectNames = Object.keys(projects)

  // Default scopeRef when scope changes
  const handleScopeChange = (s: 'global' | 'account' | 'project') => {
    setScope(s)
    if (s === 'account' && accounts.length > 0 && !accounts.includes(scopeRef)) {
      setScopeRef(accounts[0])
    } else if (s === 'project' && projectNames.length > 0 && !projectNames.includes(scopeRef)) {
      setScopeRef(projectNames[0])
    } else if (s === 'global') {
      setScopeRef('')
    }
  }

  const handleCreateManually = async () => {
    if (!name.trim()) return
    setCreating(true)
    const template = `---\nname: ${name.trim()}\ndescription: ${description.trim()}\ndomain: general\n---\n\n# ${name.trim()}\n\n${description.trim()}\n`
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, scopeRef: scopeRef || undefined, name: name.trim(), content: template }),
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

  const handleCreateWithAI = () => {
    if (!description.trim()) {
      showToast('Provide a description for AI skill creation', 'info')
      return
    }
    onCreateWithAI?.(scope, scopeRef, description.trim())
  }

  return (
    <div>
      <BackButton label="Back to skills" onClick={onBack} />
      <h2 class="text-xl font-bold text-forge-text mb-6">Create Skill</h2>

      <div class="max-w-lg">
        {/* Scope picker */}
        <div class="mb-4">
          <label class="block text-sm font-medium mb-2">Scope</label>
          <div class="flex gap-2">
            {(['global', 'account', 'project'] as const).map(s => (
              <button
                key={s}
                class="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                style={scope === s
                  ? { backgroundColor: `${SCOPE_COLORS[s]}18`, borderColor: SCOPE_COLORS[s], color: SCOPE_COLORS[s] }
                  : { backgroundColor: 'var(--forge-surface)', borderColor: 'var(--forge-ghost-border)', color: 'var(--forge-muted)' }
                }
                onClick={() => handleScopeChange(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Scope ref selector */}
        {scope === 'account' && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Account</label>
            <select
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              value={scopeRef}
              onChange={(e) => setScopeRef((e.target as HTMLSelectElement).value)}
            >
              {accounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}
        {scope === 'project' && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Project</label>
            <select
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              value={scopeRef}
              onChange={(e) => setScopeRef((e.target as HTMLSelectElement).value)}
            >
              {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}

        {/* Name */}
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="my-skill"
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
          />
        </div>

        {/* Description */}
        <div class="mb-6">
          <label class="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
            placeholder="What does this skill do?"
            rows={3}
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
          />
        </div>

        {/* Buttons */}
        <div class="flex items-center gap-3">
          <ActionButton
            label={creating ? 'Creating...' : 'Create Manually'}
            variant="primary"
            loading={creating}
            disabled={!name.trim()}
            onClick={handleCreateManually}
          />
          {onCreateWithAI && (
            <ActionButton
              label="Create with AI"
              variant="secondary"
              disabled={!description.trim()}
              onClick={handleCreateWithAI}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  Main Skills component                                              */
/* ================================================================== */

export const Skills: FunctionComponent<SkillsProps> = ({ accounts, projects, onBack, onCreateWithAI }) => {
  const [view, setView] = useState<SubView>('list')
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [scopeFilter, setScopeFilter] = useState('')
  const [editingSkill, setEditingSkill] = useState<SkillEntry | null>(null)

  const firstAccount = accounts[0] ?? ''
  const firstProject = Object.keys(projects)[0] ?? ''

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (firstAccount) params.set('account', firstAccount)
      if (firstProject) params.set('project', firstProject)
      const res = await fetch(`/api/skills?${params.toString()}`)
      if (!res.ok) throw new Error('fetch failed')
      setSkills(await res.json() as SkillEntry[])
    } catch {
      showToast('Failed to load skills', 'error')
    } finally {
      setLoading(false)
    }
  }, [firstAccount, firstProject])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  const handleSelectSkill = (skill: SkillEntry) => {
    setEditingSkill(skill)
    setView('editor')
  }

  const handleBackToList = () => {
    setView('list')
    setEditingSkill(null)
    fetchSkills()
  }

  if (view === 'editor' && editingSkill) {
    return (
      <div>
        <BackButton label="Back to tasks" onClick={onBack} />
        <SkillEditorView
          skill={editingSkill}
          onBack={handleBackToList}
          onDeleted={handleBackToList}
        />
      </div>
    )
  }

  if (view === 'explore') {
    return (
      <div>
        <BackButton label="Back to tasks" onClick={onBack} />
        <SkillExploreView onBack={handleBackToList} />
      </div>
    )
  }

  if (view === 'create') {
    return (
      <div>
        <BackButton label="Back to tasks" onClick={onBack} />
        <SkillCreateView
          accounts={accounts}
          projects={projects}
          onBack={handleBackToList}
          onCreated={handleBackToList}
          onCreateWithAI={onCreateWithAI}
        />
      </div>
    )
  }

  return (
    <div>
      <BackButton label="Back to tasks" onClick={onBack} />
      <SkillListView
        skills={skills}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        scopeFilter={scopeFilter}
        onScopeFilter={setScopeFilter}
        onSelect={handleSelectSkill}
        onExplore={() => setView('explore')}
        onCreate={() => setView('create')}
      />
    </div>
  )
}

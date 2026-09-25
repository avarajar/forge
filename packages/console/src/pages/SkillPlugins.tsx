import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'
import type { PluginEntry, PluginInstall } from '@forge-dev/core'
import { PaneHeader } from '../components/PaneHeader.js'
import { Field } from '../components/Field.js'
import { loadMarketplaces, loadPlugins, marketplaces, plugins } from '../hooks/usePlugins.js'
import { pluginAreas } from '../config/plugins.js'
import { errorText, postJson } from '../config/api.js'

const pluginPath = (id: string) => `/api/skills/plugins/${encodeURIComponent(id)}`


// runs a plugin command; toasts the server's error and resolves to null on failure
async function runPluginCommand<T>(url: string, body: object): Promise<T | null> {
  try {
    return await postJson<T>(url, body)
  } catch (err) {
    showToast(errorText(err), 'error')
    return null
  }
}

async function installPlugin(id: string, name: string, account: string): Promise<void> {
  if (!await runPluginCommand('/api/skills/plugins/install', { id, account })) return
  showToast(`${name} installed in ${account} · applies to new sessions`, 'success')
  await Promise.all([loadPlugins(), loadMarketplaces()]).catch(() => {})
}

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
    const result = await runPluginCommand<{ version?: string }>(`${pluginPath(plugin.id)}/update`, { scope: install.scope, scopeRef: install.scopeRef })
    setBusy(false)
    if (!result) return
    showToast(`${plugin.name} ${result.version ?? ''} · applies to new sessions`, 'success')
    void loadPlugins().catch(() => {})
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

const MissingRow: FunctionComponent<{ plugin: PluginEntry; account: string }> = ({ plugin, account }) => {
  const [busy, setBusy] = useState(false)
  const install = async () => {
    setBusy(true)
    await installPlugin(plugin.id, plugin.name, account)
    setBusy(false)
  }
  return (
    <div class="flex items-center" style={rowStyle}>
      <span class="flex-1" style={{ fontSize: '13px', color: 'var(--ink-2)' }}>{account}</span>
      <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>not installed</span>
      <ActionButton label={busy ? 'Installing…' : 'Install'} variant="secondary" size="sm" loading={busy} onClick={install} />
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
              {missing.map(a => <MissingRow key={a} plugin={plugin} account={a} />)}
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

/* ── Add a plugin ── */

export const PluginBrowser: FunctionComponent<{ accounts: string[] }> = ({ accounts }) => {
  const [picked, setPicked] = useState('')
  const account = accounts.includes(picked) ? picked : accounts[0] ?? ''
  const [market, setMarket] = useState('')
  const [filter, setFilter] = useState('')
  const [source, setSource] = useState('')
  const [adding, setAdding] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)

  useEffect(() => {
    if (marketplaces.value === null) loadMarketplaces().catch(() => showToast('Failed to load marketplaces', 'error'))
  }, [])

  const list = marketplaces.value
  const shown = list?.find(m => m.name === market) ?? list?.[0]
  const installed = new Set((plugins.value ?? []).flatMap(p => p.installs.some(i => i.scope === 'account' && i.scopeRef === account) ? [p.id] : []))
  const q = filter.trim().toLowerCase()
  const catalog = (shown?.plugins ?? []).filter(p => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))

  const addMarketplace = async () => {
    setAdding(true)
    const added = await runPluginCommand('/api/skills/marketplaces', { source: source.trim(), account })
    setAdding(false)
    if (!added) return
    showToast(`Marketplace added to ${account}`, 'success')
    setSource('')
    await loadMarketplaces().catch(() => {})
  }

  const install = async (id: string, name: string) => {
    setInstalling(id)
    await installPlugin(id, name, account)
    setInstalling(null)
  }

  return (
    <>
      <PaneHeader title="Add a plugin" sub={account ? `Claude Code only · installs into ${account}` : 'Claude Code only'} />
      <div class="flex-1 min-h-0 overflow-auto flex flex-col" style={{ padding: '14px 20px 20px', gap: '8px' }}>
        <div class="flex flex-col" style={{ gap: '10px', maxWidth: '560px', marginBottom: '6px' }}>
          {accounts.length === 0 && <p style={{ fontSize: '13px', color: 'var(--ink-2)', margin: 0 }}>Plugins install into a CW account. Add one in Accounts first.</p>}
          {accounts.length > 0 && (
            <Field label="Account">
              <select class="field" value={account} onChange={(e) => setPicked((e.target as HTMLSelectElement).value)}>
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
          )}
          {list && list.length > 0 && (
            <Field label="Marketplace">
              <select class="field" value={shown?.name} onChange={(e) => setMarket((e.target as HTMLSelectElement).value)}>
                {list.map(m => <option key={m.name} value={m.name}>{m.name} · {m.source}</option>)}
              </select>
            </Field>
          )}
          <Field label="Add a marketplace">
            <div class="flex" style={{ gap: '8px' }}>
              <input class="field flex-1" value={source} placeholder="owner/repo, git URL or path" onInput={(e) => setSource((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter' && source.trim()) void addMarketplace() }} />
              <ActionButton label={adding ? 'Adding…' : 'Add'} variant="secondary" size="sm" loading={adding} disabled={!source.trim() || !account} onClick={addMarketplace} />
            </div>
          </Field>
          {shown && shown.plugins.length > 0 && (
            <input class="field" type="search" aria-label="Filter plugins" value={filter} placeholder={`Filter ${shown.plugins.length} plugins`} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
          )}
        </div>
        {list === null && <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>Loading marketplaces…</p>}
        {list?.length === 0 && <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>No marketplace yet. Add one above.</p>}
        {shown && catalog.length === 0 && <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>{q ? 'No plugin matches.' : 'This marketplace lists no plugins.'}</p>}
        {catalog.map((p, i) => (
          <div key={p.id} class="flex items-center" style={{ gap: '12px', padding: '11px 15px', borderRadius: '13px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', animation: `riseIn .3s var(--ease) ${Math.min(i, 8) * 40}ms both` }}>
            <div class="flex-1 min-w-0">
              <div class="flex items-center min-w-0" style={{ gap: '8px' }}>
                <span class="truncate" style={{ fontSize: '13.5px', fontWeight: 600 }}>{p.name}</span>
                {p.category && <span class="mono shrink-0" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>{p.category}</span>}
              </div>
              {p.description && <div class="truncate" style={{ fontSize: '12px', color: 'var(--ink-2)' }} title={p.description}>{p.description}</div>}
            </div>
            {installed.has(p.id)
              ? <span style={{ fontSize: '12px', color: 'var(--green)' }}>Installed</span>
              : <ActionButton label={installing === p.id ? 'Installing…' : 'Install'} variant="secondary" size="sm" loading={installing === p.id} disabled={installing !== null || !account} onClick={() => install(p.id, p.name)} />}
          </div>
        ))}
      </div>
    </>
  )
}

/* ── Propose a skill ── */

export const ProposeSkill: FunctionComponent<{
  plugin: PluginEntry
  accounts: string[]
  onSubmit: (text: string, area: string | undefined, account: string) => Promise<void>
  onCancel: () => void
}> = ({ plugin, accounts, onSubmit, onCancel }) => {
  const areas = pluginAreas(plugin)
  // the session only edits the repository and does not need the plugin installed, so every CW
  // account is offered; default to one that already has this plugin installed, if any
  const installedAccounts = plugin.installs.filter(i => i.scope === 'account').map(i => i.scopeRef)
  const defaultAccount = accounts.find(a => installedAccounts.includes(a)) ?? accounts[0] ?? ''
  const [text, setText] = useState('')
  const [area, setArea] = useState(areas[0] ?? '')
  const [account, setAccount] = useState(defaultAccount)
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

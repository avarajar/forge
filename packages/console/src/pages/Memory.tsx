import { Fragment, type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, Badge, EmptyState, Tabs, showToast } from '@forge-dev/ui'
import type { KiokuBrain, KiokuWrite } from '@forge-dev/core'
import { PageHeader } from '../components/PageHeader.js'
import { errorText, postJson } from '../config/api.js'
import { kindToken, pageCard as card, pageNote as note, shortAgo, soft, tierToken } from '../config/types.js'
import { brainName, chainFor, kioku, loadKioku, loadLabs, loadReleases, sumPages, watchKioku } from '../hooks/useKioku.js'
import { loadPlugins } from '../hooks/usePlugins.js'
import { Dot } from '../components/Dot.js'
import { NewMemory } from '../components/NewMemory.js'
import { AreaForm, LinkBrain, NewBrain, PublishBrain } from '../components/BrainForms.js'
import { KiokuLabs, KiokuVersions, PluginMismatch, TryVersion } from '../components/KiokuVersions.js'

interface MemoryProps {
  project: string | null
  onProject: (project: string | null) => void
}

const GROUPS = [
  { label: 'Personal', tiers: ['personal'] },
  { label: 'Projects', tiers: ['project', 'client'] },
  { label: 'Team', tiers: ['team'] },
]

const VERB_TOKEN: Record<string, string> = { save: '--green', update: '--blue', supersede: '--blue', evolve: '--purple', link: '--teal', confirm: '--green', retire: '--red', forget: '--red' }

const KindBar: FunctionComponent<{ brain: KiokuBrain }> = ({ brain }) => {
  const kinds = Object.entries(brain.kinds).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return (
    <>
      <div class="flex overflow-hidden" style={{ height: '6px', borderRadius: '99px', background: 'var(--elev)' }}>
        {kinds.map(([kind, n]) => <span key={kind} title={`${kind} ${n}`} style={{ width: `${(n / brain.pages) * 100}%`, background: `var(${kindToken(kind)})` }} />)}
      </div>
      <div class="flex flex-wrap" style={{ gap: '3px 10px', fontSize: '11px', color: 'var(--ink-2)' }}>
        {kinds.slice(0, 3).map(([kind, n]) => (
          <span key={kind} class="inline-flex items-center" style={{ gap: '4px' }}>
            <Dot color={`var(${kindToken(kind)})`} />{kind} {n}
          </span>
        ))}
      </div>
    </>
  )
}

const cardAction = { fontSize: '11.5px', fontWeight: 500, color: 'var(--blue)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }

// one dialog of the page at a time
type Dialog = { kind: 'memory' | 'brain' | 'link' } | { kind: 'area' | 'publish'; brain: KiokuBrain } | { kind: 'version'; version: string }

const BrainCard: FunctionComponent<{ brain: KiokuBrain; usedBy?: string[]; showTier?: boolean; onDialog: (d: Dialog) => void }> = ({ brain, usedBy, showTier, onDialog }) => {
  const token = tierToken(brain.tier)
  return (
    <div class="flex flex-col min-w-0" style={{ ...card, gap: '9px', padding: '14px 16px', borderTop: `3px solid var(${token})` }}>
      <div class="flex items-center" style={{ gap: '8px' }}>
        {showTier && <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: `var(${token})` }}>{brain.tier}</span>}
        <span class="truncate" style={{ fontSize: '14.5px', fontWeight: 600 }} title={brain.folder}>{brainName(brain)}</span>
        <span class="flex-1" />
        <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>{brain.onDisk ? (brain.touched ? shortAgo(brain.touched) : 'quiet') : 'not on disk'}</span>
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1 }}>
        {brain.pages} <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--ink-3)' }}>pages</span>
      </div>
      {brain.pages > 0 && <KindBar brain={brain} />}
      {usedBy && (
        <div class="flex flex-wrap" style={{ gap: '4px' }}>
          {brain.tier === 'personal'
            ? <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>loads in every session</span>
            : usedBy.length === 0
              ? <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>no CW project loads it</span>
              : usedBy.map(p => <Badge key={p} label={p} variant="neutral" />)}
        </div>
      )}
      {brain.onDisk && (
        <div class="flex items-center" style={{ gap: '12px', paddingTop: '8px', marginTop: 'auto', borderTop: '1px solid var(--hair)' }}>
          <button type="button" style={cardAction} onClick={() => onDialog({ kind: 'area', brain })}>+ Area</button>
          <span class="flex-1" />
          {!brain.remote && (
            <>
              <span style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>only on this machine</span>
              <button type="button" style={cardAction} onClick={() => onDialog({ kind: 'publish', brain })}>Publish…</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const Activity: FunctionComponent<{ writes: KiokuWrite[] }> = ({ writes }) => (
  <section style={{ ...card, overflow: 'hidden' }}>
    <h2 style={{ padding: '12px 16px 6px', fontSize: '11px', fontWeight: 600, letterSpacing: '.02em', color: 'var(--ink-3)' }}>RECENT ACTIVITY · LAST 2 WEEKS</h2>
    {writes.length === 0 && <p style={{ padding: '4px 16px 14px', fontSize: '12.5px', color: 'var(--ink-3)' }}>Nothing written lately.</p>}
    {writes.map(w => (
      <div key={`${w.brain}:${w.path}:${w.date}:${w.verb}`} class="flex items-center" style={{ gap: '10px', padding: '9px 16px', borderTop: '1px solid var(--hair)', fontSize: '12.5px' }}>
        <span class="shrink-0 flex justify-center" style={{ width: '76px' }}><Badge label={w.verb} color={`var(${VERB_TOKEN[w.verb] ?? '--ink-2'})`} /></span>
        <span class="truncate flex-1" title={w.path}>{w.title}</span>
        <span class="shrink-0" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>{w.brain}{w.author ? ` · ${w.author}` : ''} · {shortAgo(w.date)}</span>
      </div>
    ))}
  </section>
)

export const Memory: FunctionComponent<MemoryProps> = ({ project, onProject }) => {
  const [opening, setOpening] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const closeDialog = () => setDialog(null)
  useEffect(() => watchKioku(), [])
  const status = kioku.value
  const installed = status?.installed === true
  // versions, labs and the plugin's version per account are read only while the page is open
  const loadVersions = (fresh = false) => Promise.all([loadReleases(fresh), loadLabs(), loadPlugins().catch(() => {})])
  useEffect(() => { if (installed) void loadVersions() }, [installed])
  const tryVersion = (version: string) => setDialog({ kind: 'version', version })

  const openViewer = async () => {
    // opened before the request so the browser does not treat it as a popup
    const tab = window.open('', '_blank')
    setOpening(true)
    try {
      const { address } = await postJson<{ address: string }>('/api/kioku/viewer', {})
      if (tab) tab.location.href = address
      else showToast(`Viewer running at ${address}`, 'info')
      void loadKioku()
    } catch (err) {
      tab?.close()
      showToast(errorText(err), 'error')
    } finally {
      setOpening(false)
    }
  }

  const stopViewer = async () => {
    await fetch('/api/kioku/viewer', { method: 'DELETE' }).catch(() => {})
    void loadKioku()
  }

  const brains = status?.brains ?? []
  const projects = status?.projects ?? {}
  // projects with a brain of their own or a team's, plus the one picked in the sidebar
  const options = Object.keys(projects).filter(p => projects[p].some(l => l.tier !== 'personal')).sort()
  if (project && !options.includes(project)) options.unshift(project)
  const chain = project ? chainFor(project) : []
  const usedBy = (b: KiokuBrain) => Object.keys(projects).filter(p => projects[p].some(l => l.name === brainName(b))).sort()
  const shown = new Set(chain.map(brainName))
  const activity = (status?.activity ?? []).filter(w => !project || shown.has(w.brain)).slice(0, 15)

  const subtitle = !status?.installed
    ? 'Kioku brains on this machine'
    : project
      ? `${project} · ${sumPages(chain)} pages its sessions can recall`
      : `Kioku ${status.version ?? ''} · ${sumPages(brains)} pages in ${brains.length} brain${brains.length === 1 ? '' : 's'}`

  return (
    <>
      <PageHeader title="Memory" subtitle={subtitle}>
        {status?.viewer && <ActionButton label="Stop viewer" variant="secondary" onClick={stopViewer} />}
        <ActionButton label="Refresh" variant="secondary" onClick={() => Promise.all([loadKioku(true), installed && loadVersions(true)])} />
        <ActionButton label="New brain" variant="secondary" disabled={!status?.installed} onClick={() => setDialog({ kind: 'brain' })} />
        <ActionButton label="New memory" variant="secondary" disabled={!brains.some(b => b.onDisk)} onClick={() => setDialog({ kind: 'memory' })} />
        <ActionButton label={status?.viewer ? 'Viewer open ↗' : 'Open viewer'} variant="primary" disabled={!status?.installed || opening} onClick={openViewer} />
      </PageHeader>

      <div class="flex flex-col w-full" style={{ padding: '18px 22px 40px', gap: '14px', maxWidth: '1180px' }}>
        {status && !status.installed && (
          <p style={{ ...note, background: soft('--red') }}>
            Kioku is not installed. Install it from <code>monoku/kioku</code> with its <code>install.sh</code>, which puts <code>kioku</code> in <code>~/.local/bin</code>.
          </p>
        )}

        {installed && <PluginMismatch onTry={tryVersion} />}

        {installed && !project && (
          <div class="grid items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: '12px' }}>
            <KiokuVersions onTry={tryVersion} />
            <KiokuLabs />
          </div>
        )}

        {status?.installed && brains.length === 0 && (
          <EmptyState icon="i-lucide-brain" title="No brains yet" description="New brain makes one on this machine: a personal one for what you learn anywhere, a project or team one to share." />
        )}

        {brains.length > 0 && options.length > 0 && (
          <div class="flex">
            <Tabs size="sm" label="Project" tabs={[{ id: '', label: 'All' }, ...options.map(p => ({ id: p, label: p }))]} active={project ?? ''} onChange={(id) => onProject(id || null)} />
          </div>
        )}

        {brains.length > 0 && !project && (
          // groups sit side by side, each as wide as its cards, and wrap when they do not fit
          <div class="flex flex-wrap" style={{ gap: '14px 12px' }}>
            {GROUPS.map(group => {
              const list = brains.filter(b => group.tiers.includes(b.tier ?? ''))
              if (list.length === 0) return null
              return (
                <section key={group.label} class="flex flex-col min-w-0" style={{ gap: '8px', flex: `${list.length} 1 ${list.length * 250}px` }}>
                  <h2 class="flex items-center" style={{ gap: '8px', fontSize: '11px', fontWeight: 600, letterSpacing: '.03em', color: `var(${tierToken(group.tiers[0])})` }}>
                    ● {group.label.toUpperCase()}
                    {list.length > 1 && <span style={{ color: 'var(--ink-3)' }}>{list.length}</span>}
                  </h2>
                  <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                    {list.map(b => <BrainCard key={b.key} brain={b} usedBy={usedBy(b)} onDialog={setDialog} />)}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {project && chain.length > 0 && (
          <div class="grid items-center" style={{ gridTemplateColumns: chain.map(() => 'minmax(0, 1fr)').join(' 24px ') }}>
            {chain.map((b, i) => (
              <Fragment key={b.key}>
                {i > 0 && <span style={{ textAlign: 'center', color: 'var(--ink-3)', fontSize: '16px' }}>→</span>}
                <BrainCard brain={b} showTier onDialog={setDialog} />
              </Fragment>
            ))}
          </div>
        )}

        {project && status?.installed && !chain.some(b => b.tier !== 'personal') && (
          <div class="flex items-center" style={{ ...note, gap: '12px', background: 'var(--elev)', color: 'var(--ink-2)' }}>
            <span class="flex-1">{project} has no project or team brain, so its sessions recall only yours.</span>
            <ActionButton label="Give it a brain" variant="secondary" size="sm" onClick={() => setDialog({ kind: 'link' })} />
          </div>
        )}

        {brains.length > 0 && <Activity writes={activity} />}

        {status?.installed && (
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
            Open viewer starts <code>kioku web</code>: the graph of every page, each page with its history, lint and the latest changes. It opens in its own tab and stops with Forge.
          </p>
        )}
      </div>

      {dialog?.kind === 'memory' && <NewMemory project={project} onClose={closeDialog} />}
      {dialog?.kind === 'brain' && <NewBrain onClose={closeDialog} />}
      {dialog?.kind === 'link' && project && <LinkBrain project={project} onClose={closeDialog} />}
      {dialog?.kind === 'area' && <AreaForm brain={dialog.brain} onClose={closeDialog} />}
      {dialog?.kind === 'publish' && <PublishBrain brain={dialog.brain} onClose={closeDialog} />}
      {dialog?.kind === 'version' && <TryVersion version={dialog.version} onClose={closeDialog} />}
    </>
  )
}

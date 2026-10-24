import { type FunctionComponent } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { ActionButton, Badge, EmptyState, showToast } from '@forge-dev/ui'
import type { KiokuBrain, KiokuStatus } from '@forge-dev/core'
import { PageHeader } from '../components/PageHeader.js'
import { errorText, postJson } from '../config/api.js'
import { pageCard as card, pageNote as note, soft } from '../config/types.js'

const TIER_ORDER = ['personal', 'project', 'client', 'team']

const tierRank = (b: KiokuBrain) => {
  const i = TIER_ORDER.indexOf(b.tier ?? '')
  return i === -1 ? TIER_ORDER.length : i
}

export const Memory: FunctionComponent = () => {
  const [status, setStatus] = useState<KiokuStatus | null>(null)
  const [opening, setOpening] = useState(false)

  const load = useCallback(async () => {
    try {
      setStatus(await (await fetch('/api/kioku/status')).json() as KiokuStatus)
    } catch {
      setStatus({ installed: false, version: null, brains: [], viewer: null })
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openViewer = async () => {
    // opened before the request so the browser does not treat it as a popup
    const tab = window.open('', '_blank')
    setOpening(true)
    try {
      const { address } = await postJson<{ address: string }>('/api/kioku/viewer', {})
      if (tab) tab.location.href = address
      else showToast(`Viewer running at ${address}`, 'info')
      void load()
    } catch (err) {
      tab?.close()
      showToast(errorText(err), 'error')
    } finally {
      setOpening(false)
    }
  }

  const stopViewer = async () => {
    await fetch('/api/kioku/viewer', { method: 'DELETE' }).catch(() => {})
    void load()
  }

  const brains = [...(status?.brains ?? [])].sort((a, b) => tierRank(a) - tierRank(b))

  return (
    <>
      <PageHeader title="Memory" subtitle={status?.version ? `Kioku ${status.version} · brains on this machine` : 'Kioku brains on this machine'}>
        {status?.viewer && <ActionButton label="Stop viewer" variant="secondary" onClick={stopViewer} />}
        <ActionButton label="Refresh" variant="secondary" onClick={load} />
        <ActionButton label={status?.viewer ? 'Viewer open ↗' : 'Open viewer'} variant="primary" disabled={!status?.installed || opening} onClick={openViewer} />
      </PageHeader>

      <div class="flex flex-col w-full" style={{ padding: '18px 22px 40px', gap: '14px', maxWidth: '1180px' }}>
        {status && !status.installed && (
          <p style={{ ...note, background: soft('--red') }}>
            Kioku is not installed. Install it from <code>monoku/kioku</code> with its <code>install.sh</code>, which puts <code>kioku</code> in <code>~/.local/bin</code>.
          </p>
        )}

        {status?.installed && brains.length === 0 && (
          <EmptyState icon="i-lucide-brain" title="No brains yet" description="Create your personal brain with 'kioku brain create <name> --tier personal' in a terminal, or run 'kioku init' in a repository." />
        )}

        {brains.length > 0 && (
          <section style={{ ...card, overflow: 'hidden' }}>
            {brains.map(brain => (
              <div key={brain.key} class="flex items-center flex-wrap" style={{ gap: '10px', padding: '12px 18px', borderBottom: '1px solid var(--hair)' }}>
                <div class="min-w-0" style={{ flex: '1 1 220px' }}>
                  <p class="truncate" style={{ fontSize: '13.5px', fontWeight: 500 }}>{brain.name ?? brain.key}</p>
                  <p class="truncate mono" style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{brain.folder}</p>
                </div>
                <Badge label={brain.onDisk ? (brain.tier ?? 'brain') : 'not on disk'} color="var(--purple)" />
                <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{brain.remote ?? 'no remote'}</span>
              </div>
            ))}
          </section>
        )}

        {status?.installed && (
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
            The viewer is <code>kioku web</code>: the graph of every page, each page with its history, lint and the latest changes. It opens in its own tab and stops with Forge.
          </p>
        )}
      </div>
    </>
  )
}

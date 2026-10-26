import { Component, type ComponentChildren, type FunctionComponent } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ActionButton, EmptyState, Modal, showToast } from '@forge-dev/ui'
import type { ModuleStatus, PanelConfig, PanelProps } from '@forge-dev/sdk'
import { PageHeader } from '../components/PageHeader.js'
import { modules, moduleWarning, refreshModules } from '../hooks/useModules.js'
import { markModuleSeen, moduleCounts } from '../hooks/useModuleNotifications.js'
import { createPanelClient } from '../config/moduleClient.js'
import { ModuleSettings } from '../components/ModuleSettings.js'
import { errorText, requestJson } from '../config/api.js'

interface Props {
  moduleId: string
  cwProject: string | null
  onBack: () => void
}

// one broken view never takes the rest of the console with it
class ViewBoundary extends Component<{ name: string; onReload: () => void; children: ComponentChildren }, { error: Error | null }> {
  state = { error: null as Error | null }
  componentDidCatch(error: Error) {
    this.setState({ error })
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <ViewError title={`${this.props.name}'s view crashed`} message={error.message} onReload={() => { this.setState({ error: null }); this.props.onReload() }} />
  }
}

const ViewError: FunctionComponent<{ title: string; message: string; onReload: () => void }> = ({ title, message, onReload }) => (
  <div style={{ margin: '24px 22px', padding: '16px 18px', borderRadius: '14px', background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--red) 45%, var(--hair))' }}>
    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--red)' }}>{title}</div>
    <pre class="mono" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{message}</pre>
    <div style={{ marginTop: '12px' }}><ActionButton label="Reload view" variant="secondary" size="sm" onClick={onReload} /></div>
  </div>
)

// settings stay in Forge's database, so installing the module again brings them back
const RemoveModule: FunctionComponent<{ status: ModuleStatus; onClose: () => void; onRemoved: () => void }> = ({ status, onClose, onRemoved }) => {
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    try {
      modules.value = await requestJson<ModuleStatus[]>('DELETE', `/api/modules/${encodeURIComponent(status.id)}`)
      showToast(`Removed ${status.displayName}`, 'success')
      onRemoved()
    } catch (err) {
      showToast(errorText(err), 'error')
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      title={`Remove ${status.displayName}?`}
      onClose={onClose}
      footer={
        <>
          <span class="flex-1" />
          <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
          <ActionButton label="Remove" variant="destructive" loading={busy} onClick={remove} />
        </>
      }
    >
      <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
        Forge uninstalls <span class="mono">{status.name}</span> and stops it now. Its settings stay saved, so installing it again brings them back.
      </p>
    </Modal>
  )
}

const loadedViews = new Map<string, Promise<PanelConfig>>()

function importView(status: ModuleStatus): Promise<PanelConfig> {
  const url = `${status.view!.url}?v=${encodeURIComponent(status.view!.version)}`
  let p = loadedViews.get(url)
  if (!p) {
    p = import(/* @vite-ignore */ url).then((m: { default?: PanelConfig }) => {
      if (!m.default || typeof m.default.component !== 'function') throw new Error('view.js must default-export definePanel({...})')
      return m.default
    })
    p.catch(() => loadedViews.delete(url))
    loadedViews.set(url, p)
  }
  return p
}

export const ModuleView: FunctionComponent<Props> = ({ moduleId, cwProject, onBack }) => {
  const status = modules.value.find(m => m.id === moduleId)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [panel, setPanel] = useState<{ version: string; config?: PanelConfig; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  // a removed module keeps the name it had while it was loaded
  const lastName = useRef(moduleId)
  if (status) lastName.current = status.displayName
  const name = lastName.current
  const client = useMemo(() => createPanelClient(moduleId, () => lastName.current, () => setSettingsOpen(true)), [moduleId])
  const version = status?.state === 'enabled' ? status.view?.version : undefined

  const unseen = moduleCounts.value[moduleId]?.attention ?? 0
  useEffect(() => { if (unseen > 0) void markModuleSeen(moduleId) }, [moduleId, unseen])

  useEffect(() => {
    if (!status || !version) return
    let live = true
    importView(status).then(
      config => { if (live) setPanel({ version, config }) },
      (err: Error) => { if (live) setPanel({ version, error: err.message }) },
    )
    return () => { live = false }
  }, [moduleId, version, attempt])

  const warning = status ? moduleWarning(status) : null

  const header = (
    <PageHeader title={status?.view?.title ?? name} subtitle={status ? `${status.name} ${status.version}` : undefined}>
      {warning && <span class="mono truncate" title={warning} style={{ maxWidth: '320px', fontSize: '11.5px', color: 'var(--orange)' }}>⚠ {warning}</span>}
      {status?.settingsSchema && Object.keys(status.settingsSchema).length > 0 && (
        <ActionButton label="Settings" icon="i-lucide-settings" variant="secondary" size="sm" onClick={() => setSettingsOpen(true)} />
      )}
      {status?.removable && (
        <ActionButton label="Remove" icon="i-lucide-trash-2" variant="secondary" size="sm" onClick={() => setRemoving(true)} />
      )}
      {removing && status && <RemoveModule status={status} onClose={() => setRemoving(false)} onRemoved={onBack} />}
    </PageHeader>
  )

  if (!status) {
    return (
      <div>
        {header}
        <div style={{ padding: '56px 22px' }}>
          <EmptyState icon="i-lucide-package-x" title={`${name} was removed`} description="The module is no longer installed." action={{ label: 'Back to Tasks', onClick: onBack }} />
        </div>
      </div>
    )
  }

  if (status.state !== 'enabled') {
    return (
      <div>
        {header}
        <ViewError title={`${name} is disabled`} message={status.reason ?? 'No reason given'} onReload={() => { void refreshModules() }} />
      </div>
    )
  }

  const current = panel && panel.version === version ? panel : null
  const Panel = current?.config?.component as FunctionComponent<PanelProps> | undefined
  return (
    <div>
      {header}
      {current?.error ? (
        <ViewError title={`${name}'s view did not load`} message={current.error} onReload={() => setAttempt(a => a + 1)} />
      ) : Panel ? (
        <ViewBoundary key={`${version}-${attempt}`} name={name} onReload={() => setAttempt(a => a + 1)}>
          <Panel moduleId={moduleId} projectId={null} cwProject={cwProject} forge={client} />
        </ViewBoundary>
      ) : (
        <div class="py-20 text-center text-ink2">Loading {name}…</div>
      )}
      {settingsOpen && status.settingsSchema && (
        <ModuleSettings moduleId={moduleId} displayName={name} schema={status.settingsSchema} onClose={() => setSettingsOpen(false)} onSaved={() => { void client.reloadSettings(); void refreshModules() }} />
      )}
    </div>
  )
}

import { type ComponentChildren, type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, Badge, Modal, ToggleSwitch, showToast } from '@forge-dev/ui'
import type { KiokuLab, KiokuMismatch, KiokuRelease, KiokuUpdate } from '@forge-dev/core'
import { copyText, errorText, postJson } from '../config/api.js'
import { pageCard as card, pageNote as note, shortAgo, soft } from '../config/types.js'
import { kiokuLabs, kiokuReleases, loadKioku, loadKiokuVersions, loadReleases } from '../hooks/useKioku.js'
import { pluginPath, runPluginCommand } from '../hooks/usePlugins.js'
import { RunCommand } from './RunCommand.js'

const heading = { fontSize: '11px', fontWeight: 600, letterSpacing: '.02em', color: 'var(--ink-3)' }
const row = { gap: '10px', padding: '9px 16px', borderTop: '1px solid var(--hair)', fontSize: '12.5px' }
const small = { fontSize: '11.5px', color: 'var(--ink-3)' }
const STATUS_TOKEN: Record<string, string> = { updated: '--green', current: '--ink-3' }

// the exact command an action runs, to copy into a terminal
const Command: FunctionComponent<{ text: string }> = ({ text }) => (
  <div class="flex items-center min-w-0" style={{ gap: '6px' }}>
    <code class="truncate" title={text} style={{ fontSize: '11px', color: 'var(--ink-2)', padding: '2px 6px', borderRadius: '6px', background: 'var(--elev)' }}>{text}</code>
    <button type="button" aria-label="Copy command" title="Copy command" class="grid place-items-center shrink-0 cursor-pointer hover:text-ink" style={{ padding: '2px', color: 'var(--ink-3)', background: 'none', border: 0 }} onClick={() => copyText(text, 'Command')}>
      <span class="i-lucide-copy" style={{ width: '12px', height: '12px' }} />
    </button>
  </div>
)

// a card of the versions row: a heading with a value beside it, rows, and the command that read them
const Card: FunctionComponent<{ title: string; aside: ComponentChildren; command: string; children: ComponentChildren }> = ({ title, aside, command, children }) => (
  <section class="flex flex-col min-w-0" style={{ ...card, overflow: 'hidden' }}>
    <div class="flex items-center" style={{ gap: '8px', padding: '12px 16px 8px' }}>
      <h2 style={heading}>{title}</h2>
      <span class="flex-1" />
      {aside}
    </div>
    {children}
    <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--hair)' }}><Command text={command} /></div>
  </section>
)

const ReleaseRow: FunctionComponent<{ release: KiokuRelease; label: string; action?: string; onTry: (version: string) => void }> = ({ release, label, action, onTry }) => (
  <div class="flex flex-col" style={row}>
    <div class="flex items-center" style={{ gap: '10px' }}>
      <span class="shrink-0" style={{ ...small, width: '70px' }}>{label}</span>
      <span class="mono" style={{ fontWeight: 600 }}>{release.version}</span>
      {release.date && <span style={small}>{shortAgo(release.date)}</span>}
      <a href={release.notesUrl} target="_blank" rel="noreferrer" style={{ fontSize: '11.5px', color: 'var(--blue)' }}>Notes ↗</a>
      <span class="flex-1" />
      {action && <ActionButton label={action} variant={release.prerelease ? 'primary' : 'secondary'} size="sm" onClick={() => onTry(release.version)} />}
    </div>
    {action && <Command text={release.install} />}
    {release.notes && (
      <details style={{ fontSize: '12px', color: 'var(--ink-2)' }}>
        <summary class="cursor-pointer" style={small}>What it brings</summary>
        <p style={{ whiteSpace: 'pre-wrap', marginTop: '6px' }}>{release.notes}</p>
      </details>
    )}
  </div>
)

export const KiokuVersions: FunctionComponent<{ onTry: (version: string) => void }> = ({ onTry }) => {
  const releases = kiokuReleases.value
  if (!releases) return null
  const { installed, stable, stableAction, prereleases } = releases
  const aside = (
    <>
      <span class="mono" style={{ fontSize: '13px', fontWeight: 600 }}>{installed ?? 'unknown'}</span>
      {installed?.includes('-') && <Badge label="pre-release" color="var(--orange)" />}
    </>
  )
  return (
    <Card title="KIOKU VERSION" aside={aside} command={releases.command}>
      {releases.error && <p style={{ ...note, margin: '0 16px 10px', background: soft('--orange') }}>{releases.error}</p>}
      {stable && <ReleaseRow release={stable} label="Stable" action={stableAction === 'back' ? 'Back to stable' : stableAction === 'update' ? `Update to ${stable.version}` : undefined} onTry={onTry} />}
      {prereleases.map(r => <ReleaseRow key={r.version} release={r} label="Pre-release" action={`Try ${r.version}`} onTry={onTry} />)}
      {!releases.error && prereleases.length === 0 && <p style={{ ...small, padding: '8px 16px 12px', borderTop: '1px solid var(--hair)' }}>No pre-release newer than the one installed.</p>}
    </Card>
  )
}

export const TryVersion: FunctionComponent<{ version: string; onClose: () => void }> = ({ version, onClose }) => {
  const [check, setCheck] = useState<KiokuUpdate | null>(null)
  const [done, setDone] = useState<KiokuUpdate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    postJson<KiokuUpdate>('/api/kioku/update/check', { version }).then(setCheck, err => setError(errorText(err)))
  }, [version])

  const install = async () => {
    setBusy(true)
    setError(null)
    try {
      setDone(await postJson<KiokuUpdate>('/api/kioku/update', { version }))
      // the server already reads the new status, so a plain load picks it up
      void Promise.all([loadKioku(), loadKiokuVersions()])
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const shown = done ?? check
  const footer = done
    ? <><span class="flex-1" /><ActionButton label="Close" variant="primary" onClick={onClose} /></>
    : (
      <>
        <span class="flex-1" />
        <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
        <ActionButton label={busy ? 'Installing…' : `Install ${version}`} variant="primary" disabled={!check || check.status === 'current' || busy} onClick={install} />
      </>
    )

  return (
    <Modal open title={done ? `Kioku ${done.version ?? version}` : `Try Kioku ${version}`} onClose={busy ? () => {} : onClose} footer={footer}>
      <div class="flex flex-col" style={{ gap: '12px', fontSize: '13px' }}>
        {!shown && !error && <p style={small}>Asking kioku what it would install…</p>}
        {shown && (
          <div class="flex items-center" style={{ gap: '10px' }}>
            <span class="mono" style={{ fontSize: '16px', fontWeight: 600 }}>{shown.was ?? '?'} → {shown.version ?? version}</span>
            <Badge label={shown.status} color={`var(${STATUS_TOKEN[shown.status] ?? '--blue'})`} />
          </div>
        )}
        {check?.status === 'current' && !done && <p style={small}>This version is already installed.</p>}
        {shown && <Command text={shown.command} />}
        {!done && check?.install && <Command text={check.install} />}
        {done && done.agents.length > 0 && (
          <div class="flex flex-col" style={{ gap: '4px' }}>
            <h3 style={heading}>AGENT PLUGINS</h3>
            {done.agents.map(a => (
              <div key={`${a.host}:${a.name}`} class="flex items-center" style={{ gap: '8px', fontSize: '12.5px' }}>
                <span style={{ fontWeight: 500 }}>{a.host}</span>
                <span style={small}>{a.name}</span>
                <span class="mono">{a.from ?? '–'} → {a.to ?? '–'}</span>
                <span class="flex-1" />
                {a.error ? <Badge label={a.error} color="var(--red)" /> : <Badge label={a.changed ? 'changed' : 'unchanged'} color={`var(${a.changed ? '--green' : '--ink-3'})`} />}
              </div>
            ))}
          </div>
        )}
        {done?.finishError && <p style={{ ...note, background: soft('--orange') }}>{done.finishError}</p>}
        {error && <p style={{ ...note, background: soft('--red') }}>{error}</p>}
        {!done && <p style={small}>Kioku installs it on this machine for every session.{version.includes('-') ? ' Back to stable undoes it.' : ''}</p>}
      </div>
    </Modal>
  )
}

const MismatchRow: FunctionComponent<{ mismatch: KiokuMismatch; tool: string; onTry: (version: string) => void }> = ({ mismatch, tool, onTry }) => {
  const [busy, setBusy] = useState(false)
  const { fix } = mismatch
  const updatePlugin = async () => {
    setBusy(true)
    if (await runPluginCommand(`${pluginPath(mismatch.plugin)}/update`, { scope: mismatch.scope, scopeRef: mismatch.scopeRef })) {
      showToast(`Kioku's plugin updated in ${mismatch.scopeRef} · applies to new sessions`, 'success')
      await loadReleases()
    }
    setBusy(false)
  }
  let action: ComponentChildren = null
  if (fix?.kind === 'release') action = <ActionButton label={`Try ${fix.version}`} variant="primary" size="sm" onClick={() => onTry(fix.version)} />
  if (fix?.kind === 'plugin') action = <ActionButton label={busy ? 'Updating…' : 'Update plugin'} variant="primary" size="sm" disabled={busy} onClick={updatePlugin} />
  return (
    <div class="flex flex-col" style={{ gap: '4px' }}>
      <div class="flex items-center" style={{ gap: '10px' }}>
        <span class="flex-1">{mismatch.scopeRef}: plugin <span class="mono">{mismatch.version}</span>, tool <span class="mono">{tool}</span></span>
        {action}
      </div>
      {fix ? <Command text={fix.command} /> : <span style={small}>No kioku release of that major yet.</span>}
    </div>
  )
}

// from 5.0 kioku does nothing in a session whose plugin has another major than the tool
export const PluginMismatch: FunctionComponent<{ onTry: (version: string) => void }> = ({ onTry }) => {
  const releases = kiokuReleases.value
  if (!releases?.installed || releases.mismatches.length === 0) return null
  return (
    <section class="flex flex-col" style={{ ...note, gap: '8px', background: soft('--orange') }}>
      <p style={{ fontWeight: 600 }}>Kioku does nothing in these sessions: its plugin and the tool have different major versions.</p>
      {releases.mismatches.map(m => <MismatchRow key={`${m.scope}:${m.scopeRef}`} mismatch={m} tool={releases.installed!} onTry={onTry} />)}
    </section>
  )
}

const LabCard: FunctionComponent<{ lab: KiokuLab }> = ({ lab }) => {
  const [busy, setBusy] = useState(false)
  const toggle = async (enabled: boolean) => {
    setBusy(true)
    try {
      kiokuLabs.value = await postJson(`/api/kioku/labs/${encodeURIComponent(lab.name)}`, { enabled })
      showToast(`${lab.title} ${enabled ? 'on' : 'off'} · applies from the next session`, 'info')
    } catch (err) {
      showToast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div class="flex flex-col" style={{ ...row, gap: '6px' }}>
      <div class="flex items-center" style={{ gap: '10px' }}>
        <span style={{ fontWeight: 600 }}>{lab.title}</span>
        <span class="flex-1" />
        <ToggleSwitch checked={lab.enabled} disabled={busy} label={`${lab.title} enabled`} onChange={toggle} />
      </div>
      {lab.about && <p style={{ color: 'var(--ink-2)' }}>{lab.about}</p>}
      <Command text={lab.toggle} />
      {lab.command && (
        <div class="flex items-center" style={{ gap: '8px' }}>
          <span style={small}>In a session</span>
          <Command text={lab.command} />
          <RunCommand command={lab.command} plugin="kioku" disabled={!lab.enabled} note="A session has it only when it was opened after the lab was switched on." />
        </div>
      )}
      {Object.entries(lab.settings ?? {}).map(([key, value]) => (
        <div key={key} class="flex items-center" style={{ gap: '8px' }}>
          <span class="mono" style={small}>{key}</span>
          <span class="mono">{JSON.stringify(value)}</span>
          <span class="flex-1" />
          {lab.set?.[key] && <Command text={lab.set[key]} />}
        </div>
      ))}
    </div>
  )
}

// the labs the installed kioku lists; a kioku without them shows nothing
export const KiokuLabs: FunctionComponent = () => {
  const labs = kiokuLabs.value
  if (!labs?.labs?.length) return null
  return (
    <Card title={`LABS · ${kiokuReleases.value?.installed ?? ''}`} aside={<span style={small}>off by default, may change in any version</span>} command={labs.command}>
      {labs.labs.map(lab => <LabCard key={lab.name} lab={lab} />)}
    </Card>
  )
}

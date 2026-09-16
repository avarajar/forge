import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, showToast } from '@forge-dev/ui'

interface ProjectMcps { global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] }

export const ProjectBanner: FunctionComponent<{
  project: string
  account?: string
  accounts?: string[]
  onDeleted?: () => void
  onMoved?: () => void
}> = ({ project, account, accounts, onDeleted, onMoved }) => {
  const [mcps, setMcps] = useState<ProjectMcps | null>(null)
  const [activePanel, setActivePanel] = useState<'move' | 'delete' | null>(null)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [moveTarget, setMoveTarget] = useState('')
  const [moving, setMoving] = useState(false)

  const moveTargets = (accounts ?? []).filter(a => a !== account)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/cw/mcps?project=${encodeURIComponent(project)}`)
      .then(r => r.json() as Promise<ProjectMcps>)
      .catch(() => null)
      .then((result) => { if (!cancelled) setMcps(result) })
    return () => { cancelled = true }
  }, [project])

  const globalMcps = mcps ? Object.keys(mcps.global) : []
  const projectMcps = mcps?.project ?? []
  const cwMcps = mcps?.cw ?? []
  const plugins = mcps?.plugins ?? []
  const allMcps = [...projectMcps.map(m => `${m} (project)`), ...globalMcps, ...cwMcps.map(m => `${m} (CW)`)]

  const openPanel = (panel: 'move' | 'delete') => {
    setActivePanel(activePanel === panel ? null : panel)
    setMoveTarget('')
    setDeleteFiles(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/api/cw/delete-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, deleteFiles })
      })
      const result = await res.json() as { ok: boolean }
      if (result.ok) {
        showToast(`Project "${project}" deleted${deleteFiles ? ' (files removed)' : ''}`, 'info')
        onDeleted?.()
      }
    } catch {
      showToast('Failed to delete project', 'error')
    } finally {
      setDeleting(false)
      setActivePanel(null)
    }
  }

  const handleMove = async () => {
    if (!moveTarget) return
    setMoving(true)
    try {
      const res = await fetch('/api/cw/move-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, toAccount: moveTarget })
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast(`Project "${project}" moved to "${moveTarget}"`, 'success')
        setActivePanel(null)
        setMoveTarget('')
        onMoved?.()
      } else {
        showToast(result.error ?? 'Failed to move project', 'error')
      }
    } catch {
      showToast('Failed to move project', 'error')
    } finally {
      setMoving(false)
    }
  }

  if (!mcps) return null

  const panel = { padding: '12px 15px', borderTop: '1px solid var(--hair)', display: 'flex', flexDirection: 'column' as const, gap: '10px' }
  const smallBtn = (tone: 'ink' | 'red', on: boolean) => ({
    padding: '5px 11px', borderRadius: '9px', border: '1px solid var(--hair)', fontSize: '12.5px', fontWeight: 500,
    background: on ? 'var(--elev)' : 'var(--card)', color: tone === 'red' ? 'var(--red)' : 'var(--ink)', boxShadow: 'var(--shadow-s)',
  })

  return (
    <section style={{ borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)', overflow: 'hidden' }} aria-label="Project settings">
      <div class="flex items-center flex-wrap" style={{ padding: '10px 15px', gap: '8px 12px' }}>
        <div class="flex-1 min-w-0 flex flex-col" style={{ gap: '2px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
          {allMcps.length > 0 && <span class="truncate" title={allMcps.join(', ')}>MCP · {allMcps.join(', ')}</span>}
          {plugins.length > 0 && <span class="truncate" title={plugins.join(', ')}>Plugins · {plugins.join(', ')}</span>}
          {allMcps.length === 0 && plugins.length === 0 && <span>No MCPs or plugins for this project</span>}
        </div>
        {moveTargets.length > 0 && (
          <button type="button" class="cursor-pointer" style={smallBtn('ink', activePanel === 'move')} aria-expanded={activePanel === 'move'} onClick={() => openPanel('move')}>
            Move to account
          </button>
        )}
        <button type="button" class="cursor-pointer" style={smallBtn('red', activePanel === 'delete')} aria-expanded={activePanel === 'delete'} onClick={() => openPanel('delete')}>
          Delete project
        </button>
      </div>

      {activePanel === 'move' && (
        <div style={panel}>
          <p style={{ fontSize: '13px' }}>Move "{project}" to a different account.</p>
          <select
            class="field"
            style={{ height: '38px', padding: '0 10px', borderRadius: '11px', border: '1px solid var(--hair)', background: 'var(--bg-2)', color: 'var(--ink)', fontSize: '13.5px', outline: 'none' }}
            value={moveTarget}
            onChange={(e) => setMoveTarget((e.target as HTMLSelectElement).value)}
          >
            <option value="">Select account…</option>
            {moveTargets.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div class="flex" style={{ gap: '8px' }}>
            <ActionButton label={moving ? 'Moving…' : 'Move project'} variant="primary" size="sm" loading={moving} disabled={!moveTarget} onClick={handleMove} />
            <ActionButton label="Cancel" variant="secondary" size="sm" onClick={() => { setActivePanel(null); setMoveTarget('') }} />
          </div>
        </div>
      )}

      {activePanel === 'delete' && (
        <div style={panel}>
          <p style={{ fontSize: '13px' }}>This unregisters "{project}" from CW.</p>
          <label class="flex items-center cursor-pointer" style={{ gap: '8px', fontSize: '12.5px', color: 'var(--ink-2)' }}>
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles((e.target as HTMLInputElement).checked)}
            />
            Also delete project files from disk
          </label>
          {deleteFiles && (
            <p style={{ fontSize: '12.5px', color: 'var(--red)' }}>This permanently deletes all files. It cannot be undone.</p>
          )}
          <div class="flex" style={{ gap: '8px' }}>
            <ActionButton label={deleting ? 'Deleting…' : deleteFiles ? 'Delete project and files' : 'Unregister project'} variant="destructive" size="sm" loading={deleting} onClick={handleDelete} />
            <ActionButton label="Cancel" variant="secondary" size="sm" onClick={() => { setActivePanel(null); setDeleteFiles(false) }} />
          </div>
        </div>
      )}
    </section>
  )
}

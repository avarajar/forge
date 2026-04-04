import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { showToast } from '@forge-dev/ui'

interface ProjectInfo {
  stack: Record<string, unknown> | null
  mcps: { global: Record<string, unknown>; project: string[]; cw: string[]; plugins: string[] } | null
}

export const ProjectBanner: FunctionComponent<{
  project: string
  account?: string
  onDeleted?: () => void
}> = ({ project, account, onDeleted }) => {
  const [info, setInfo] = useState<ProjectInfo>({ stack: null, mcps: null })
  const [showDelete, setShowDelete] = useState(false)
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/cw/detect/${project}`).then(r => r.json()).catch(() => null),
      fetch(`/api/cw/mcps?project=${project}`).then(r => r.json()).catch(() => null),
    ]).then(([stack, mcps]) => {
      if (!cancelled) setInfo({ stack, mcps })
    })
    return () => { cancelled = true }
  }, [project])

  const stackParts: string[] = []
  if (info.stack) {
    if (info.stack.framework) stackParts.push(String(info.stack.framework))
    if (info.stack.testRunner) stackParts.push(String(info.stack.testRunner))
    if (info.stack.hasTailwind) stackParts.push('Tailwind')
    if (info.stack.hasShadcn) stackParts.push('shadcn')
    if (info.stack.hasPlaywright) stackParts.push('Playwright')
    if (info.stack.hasDockerfile) stackParts.push('Docker')
  }

  const globalMcps = info.mcps ? Object.keys(info.mcps.global) : []
  const projectMcps = info.mcps?.project ?? []
  const cwMcps = info.mcps?.cw ?? []
  const plugins = info.mcps?.plugins ?? []
  const allMcps = [...projectMcps.map(m => `${m} (project)`), ...globalMcps, ...cwMcps.map(m => `${m} (CW)`)]

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
      setShowDelete(false)
    }
  }

  if (!info.stack && !info.mcps) return null

  return (
    <div
      class="rounded-xl px-4 py-3 mb-5 text-sm"
      style={{ backgroundColor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}
    >
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-forge-accent uppercase tracking-wider">Project:</span>
          <span class="font-semibold text-forge-text">{project}</span>
          {account && (
            <span class="text-xs text-forge-muted" style={{ opacity: 0.7 }}>({account})</span>
          )}
        </div>
        <button
          class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors"
          style={showDelete
            ? { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.35)', color: 'var(--forge-error)' }
            : { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.2)', color: 'var(--forge-error)', opacity: 0.75 }
          }
          onClick={() => setShowDelete(!showDelete)}
        >
          ⚠ Delete project
        </button>
      </div>

      {showDelete && (
        <div class="rounded-lg p-3 mb-2" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <p class="text-xs text-forge-text mb-2">Are you sure? This will unregister "{project}" from CW.</p>
          <label class="flex items-center gap-2 text-xs text-forge-muted mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles((e.target as HTMLInputElement).checked)}
            />
            Also delete project files from disk
          </label>
          {deleteFiles && (
            <p class="text-xs mb-3" style={{ color: 'var(--forge-error)' }}>
              This will permanently delete all files. This cannot be undone.
            </p>
          )}
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 text-xs rounded-lg text-white font-medium transition-colors"
              style={{ backgroundColor: 'var(--forge-error)' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : deleteFiles ? 'Delete project + files' : 'Unregister project'}
            </button>
            <button
              class="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
              style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
              onClick={() => { setShowDelete(false); setDeleteFiles(false) }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {stackParts.length > 0 && (
        <div class="flex items-center gap-1.5 text-xs text-forge-muted flex-wrap">
          <span class="text-forge-muted opacity-70">Stack:</span>
          {stackParts.map((s, i) => (
            <span key={s}>
              <span class="text-forge-text">{s}</span>
              {i < stackParts.length - 1 && <span class="text-forge-muted">,</span>}
            </span>
          ))}
        </div>
      )}
      {allMcps.length > 0 && (
        <div class="flex items-center gap-1.5 text-xs text-forge-muted mt-0.5 flex-wrap">
          <span class="text-forge-muted opacity-70">MCPs:</span>
          <span class="text-forge-text">{allMcps.join(' | ')}</span>
        </div>
      )}
      {plugins.length > 0 && (
        <div class="flex items-center gap-1.5 text-xs text-forge-muted mt-0.5 flex-wrap">
          <span class="text-forge-muted opacity-70">Plugins:</span>
          <span class="text-forge-text">{plugins.join(' | ')}</span>
        </div>
      )}
    </div>
  )
}

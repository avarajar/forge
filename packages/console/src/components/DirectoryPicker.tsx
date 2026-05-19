import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'

interface DirEntry {
  name: string
  path: string
  isGitRepo: boolean
}

interface BrowseResponse {
  ok: boolean
  error?: string
  path?: string
  parent?: string | null
  home?: string
  isGitRepo?: boolean
  entries?: DirEntry[]
}

interface DirectoryPickerProps {
  value: string
  onChange: (path: string, isGitRepo: boolean) => void
  initialPath?: string
}

export const DirectoryPicker: FunctionComponent<DirectoryPickerProps> = ({
  value, onChange, initialPath
}) => {
  const [cwd, setCwd] = useState(initialPath ?? '~')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [parent, setParent] = useState<string | null>(null)
  const [home, setHome] = useState<string | null>(null)
  const [resolvedPath, setResolvedPath] = useState<string>('')
  const [isCwdGitRepo, setIsCwdGitRepo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/cw/browse-dirs?path=${encodeURIComponent(cwd)}`)
        const body = await res.json() as BrowseResponse
        if (cancelled) return
        if (!body.ok) {
          setError(body.error ?? 'Failed to load directory')
          setEntries([])
          return
        }
        setEntries(body.entries ?? [])
        setParent(body.parent ?? null)
        setHome(body.home ?? null)
        setResolvedPath(body.path ?? cwd)
        setIsCwdGitRepo(!!body.isGitRepo)
      } catch {
        if (!cancelled) {
          setError('Network error')
          setEntries([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [cwd])

  const isSelected = value === resolvedPath

  const breadcrumb = (() => {
    if (!resolvedPath) return cwd
    if (home && resolvedPath === home) return '~'
    if (home && resolvedPath.startsWith(home + '/')) return '~' + resolvedPath.slice(home.length)
    return resolvedPath
  })()

  return (
    <div class="border border-forge-border rounded-lg overflow-hidden bg-forge-bg">
      {/* Path bar */}
      <div class="flex items-center gap-2 px-3 py-2 border-b border-forge-border bg-forge-surface">
        <button
          type="button"
          class="px-2 py-1 text-xs rounded text-forge-muted hover:text-forge-text disabled:opacity-40"
          onClick={() => parent && setCwd(parent)}
          disabled={!parent || loading}
          title="Parent directory"
        >
          ←
        </button>
        <button
          type="button"
          class="px-2 py-1 text-xs rounded text-forge-muted hover:text-forge-text"
          onClick={() => setCwd('~')}
          title="Home"
        >
          ~
        </button>
        <input
          type="text"
          value={cwd}
          onInput={(e) => setCwd((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') setCwd((e.target as HTMLInputElement).value) }}
          class="flex-1 px-2 py-1 text-xs rounded bg-forge-bg border border-forge-border text-forge-text focus:border-forge-accent focus:outline-none font-mono"
          placeholder="~/workspace"
        />
      </div>

      {/* Selected indicator */}
      {value && (
        <div class="px-3 py-2 text-xs border-b border-forge-border bg-forge-surface flex items-center justify-between gap-2">
          <span class="text-forge-muted truncate font-mono">Selected: <span class="text-forge-text">{value}</span></span>
          <button
            type="button"
            class="text-forge-muted hover:text-forge-text"
            onClick={() => onChange('', false)}
            title="Clear selection"
          >×</button>
        </div>
      )}

      {/* Listing */}
      <div class="max-h-64 overflow-y-auto">
        {loading ? (
          <div class="px-3 py-4 text-xs text-forge-muted">Loading...</div>
        ) : error ? (
          <div class="px-3 py-4 text-xs" style={{ color: 'var(--forge-error)' }}>{error}</div>
        ) : (
          <>
            {/* "Select this folder" row */}
            <button
              type="button"
              class={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-forge-surface transition-colors border-b border-forge-border ${
                isSelected ? 'bg-forge-surface' : ''
              }`}
              onClick={() => onChange(resolvedPath, isCwdGitRepo)}
              disabled={!isCwdGitRepo}
              title={isCwdGitRepo ? 'Pick this folder' : 'Not a git repository'}
            >
              <span class="font-mono truncate">
                <span class="text-forge-muted mr-2">►</span>
                Pick <span class="text-forge-text">{breadcrumb}</span>
              </span>
              {isCwdGitRepo ? (
                <span class="text-xs" style={{ color: 'var(--forge-accent)' }}>git ✓</span>
              ) : (
                <span class="text-xs text-forge-muted">no .git</span>
              )}
            </button>
            {entries.length === 0 ? (
              <div class="px-3 py-4 text-xs text-forge-muted">No subdirectories</div>
            ) : (
              entries.map(entry => (
                <button
                  key={entry.path}
                  type="button"
                  class="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-forge-surface transition-colors font-mono"
                  onClick={() => setCwd(entry.path)}
                >
                  <span class="truncate">
                    <span class="text-forge-muted mr-2">📁</span>
                    {entry.name}
                  </span>
                  {entry.isGitRepo && (
                    <span class="text-xs ml-2" style={{ color: 'var(--forge-accent)' }}>git</span>
                  )}
                </button>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}

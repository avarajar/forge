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
  // Only allow picking git repos; off when picking a parent folder for a new project
  requireGit?: boolean
}

export const DirectoryPicker: FunctionComponent<DirectoryPickerProps> = ({
  value, onChange, initialPath, requireGit = true
}) => {
  const [cwd, setCwd] = useState(initialPath ?? '~')
  const [draft, setDraft] = useState(cwd)
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

  const navigate = (path: string) => { setCwd(path); setDraft(path) }

  const isSelected = value === resolvedPath
  const blockedByGit = requireGit && !isCwdGitRepo

  const breadcrumb = (() => {
    if (!resolvedPath) return cwd
    if (home && resolvedPath === home) return '~'
    if (home && resolvedPath.startsWith(home + '/')) return '~' + resolvedPath.slice(home.length)
    return resolvedPath
  })()

  const toolBtn = { width: '24px', height: '24px', borderRadius: '7px', border: 0, background: 'var(--card)', color: 'var(--ink-2)', boxShadow: 'var(--shadow-s)' }
  const row = 'flex items-center w-full text-left cursor-pointer transition-colors duration-140 hover:bg-elev disabled:cursor-not-allowed disabled:opacity-60'
  const rowStyle = { gap: '8px', padding: '7px 11px', border: 0, borderBottom: '1px solid var(--hair)', background: 'none', color: 'var(--ink)', fontSize: '12.5px' }
  const gitPill = { padding: '1px 7px', borderRadius: '99px', background: 'color-mix(in srgb, var(--green) 18%, transparent)', color: 'var(--green)', fontSize: '10.5px', fontWeight: 600 }

  return (
    <div style={{ borderRadius: '12px', border: '1px solid var(--hair)', background: 'var(--card)', boxShadow: 'var(--shadow-s)', overflow: 'hidden' }}>
      <div class="flex items-center" style={{ gap: '6px', padding: '7px 9px', borderBottom: '1px solid var(--hair)', background: 'var(--elev)' }}>
        <button type="button" class="grid place-items-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" style={toolBtn} onClick={() => parent && navigate(parent)} disabled={!parent || loading} title="Parent folder" aria-label="Parent folder">←</button>
        <button type="button" class="grid place-items-center cursor-pointer" style={toolBtn} onClick={() => navigate('~')} title="Home" aria-label="Home">~</button>
        <input
          type="text"
          value={draft}
          aria-label="Path"
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={() => setCwd(draft)}
          onKeyDown={(e) => { if (e.key === 'Enter') setCwd(draft) }}
          class="field mono flex-1 min-w-0"
          style={{ height: '26px', padding: '0 9px', borderRadius: '7px', border: '1px solid var(--hair)', background: 'var(--bg-2)', color: 'var(--ink)', fontSize: '11.5px', outline: 'none' }}
          placeholder="~/workspace"
        />
      </div>

      {value && (
        <div class="flex items-center" style={{ gap: '8px', padding: '7px 11px', borderBottom: '1px solid var(--hair)', background: 'color-mix(in srgb, var(--blue) 12%, transparent)', fontSize: '12px' }}>
          <span class="i-lucide-check shrink-0" style={{ width: '13px', height: '13px', color: 'var(--blue)' }} />
          <span class="mono flex-1 truncate">{value}</span>
          <button type="button" class="grid place-items-center cursor-pointer text-ink3 hover:text-ink" style={{ border: 0, background: 'none' }} onClick={() => onChange('', false)} title="Clear selection" aria-label="Clear selection">
            <span class="i-lucide-x" style={{ width: '13px', height: '13px' }} />
          </button>
        </div>
      )}

      <div class="overflow-y-auto" style={{ maxHeight: '220px' }}>
        {loading ? (
          <p style={{ padding: '12px', fontSize: '12.5px', color: 'var(--ink-2)' }}>Loading…</p>
        ) : error ? (
          <p style={{ padding: '12px', fontSize: '12.5px', color: 'var(--red)' }}>{error}</p>
        ) : (
          <>
            <button
              type="button"
              class={row}
              style={{ ...rowStyle, background: isSelected ? 'var(--elev)' : 'none', fontWeight: 600 }}
              onClick={() => onChange(resolvedPath, isCwdGitRepo)}
              disabled={blockedByGit}
              title={blockedByGit ? 'Not a git repository' : 'Pick this folder'}
            >
              <span class="i-lucide-check shrink-0" style={{ width: '12px', height: '12px', color: 'var(--blue)' }} />
              <span class="flex-1 truncate">Pick <span class="mono">{breadcrumb}</span></span>
              {isCwdGitRepo ? <span style={gitPill}>git</span> : blockedByGit ? <span style={{ fontSize: '11px', color: 'var(--ink-3)' }}>no .git</span> : null}
            </button>
            {entries.length === 0 ? (
              <p style={{ padding: '12px', fontSize: '12.5px', color: 'var(--ink-3)' }}>No subfolders</p>
            ) : (
              entries.map(entry => (
                <button key={entry.path} type="button" class={row} style={rowStyle} onClick={() => navigate(entry.path)}>
                  <span class="i-lucide-chevron-right shrink-0" style={{ width: '12px', height: '12px', color: 'var(--ink-3)' }} />
                  <span class="mono flex-1 truncate">{entry.name}</span>
                  {entry.isGitRepo && <span style={gitPill}>git</span>}
                </button>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}

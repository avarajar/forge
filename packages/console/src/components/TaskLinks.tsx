import { type FunctionComponent } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import type { ReviewEntry } from '../hooks/useTaskReview.js'
import { editorsInfo, loadEditors, openTaskInEditor } from '../hooks/useEditors.js'

export const secondaryButton = {
  padding: '6px 12px', borderRadius: '9px', border: '1px solid var(--hair)', background: 'var(--card)',
  color: 'var(--ink)', fontSize: '12.5px', fontWeight: 500, boxShadow: 'var(--shadow-s)', whiteSpace: 'nowrap' as const,
}
export const secondaryClass = 'inline-flex items-center gap-1 cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px hover:shadow-m hover:text-ink'

export const GitHubButton: FunctionComponent<{ entry: ReviewEntry | null }> = ({ entry }) => {
  const github = entry?.state?.github
  if (!github) return null
  if (github.url === null) {
    return <button type="button" class="cursor-not-allowed" style={{ ...secondaryButton, color: 'var(--ink-3)', boxShadow: 'none' }} disabled title={github.reason}>GitHub</button>
  }
  return (
    <a class={secondaryClass} style={secondaryButton} href={github.url} target="_blank" rel="noopener noreferrer" title={github.label}>
      GitHub <span class="i-lucide-external-link" style={{ width: '12px', height: '12px' }} />
    </a>
  )
}

export const EditorButton: FunctionComponent<{ session: CWSession; entry: ReviewEntry | null }> = ({ session, entry }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { void loadEditors() }, [])
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const editors = editorsInfo.value
  const editorList = editors?.enabled ? editors.editors : []
  if (editorList.length === 0 || entry?.state?.workspace !== 'ready') return null

  const open = async (editorId: string) => {
    setMenuOpen(false)
    try {
      await openTaskInEditor(session, editorId)
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  if (editorList.length === 1) {
    return <button type="button" class={secondaryClass} style={secondaryButton} onClick={() => open(editorList[0].id)}>Open in {editorList[0].label}</button>
  }
  return (
    <div class="relative" ref={ref}>
      <button type="button" class={secondaryClass} style={secondaryButton} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
        Open in editor <span class="i-lucide-chevron-down" style={{ width: '12px', height: '12px' }} />
      </button>
      {menuOpen && (
        <div class="popover absolute right-0 top-full z-30 flex flex-col" style={{ marginTop: '6px', minWidth: '160px', padding: '5px', borderRadius: '12px' }}>
          {editorList.map(editor => (
            <button key={editor.id} type="button" class="text-left cursor-pointer hover:bg-elev" style={{ padding: '7px 10px', borderRadius: '8px', border: 0, background: 'none', color: 'var(--ink)', fontSize: '13px' }} onClick={() => open(editor.id)}>
              {editor.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

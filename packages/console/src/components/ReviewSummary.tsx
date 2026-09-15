import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import type { ReviewEntry } from '../hooks/useTaskReview.js'
import { editorsInfo, loadEditors, openTaskInEditor } from '../hooks/useEditors.js'
import { reviewSummary } from '../config/review.js'

const chipClass = 'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 transition-colors'
const chipStyle = { backgroundColor: 'var(--forge-ghost-bg)', color: 'var(--forge-text)', border: '1px solid var(--forge-ghost-border)' }

export const ReviewSummary: FunctionComponent<{ session: CWSession; entry: ReviewEntry | null }> = ({ session, entry }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { void loadEditors() }, [])

  if (!entry) return <span class="text-[11px] text-forge-muted">Checking changes…</span>
  if (entry.error !== null) return <span class="text-[11px] text-forge-muted" title={entry.error}>Changes unknown</span>

  const { state } = entry
  const summary = reviewSummary(state)
  const editors = editorsInfo.value
  const editorList = editors?.enabled ? editors.editors : []
  const showEditor = editorList.length > 0 && state.workspace === 'ready'

  const open = async (editorId: string) => {
    setMenuOpen(false)
    try {
      await openTaskInEditor(session, editorId)
    } catch (err) {
      showToast((err as Error).message, 'error')
    }
  }

  return (
    <div class="flex items-center gap-2.5 min-w-0">
      {summary && <span class="text-[11px] text-forge-muted truncate" title={summary}>{summary}</span>}

      {state.github && (state.github.url !== null ? (
        <a class={chipClass} style={chipStyle} href={state.github.url} target="_blank" rel="noopener noreferrer">
          {state.github.label}
        </a>
      ) : (
        <button class={`${chipClass} opacity-50 cursor-not-allowed`} style={chipStyle} disabled title={state.github.reason}>
          View on GitHub
        </button>
      ))}

      {showEditor && editorList.length === 1 && (
        <button class={`${chipClass} cursor-pointer`} style={chipStyle} onClick={() => open(editorList[0].id)}>
          Open in {editorList[0].label}
        </button>
      )}

      {showEditor && editorList.length > 1 && (
        <div class="relative shrink-0">
          <button class={`${chipClass} cursor-pointer`} style={chipStyle} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
            Open in editor ▾
          </button>
          {menuOpen && (
            <div class="absolute left-0 top-full mt-1 z-20 min-w-[140px] rounded-lg py-1 bg-forge-surface" style={{ border: '1px solid var(--forge-ghost-border)' }}>
              {editorList.map(editor => (
                <button key={editor.id} class="block w-full text-left px-3 py-1.5 text-xs text-forge-text hover:bg-forge-border cursor-pointer" onClick={() => open(editor.id)}>
                  {editor.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

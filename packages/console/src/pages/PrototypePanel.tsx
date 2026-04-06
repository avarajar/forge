import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { showToast } from '@forge-dev/ui'
import { usePrototype } from '../hooks/usePrototype.js'
import type { InputType } from '../hooks/usePrototype.js'
import { InputSelector } from '../components/InputSelector.js'
import { PrototypePreview } from '../components/PrototypePreview.js'
import { ShareModal } from '../components/ShareModal.js'
import { GraduateModal } from '../components/GraduateModal.js'
import { TYPE_STYLES } from '../config/types.js'

/* ── Types ── */

interface StackDetection {
  hasTailwind?: boolean
  hasShadcn?: boolean
  hasTokens?: boolean
}

export interface PrototypePanelProps {
  project: string
  onBack: () => void
}

/* ── Helpers ── */

const designStyle = TYPE_STYLES['design']

/* ── Component ── */

export const PrototypePanel: FunctionComponent<PrototypePanelProps> = ({ project, onBack }) => {
  const proto = usePrototype()
  const [detection, setDetection] = useState<StackDetection | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [graduateOpen, setGraduateOpen] = useState(false)

  // Fetch stack detection on mount
  useEffect(() => {
    fetch(`/api/cw/detect/${encodeURIComponent(project)}`)
      .then(r => r.ok ? r.json() as Promise<StackDetection> : null)
      .then(data => { if (data) setDetection(data) })
      .catch(() => {/* silently ignore detection errors */})
  }, [project])

  /* ── Handlers ── */

  const handleGenerate = async (inputType: InputType, inputData: Record<string, unknown>) => {
    if (!proto.sandbox) {
      // Derive a name from the project + a short timestamp
      const name = `${project}-${Date.now().toString(36)}`
      await proto.create(name, inputType, inputData, project)
      // create() sets up the sandbox; then generate()
      await proto.generate(inputType, inputData)
    } else {
      await proto.regenerate(inputType, inputData)
    }
  }

  const handleShare = async (branch: string, description: string) => {
    // Placeholder — real endpoint connection to be wired later
    const placeholderPrUrl = `https://github.com/${project}/pull/new/${encodeURIComponent(branch)}`
    showToast('PR creation — connect to server endpoint', 'info')
    await proto.share(placeholderPrUrl, branch, description || undefined)
    setShareOpen(false)
  }

  const handleGraduate = async (taskName: string) => {
    const description = proto.sandbox
      ? `Implement prototype: ${proto.sandbox.name}${proto.sandbox.prUrl ? ` (PR: ${proto.sandbox.prUrl})` : ''}`
      : `Implement prototype from ${project}`

    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dev', project, task: taskName, description }),
      })
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg || 'Failed to create dev task')
      }
      showToast(`Dev task "${taskName}" created`, 'success')
      setGraduateOpen(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create dev task', 'error')
    }
  }

  const handleArchive = async () => {
    await proto.archive()
    showToast('Prototype archived', 'info')
  }

  /* ── Derived state ── */

  const isGenerating = proto.state === 'generating' || proto.state === 'creating'
  const showShare = proto.state === 'live'
  const showGraduate = proto.state === 'shared'
  const sandboxName = proto.sandbox?.name ?? project

  /* ── Render ── */

  return (
    <div class="flex flex-col h-full" style={{ backgroundColor: 'var(--forge-bg)' }}>

      {/* ── Header ── */}
      <div
        class="shrink-0 flex items-center gap-3 px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}
      >
        {/* Back button */}
        <button
          class="text-xs shrink-0 transition-colors"
          style={{ color: 'var(--forge-muted)' }}
          onClick={onBack}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--forge-text)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--forge-muted)' }}
        >
          ← Back
        </button>

        {/* Separator */}
        <span class="w-px h-3 shrink-0" style={{ backgroundColor: 'var(--forge-ghost-border)' }} />

        {/* Title */}
        <span class="text-sm font-semibold truncate" style={{ color: 'var(--forge-text)' }}>
          Prototype: &ldquo;{sandboxName}&rdquo;
        </span>

        {/* DESIGN badge */}
        <span
          class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0"
          style={{
            backgroundColor: designStyle.bg,
            color: designStyle.color,
            border: `1px solid ${designStyle.border}`,
          }}
        >
          {designStyle.label}
        </span>

        {/* Spacer */}
        <span class="flex-1" />

        {/* Archive button */}
        {proto.sandbox && proto.state !== 'archived' && (
          <button
            class="text-xs transition-colors shrink-0"
            style={{ color: 'var(--forge-muted)' }}
            onClick={handleArchive}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--forge-text)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--forge-muted)' }}
          >
            Archive
          </button>
        )}
      </div>

      {/* ── Error banner ── */}
      {proto.error && (
        <div
          class="shrink-0 px-4 py-2 text-xs"
          style={{
            backgroundColor: 'var(--forge-tint-red-bg, rgba(239,68,68,0.10))',
            borderBottom: '1px solid var(--forge-tint-red-border, rgba(239,68,68,0.25))',
            color: 'var(--forge-error, #ef4444)',
          }}
        >
          {proto.error}
        </div>
      )}

      {/* ── Body: split pane ── */}
      <div class="flex flex-1 min-h-0">

        {/* Left: Input Panel */}
        <div
          class="w-72 shrink-0 flex flex-col overflow-y-auto"
          style={{ borderRight: '1px solid var(--forge-ghost-border)', padding: '16px' }}
        >
          <InputSelector
            onSubmit={handleGenerate}
            disabled={isGenerating}
            detection={detection}
          />
        </div>

        {/* Right: Preview + action bar */}
        <div class="flex-1 flex flex-col min-w-0">

          {/* Preview area */}
          <div class="flex-1 min-h-0">
            <PrototypePreview
              port={proto.sandbox?.port ?? null}
              state={proto.state}
            />
          </div>

          {/* Action bar */}
          <div
            class="shrink-0 flex items-center justify-end gap-2 px-4 py-2.5"
            style={{ borderTop: '1px solid var(--forge-ghost-border)', backgroundColor: 'var(--forge-surface)' }}
          >
            {/* Regenerate — shown when a sandbox exists and not currently generating */}
            {proto.sandbox && !isGenerating && proto.state !== 'archived' && (
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--forge-surface)',
                  border: '1px solid var(--forge-border)',
                  color: 'var(--forge-text)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-accent)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-border)' }}
                onClick={() => {
                  // Regenerate requires the user to re-submit via InputSelector;
                  // this button is a convenience hint — re-trigger the last inputs
                  // is not stored here, so we show a toast guiding the user.
                  showToast('Update your inputs above and click Generate', 'info')
                }}
              >
                Regenerate
              </button>
            )}

            {/* Share as PR — shown when state is 'live' */}
            {showShare && (
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: designStyle.bg,
                  border: `1px solid ${designStyle.border}`,
                  color: designStyle.color,
                }}
                onClick={() => setShareOpen(true)}
              >
                Share as PR
              </button>
            )}

            {/* Graduate to Dev Task — shown when state is 'shared' */}
            {showGraduate && (
              <button
                class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: TYPE_STYLES['task'].bg,
                  border: `1px solid ${TYPE_STYLES['task'].border}`,
                  color: TYPE_STYLES['task'].color,
                }}
                onClick={() => setGraduateOpen(true)}
              >
                Graduate to Dev Task
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <ShareModal
        open={shareOpen}
        prototypeName={sandboxName}
        onClose={() => setShareOpen(false)}
        onShare={handleShare}
      />

      <GraduateModal
        open={graduateOpen}
        prototypeName={sandboxName}
        prUrl={proto.sandbox?.prUrl ?? null}
        previewUrl={proto.sandbox?.previewUrl ?? null}
        onClose={() => setGraduateOpen(false)}
        onGraduate={handleGraduate}
      />
    </div>
  )
}

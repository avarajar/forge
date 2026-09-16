import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Tabs, showToast } from '@forge-dev/ui'
import { usePrototype } from '../hooks/usePrototype.js'
import type { InputType } from '../hooks/usePrototype.js'
import { InputSelector } from '../components/InputSelector.js'
import { PrototypePreview, VIEWPORTS, type Viewport } from '../components/PrototypePreview.js'
import { ShareModal } from '../components/ShareModal.js'
import { GraduateModal } from '../components/GraduateModal.js'
import { PageHeader, BackButton } from '../components/PageHeader.js'

/* ── Types ── */

interface StackDetection {
  hasTailwind?: boolean
  hasShadcn?: boolean
  hasTokens?: boolean
}

export interface PrototypePanelProps {
  project: string
  projects: string[]
  onProjectChange: (project: string) => void
  onBack: () => void
}

const STAGES = ['Idle', 'Generating', 'Live', 'Shared', 'Graduated']

const stageOf = (state: string): number =>
  state === 'generating' ? 1 : state === 'live' ? 2 : state === 'shared' ? 3 : state === 'archived' ? -1 : 0

/* ── Component ── */

export const PrototypePanel: FunctionComponent<PrototypePanelProps> = ({ project, projects, onProjectChange, onBack }) => {
  const proto = usePrototype()
  const [detection, setDetection] = useState<StackDetection | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [graduateOpen, setGraduateOpen] = useState(false)
  const [viewport, setViewport] = useState<Viewport>('desktop')

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

  const stage = stageOf(proto.state)
  const port = proto.sandbox?.port

  return (
    <main class="prototype-page flex flex-col min-w-0" style={{ height: '100vh' }}>
      <PageHeader
        size="md"
        sticky={false}
        leading={<BackButton onClick={onBack} />}
        title={sandboxName}
        subtitle={`Sandbox on ${port ? `:${port}` : '—'} · ${proto.state}`}
      >
        <ActionButton label="Archive" variant="secondary" size="sm" disabled={!proto.sandbox || proto.state === 'archived'} onClick={handleArchive} />
        <ActionButton label="Share as PR" variant="secondary" size="sm" disabled={!showShare} onClick={() => setShareOpen(true)} />
        <ActionButton label="Graduate" variant="primary" size="sm" disabled={!showGraduate} onClick={() => setGraduateOpen(true)} />
      </PageHeader>

      {proto.error && (
        <p class="shrink-0" style={{ padding: '8px 22px', fontSize: '12.5px', color: 'var(--red)', background: 'color-mix(in srgb, var(--red) 12%, transparent)', borderBottom: '1px solid var(--hair)' }}>
          {proto.error}
        </p>
      )}

      <div class="prototype-body grid flex-1 min-h-0" style={{ gridTemplateColumns: '300px minmax(0,1fr)' }}>
        <div class="flex flex-col overflow-auto" style={{ gap: '14px', padding: '14px', borderRight: '1px solid var(--hair)', background: 'var(--bg-2)' }}>
          {projects.length > 1 && !proto.sandbox && (
            <label class="flex flex-col" style={{ gap: '5px' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink-3)' }}>Project</span>
              <select
                class="field"
                style={{ height: '36px', padding: '0 10px', borderRadius: '11px', border: '1px solid var(--hair)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', outline: 'none' }}
                value={project}
                onChange={(e) => onProjectChange((e.target as HTMLSelectElement).value)}
              >
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          )}
          <InputSelector
            onSubmit={handleGenerate}
            disabled={isGenerating}
            detection={detection}
          />
          {proto.sandbox && !isGenerating && proto.state !== 'archived' && (
            <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Change the input and generate again to regenerate.</p>
          )}
        </div>

        <div class="flex flex-col min-h-0 min-w-0" style={{ background: 'var(--bg)' }}>
          <PrototypePreview port={proto.sandbox?.port ?? null} state={proto.state} viewport={viewport} />
          <div class="flex items-center flex-wrap shrink-0" style={{ gap: '12px', padding: '10px 22px', borderTop: '1px solid var(--hair)' }}>
            <Tabs size="sm" label="Viewport" tabs={VIEWPORTS.map(v => ({ id: v.id, label: v.label }))} active={viewport} onChange={(id) => setViewport(id as Viewport)} />
            <span class="flex-1" />
            <ol class="flex items-center flex-wrap" style={{ gap: '7px', listStyle: 'none' }} aria-label="Prototype stage">
              {STAGES.map((label, i) => {
                const on = i === stage
                return (
                  <li key={label} class="inline-flex items-center" aria-current={on ? 'step' : undefined} style={{ gap: '5px', fontSize: '11.5px', color: on ? 'var(--ink)' : 'var(--ink-3)', fontWeight: on ? 600 : 400 }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: on ? 'var(--blue)' : 'var(--ink-3)' }} />
                    {label}
                  </li>
                )
              })}
            </ol>
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
    </main>
  )
}

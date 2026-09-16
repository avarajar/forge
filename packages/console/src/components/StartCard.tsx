import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { Tabs, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { QUICK_TYPES, findCell, getHarnessStyle, resolveHarness, type QuickType } from '../config/types.js'
import { EMPTY_HINT, effectiveType, inferTask, inferenceText } from '../config/inference.js'
import { startInput, typeOverride, setStartInput } from '../state/startTask.js'
import { harnesses, supportsIn } from '../hooks/useHarnesses.js'
import { harnessUnavailableReason } from './HarnessPicker.js'

export type ProjectMap = Record<string, { path: string; account: string; harness?: string }>

export const InferenceLine: FunctionComponent<{ project: string; harness: string; size?: 'md' | 'sm' }> = ({ project, harness, size = 'md' }) => {
  const inf = inferTask(startInput.value)
  return (
    <p
      class="flex items-center"
      aria-live="polite"
      style={{ gap: '7px', fontSize: size === 'md' ? '12.5px' : '12px', color: inf ? 'var(--blue)' : 'var(--ink-3)', margin: size === 'md' ? '9px 2px 0' : 0 }}
    >
      {inf && (
        <span class="grid place-items-center shrink-0" style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'color-mix(in srgb, var(--blue) 22%, transparent)' }}>
          <span class="i-lucide-check" style={{ width: '10px', height: '10px' }} />
        </span>
      )}
      <span class="min-w-0" style={{ overflowWrap: 'anywhere' }}>{inf ? inferenceText(inf, project || 'no project', getHarnessStyle(harness).label) : EMPTY_HINT}</span>
    </p>
  )
}

export const TypeSegmented: FunctionComponent<{ fill?: boolean }> = ({ fill }) => (
  <Tabs
    fill={fill}
    label="Task type"
    tabs={QUICK_TYPES.map(t => ({ id: t.key, label: t.label }))}
    active={effectiveType(startInput.value, typeOverride.value)}
    onChange={(id) => { typeOverride.value = id as QuickType }}
  />
)

interface StartCardProps {
  projects: ProjectMap
  project: string
  onStarted: (session?: CWSession) => void
  onOpenDrawer: () => void
}

export const StartCard: FunctionComponent<StartCardProps> = ({ projects, project, onStarted, onOpenDrawer }) => {
  const [starting, setStarting] = useState(false)
  const response = harnesses.value
  const doctor = response?.available ? response.doctor : null
  const account = projects[project]?.account ?? ''
  const type = effectiveType(startInput.value, typeOverride.value)
  const harness = type === 'loop' ? 'claude' : doctor ? resolveHarness(project || undefined, account, projects, doctor) : 'claude'
  const value = startInput.value.trim()
  const disabled = !value || starting

  const start = async () => {
    if (disabled) return
    const inf = inferTask(value)
    const cell = doctor ? findCell(doctor, account, harness) : undefined
    const blocked = doctor ? harnessUnavailableReason(harness, cell, type === 'loop') : null
    const ticket = inf?.kind === 'linear' || inf?.kind === 'notion' ? inf.kind : null
    const missingToken = Boolean(response?.available && ticket && !supportsIn(response, harness, 'mcp') && !response.contextTokens[ticket])
    // anything that needs a choice or a warning goes through the drawer
    if (!project || type === 'loop' || type === 'general' || blocked || missingToken || cell?.status === 'not_logged_in') {
      onOpenDrawer()
      return
    }
    setStarting(true)
    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, project, task: value, account: account || undefined, harness: doctor ? harness : undefined }),
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok) {
        showToast(type === 'review' ? 'Review started' : 'Task started', 'success')
        setStartInput('')
        onStarted(result.session)
      } else {
        showToast(result.error ?? 'Failed to start', 'error')
      }
    } catch {
      showToast('Failed to start', 'error')
    } finally {
      setStarting(false)
    }
  }

  return (
    <section
      style={{ padding: '14px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-m)', animation: 'riseIn .34s var(--ease) both' }}
      aria-label="Start a task"
    >
      <div class="flex items-center flex-wrap" style={{ gap: '9px' }}>
        <input
          class="field min-w-0"
          style={{ flex: '1 1 300px', height: '40px', padding: '0 13px', borderRadius: '11px', border: '1px solid var(--hair)', background: 'var(--bg-2)', color: 'var(--ink)', fontSize: '14.5px', outline: 'none', transition: 'border-color .18s, box-shadow .18s' }}
          placeholder="Paste a Linear ticket, a PR link, or type a task name"
          aria-label="Task name, ticket or pull request"
          value={startInput.value}
          onInput={(e) => setStartInput((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void start() }}
        />
        <TypeSegmented />
        <button
          type="button"
          disabled={disabled}
          class={disabled ? '' : 'cursor-pointer transition-all duration-180 ease-spring hover:-translate-y-px hover:brightness-106'}
          style={{
            height: '40px', padding: '0 18px', borderRadius: '11px', border: 0, fontSize: '13.5px', fontWeight: 600,
            background: disabled && !starting ? 'var(--elev)' : 'linear-gradient(180deg, var(--blue-2), var(--blue))',
            color: disabled && !starting ? 'var(--ink-3)' : '#fff',
            boxShadow: disabled && !starting ? 'none' : 'var(--shadow-m)',
            opacity: disabled && !starting ? 0.8 : 1,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          onClick={() => void start()}
        >
          {starting ? 'Starting…' : 'Start'}
        </button>
      </div>
      <InferenceLine project={project} harness={harness} />
    </section>
  )
}

import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { Tabs, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { QUICK_TYPES, findCell, quickLabel, soft, getHarnessStyle, resolveHarness, type QuickType } from '../config/types.js'
import { effectiveType, inferTask, startSummary, type StartContext } from '../config/inference.js'
import { startInput, typeOverride, setStartInput, startProject, startAccount } from '../state/startTask.js'
import { harnesses, missingTicketToken } from '../hooks/useHarnesses.js'
import { harnessUnavailableReason } from './HarnessPicker.js'
import { Combobox, projectOptions } from './Combobox.js'

export type ProjectMap = Record<string, { path: string; account: string; harness?: string }>

export const InferenceLine: FunctionComponent<{ ctx: StartContext; size?: 'md' | 'sm' }> = ({ ctx, size = 'md' }) => {
  const { text, ready } = startSummary(startInput.value, { ...ctx, harness: getHarnessStyle(ctx.harness).label })
  const detected = ready && (ctx.type === 'general' || inferTask(startInput.value) !== null)
  return (
    <p
      class="flex items-center min-w-0"
      aria-live="polite"
      style={{ gap: '7px', fontSize: size === 'md' ? '12.5px' : '12px', color: detected ? 'var(--blue)' : 'var(--ink-3)' }}
    >
      {detected && (
        <span class="grid place-items-center shrink-0" style={{ width: '16px', height: '16px', borderRadius: '50%', background: soft('--blue', 22) }}>
          <span class="i-lucide-check" style={{ width: '10px', height: '10px' }} />
        </span>
      )}
      <span class="min-w-0" style={{ overflowWrap: 'anywhere' }}>{text}</span>
    </p>
  )
}

export const TypeSegmented: FunctionComponent<{ fill?: boolean }> = ({ fill }) => (
  <Tabs
    fill={fill}
    label="Task type"
    tabs={QUICK_TYPES.map(t => ({ id: t.key, label: quickLabel(t.key) }))}
    active={effectiveType(startInput.value, typeOverride.value)}
    onChange={(id) => { typeOverride.value = id as QuickType }}
  />
)

interface StartCardProps {
  projects: ProjectMap
  accounts: string[]
  onStarted: (session?: CWSession) => void
  onOpenDrawer: () => void
}

const pickerStyle = { width: 'auto', maxWidth: '180px', height: '30px', padding: '0 26px 0 10px', borderRadius: '9px', fontSize: '12.5px', background: 'var(--bg-2)' }

const Picker: FunctionComponent<{ label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }> = ({ label, value, onChange, options }) => (
  <label class="inline-flex items-center shrink-0" style={{ gap: '6px', fontSize: '12px', color: 'var(--ink-3)' }}>
    {label}
    <select class="field" aria-label={label} style={pickerStyle} value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>
)

export const StartCard: FunctionComponent<StartCardProps> = ({ projects, accounts, onStarted, onOpenDrawer }) => {
  const [starting, setStarting] = useState(false)
  const response = harnesses.value
  const doctor = response?.available ? response.doctor : null
  const type = effectiveType(startInput.value, typeOverride.value)
  const isGeneral = type === 'general'
  const project = startProject.value
  const projectNames = Object.keys(projects).sort()
  const account = isGeneral
    ? startAccount.value || projects[project]?.account || accounts[0] || ''
    : projects[project]?.account ?? ''
  const generalProjects = projectNames.filter(n => projects[n].account === account)
  const harness = type === 'loop' ? 'claude' : doctor ? resolveHarness(project || undefined, account, projects, doctor) : 'claude'
  const value = startInput.value.trim()
  const disabled = starting || (isGeneral ? !account : !value || !project)

  const start = async () => {
    if (disabled) return
    const cell = doctor ? findCell(doctor, account, harness) : undefined
    const blocked = doctor ? harnessUnavailableReason(harness, cell, type === 'loop') : null
    const missingToken = !isGeneral && missingTicketToken(response, harness, value)
    // anything that needs a choice or a warning goes through the drawer
    if (type === 'loop' || blocked || missingToken || cell?.status === 'not_logged_in') {
      onOpenDrawer()
      return
    }
    setStarting(true)
    try {
      const body = isGeneral
        ? { type, account, project: project || undefined, harness: doctor ? harness : undefined }
        : { type, project, task: value, account: account || undefined, harness: doctor ? harness : undefined }
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok) {
        showToast(isGeneral ? 'Session started' : type === 'review' ? 'Review started' : 'Task started', 'success')
        if (!isGeneral) setStartInput('')
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

  const changeAccount = (next: string) => {
    startAccount.value = next
    if (project && projects[project]?.account !== next) startProject.value = ''
  }

  return (
    <section
      // its own layer, so the project list opens over the cards below
      style={{ position: 'relative', zIndex: 5, padding: '14px', borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-m)', animation: 'riseIn .34s var(--ease) both' }}
      aria-label="Start a task"
    >
      <div class="flex items-center flex-wrap" style={{ gap: '9px' }}>
        <input
          class="field min-w-0"
          style={{ flex: '1 1 300px', height: '40px', padding: '0 13px', borderRadius: '11px', background: 'var(--bg-2)', fontSize: '14.5px' }}
          placeholder={isGeneral ? 'A general session needs no name — pick the account below' : 'Paste a Linear ticket, a PR link, or type a task name'}
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
          {starting ? 'Starting…' : isGeneral ? 'Launch' : 'Start'}
        </button>
      </div>
      <div class="flex items-center flex-wrap" style={{ gap: '8px 14px', marginTop: '10px', padding: '0 2px' }}>
        <div class="flex-1 min-w-0" style={{ flexBasis: '280px' }}>
          <InferenceLine ctx={{ type, project, account, harness }} />
        </div>
        {isGeneral && (
          <Picker label="Account" value={account} onChange={changeAccount} options={accounts.map(a => ({ value: a, label: a }))} />
        )}
        <div class="inline-flex items-center shrink-0" style={{ gap: '6px', fontSize: '12px', color: 'var(--ink-3)' }}>
          <span aria-hidden="true">Project</span>
          <Combobox
            label="Project"
            value={project}
            onChange={(v) => { startProject.value = v }}
            placeholder={isGeneral ? 'No project' : 'Choose…'}
            options={isGeneral
              ? [{ value: '', label: 'No project' }, ...projectOptions(projects, accounts, generalProjects)]
              : projectOptions(projects, accounts, projectNames)}
          />
        </div>
      </div>
    </section>
  )
}

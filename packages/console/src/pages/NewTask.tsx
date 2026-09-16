import { type FunctionComponent, type ComponentChildren } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import { ActionButton, CloseButton, Tabs, ToggleSwitch, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { CLAUDE_MODELS, findCell, getHarnessStyle, resolveHarness } from '../config/types.js'
import { effectiveType, slugOf } from '../config/inference.js'
import { startInput, setStartInput, typeOverride } from '../state/startTask.js'
import { harnesses, loadHarnesses, supportsIn } from '../hooks/useHarnesses.js'
import { HarnessPicker, harnessUnavailableReason } from '../components/HarnessPicker.js'
import { InferenceLine, TypeSegmented, type ProjectMap } from '../components/StartCard.js'

interface NewTaskProps {
  projects: ProjectMap
  accounts: string[]
  initialAccount?: string
  initialProject?: string
  onClose: () => void
  onCreated: (session?: CWSession) => void
  onOpenAccounts?: () => void
}

const TITLES = { dev: 'New dev task', review: 'Review a pull request', loop: 'New loop', general: 'New session' }

const HELP = {
  dev: 'A worktree session that ends in a pull request. Paste a Linear or Notion link and the ticket lands in TASK_NOTES.md first.',
  review: 'Opens a pull request in a review worktree and walks the agent through the diff.',
  loop: 'A recurring Claude Code /loop on one project — babysit PRs, fix failing tests, work a backlog.',
  general: 'A plain agent session on an account, optionally inside a project. No worktree.',
}

const NAME_LABEL = { dev: 'Task name or ticket URL', review: 'Pull request number or URL', loop: 'Loop prompt', general: '' }
const NAME_HINT = { dev: 'fix-auth or https://linear.app/…', review: '42 or https://github.com/…/pull/42', loop: 'Babysit my open PRs…', general: '' }

const WORKFLOWS = [{ id: '', label: 'Auto' }, { id: 'feature', label: 'feature' }, { id: 'bugfix', label: 'bugfix' }, { id: 'refactor', label: 'refactor' }]

const fieldStyle = {
  height: '38px', padding: '0 12px', borderRadius: '11px', border: '1px solid var(--hair)',
  background: 'var(--card)', color: 'var(--ink)', fontSize: '13.5px', outline: 'none', boxShadow: 'var(--shadow-s)', width: '100%',
}

const Field: FunctionComponent<{ label: ComponentChildren; children: ComponentChildren }> = ({ label, children }) => (
  <label class="flex flex-col min-w-0" style={{ gap: '5px' }}>
    <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{label}</span>
    {children}
  </label>
)

const quote = (s: string) => (/^[\w./:#-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`)

export const NewTask: FunctionComponent<NewTaskProps> = ({
  projects, accounts, initialAccount, initialProject, onClose, onCreated, onOpenAccounts,
}) => {
  const type = effectiveType(startInput.value, typeOverride.value)
  const [selectedAccount, setSelectedAccount] = useState('')
  const [project, setProject] = useState('')
  const [description, setDescription] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [model, setModel] = useState('')
  const [skipPermissions, setSkipPermissions] = useState(false)
  const [starting, setStarting] = useState(false)
  const [loopInterval, setLoopInterval] = useState('')
  const [harness, setHarness] = useState('claude')

  useEffect(() => { loadHarnesses() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const response = harnesses.value
  const doctor = response?.available ? response.doctor : null

  const projectNames = Object.keys(projects)
  const isGeneral = type === 'general'
  const isReview = type === 'review'
  const isLoop = type === 'loop'
  const task = startInput.value
  const loopIntervalValid = !loopInterval.trim() || /^\d+[smh]$/.test(loopInterval.trim())

  const accountList = accounts.length > 0
    ? accounts
    : Array.from(new Set(Object.values(projects).map(p => p.account).filter(Boolean))).sort()

  const filteredProjectNames = selectedAccount
    ? projectNames.filter(n => projects[n]?.account === selectedAccount)
    : projectNames

  // On mount: set initial account and project (runs once)
  useEffect(() => {
    const derivedAccount = initialProject && !initialAccount && projects[initialProject]
      ? projects[initialProject].account
      : undefined
    const wanted = initialAccount ?? derivedAccount
    const acc = wanted && accountList.includes(wanted) ? wanted : accountList[0] ?? ''
    setSelectedAccount(acc)
    const projs = acc ? projectNames.filter(n => projects[n]?.account === acc) : projectNames
    const proj = initialProject && projs.includes(initialProject)
      ? initialProject
      : (!isGeneral && projs.length > 0) ? projs[0] : ''
    if (proj) setProject(proj)
  }, [])

  // a general session may run outside any project; the others need one
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    if (!isGeneral && !project && filteredProjectNames.length > 0) setProject(filteredProjectNames[0])
  }, [isGeneral])

  const handleAccountChange = (acc: string) => {
    setSelectedAccount(acc)
    const projs = projectNames.filter(n => projects[n]?.account === acc)
    if (!isGeneral && projs.length > 0 && !projs.includes(project)) {
      setProject(projs[0])
    } else if (isGeneral && project && !projs.includes(project)) {
      setProject('')
    }
  }

  const defaultHarness = doctor ? resolveHarness(project || undefined, selectedAccount, projects, doctor) : 'claude'

  useEffect(() => {
    if (!doctor || !selectedAccount) return
    setHarness(isLoop ? 'claude' : defaultHarness)
  }, [response?.available, selectedAccount, project, isLoop])

  const cell = doctor ? findCell(doctor, selectedAccount, harness) : undefined
  const canSkipPermissions = !doctor || supportsIn(response, harness, 'skip_permissions')
  const usesClaudeModels = !doctor || harness === 'claude'
  const showModel = usesClaudeModels || !isGeneral
  const harnessBlocked = doctor ? harnessUnavailableReason(harness, cell, isLoop) : null
  const harnessName = getHarnessStyle(harness).label

  useEffect(() => {
    if (!canSkipPermissions) setSkipPermissions(false)
    setModel(usesClaudeModels ? '' : (cell?.model ?? ''))
  }, [harness])

  useEffect(() => {
    if (!usesClaudeModels) setModel(cell?.model ?? '')
  }, [selectedAccount])

  const ticketSource = /linear\.app/.test(task) ? 'linear' : /notion\.(so|site)/.test(task) ? 'notion' : null
  const missingTicketToken = Boolean(
    response?.available && ticketSource && !supportsIn(response, harness, 'mcp') && !response.contextTokens[ticketSource]
  )

  const missingInput = (!isGeneral && !task.trim()) || (isLoop && !loopIntervalValid) || (!isGeneral && !project)
  const disabled = missingInput || Boolean(harnessBlocked)

  const handleStart = async () => {
    if (disabled) return
    setStarting(true)
    try {
      const body: Record<string, unknown> = {
        type,
        account: selectedAccount || undefined,
        skipPermissions: skipPermissions || undefined,
      }
      if (doctor) body.harness = harness
      if (isLoop) {
        body.project = project
        body.loopPrompt = task.trim()
        body.loopInterval = loopInterval.trim() || undefined
      } else if (!isGeneral) {
        body.project = project
        body.task = task.trim()
        body.description = description.trim() || undefined
        body.workflow = workflow || undefined
      } else if (project) {
        body.project = project
      }
      body.model = showModel ? (model || undefined) : undefined

      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok) {
        showToast(isGeneral ? 'Session started' : isLoop ? 'Loop started' : 'Task started', 'success')
        if (!isGeneral) setStartInput('')
        onCreated(result.session)
      } else {
        showToast(result.error ?? 'Failed to start', 'error')
      }
    } catch {
      showToast('Failed to start', 'error')
    } finally {
      setStarting(false)
    }
  }

  const acct = selectedAccount || accountList[0] || 'default'
  const command = isGeneral ? `cw launch ${quote(acct)}`
    : isLoop ? `cw loop ${project || '<project>'} ${quote(task.trim() || '<prompt>')}${loopInterval.trim() ? ` --every ${loopInterval.trim()}` : ''}`
    : isReview ? `cw review ${project || '<project>'} ${quote(task.trim() || '<pr>')}`
    : `cw work ${project || '<project>'} ${task.trim() ? quote(slugOf(task)) : '<task>'}`

  return (
    <div
      class="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(0,0,0,.38)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[type]}
        class="new-task-drawer flex flex-col h-full overflow-auto"
        style={{ width: 'min(492px, 100%)', background: 'var(--bg-2)', borderLeft: '1px solid var(--hair)', boxShadow: 'var(--shadow-l)', animation: 'slideIn .3s var(--ease) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="glass flex items-center sticky top-0 z-1" style={{ gap: '10px', padding: '14px 18px', borderBottom: '1px solid var(--hair)' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em' }}>{TITLES[type]}</h2>
          <span class="flex-1" />
          <CloseButton onClick={onClose} />
        </div>

        <div class="flex flex-col" style={{ padding: '16px 18px 24px', gap: '14px' }}>
          <TypeSegmented fill />
          <p style={{ fontSize: '12.5px', color: 'var(--ink-2)', lineHeight: 1.5 }}>{HELP[type]}</p>

          {!isGeneral && (
            <div class="flex flex-col" style={{ gap: '5px' }}>
              <Field label={NAME_LABEL[type]}>
                <input
                  class="field"
                  style={{ ...fieldStyle, fontSize: '14px' }}
                  placeholder={NAME_HINT[type]}
                  value={task}
                  autoFocus
                  onInput={(e) => {
                    const value = (e.target as HTMLInputElement).value
                    // a loop prompt is free text, so typing it keeps the loop pick
                    if (isLoop) startInput.value = value
                    else setStartInput(value)
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleStart() }}
                />
              </Field>
              {!isLoop && <InferenceLine project={project} harness={harness} size="sm" />}
            </div>
          )}

          <div class="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Field label="Account">
              <select class="field" style={fieldStyle} value={selectedAccount} onChange={(e) => handleAccountChange((e.target as HTMLSelectElement).value)}>
                {accountList.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label={isGeneral ? 'Project · optional' : 'Project'}>
              <select class="field" style={fieldStyle} value={project} onChange={(e) => setProject((e.target as HTMLSelectElement).value)}>
                {isGeneral && <option value="">— none —</option>}
                {filteredProjectNames.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>

          {isLoop && (
            <Field label="Interval · optional">
              <input
                class="field mono"
                style={{ ...fieldStyle, borderColor: loopIntervalValid ? 'var(--hair)' : 'var(--red)' }}
                value={loopInterval}
                placeholder="auto — Claude decides the pace"
                onInput={(e) => setLoopInterval((e.target as HTMLInputElement).value)}
              />
              {!loopIntervalValid && <span style={{ fontSize: '12px', color: 'var(--red)' }}>Use forms like 30s, 5m, 2h — or leave it empty to self-pace</span>}
            </Field>
          )}

          {(type === 'dev' || isReview) && (
            <Field label="Description (optional)">
              <textarea
                class="field"
                rows={3}
                style={{ ...fieldStyle, height: 'auto', padding: '10px 12px', resize: 'none' }}
                placeholder="Context the agent reads first…"
                value={description}
                onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              />
            </Field>
          )}

          {doctor && (
            <HarnessPicker
              doctor={doctor}
              account={selectedAccount}
              value={harness}
              defaultHarness={defaultHarness}
              isLoop={isLoop}
              onChange={setHarness}
              onOpenAccounts={onOpenAccounts}
            />
          )}

          {showModel && (
            <div class="grid" style={{ gridTemplateColumns: type === 'dev' ? '1fr 1fr' : '1fr', gap: '10px' }}>
              <div class="flex flex-col min-w-0" style={{ gap: '5px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>Model</span>
                  {usesClaudeModels ? (
                    <Tabs fill size="sm" label="Model" tabs={CLAUDE_MODELS.map(m => ({ id: m.id, label: m.label }))} active={model} onChange={setModel} />
                  ) : (
                    <input
                      class="field mono"
                      style={{ ...fieldStyle, height: '32px', fontSize: '12.5px' }}
                      value={model}
                      placeholder="the account's model"
                      aria-label="Model"
                      onInput={(e) => setModel((e.target as HTMLInputElement).value)}
                    />
                  )}
              </div>
              {type === 'dev' && (
                <div class="flex flex-col min-w-0" style={{ gap: '5px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>Workflow</span>
                  <Tabs fill size="sm" label="Workflow" tabs={WORKFLOWS} active={workflow} onChange={setWorkflow} />
                </div>
              )}
            </div>
          )}

          {canSkipPermissions && (
            <div class="flex items-center" style={{ gap: '10px', padding: '10px 12px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-s)' }}>
              <span class="flex-1" style={{ fontSize: '13px' }}>
                Bypass permissions <span class="mono" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>--skip-permissions</span>
              </span>
              <ToggleSwitch checked={skipPermissions} onChange={setSkipPermissions} label="Bypass permissions" />
            </div>
          )}

          {missingTicketToken && (
            <p style={{ fontSize: '12.5px', padding: '10px 12px', borderRadius: '12px', background: 'color-mix(in srgb, var(--orange) 18%, transparent)', color: 'var(--ink)' }}>
              {harnessName} has no MCP and CW has no {ticketSource === 'linear' ? 'LINEAR_API_KEY' : 'NOTION_TOKEN'}, so
              the ticket will not reach TASK_NOTES.md. The task still starts, without the ticket.
            </p>
          )}

          <ActionButton
            label={starting ? 'Starting…' : isGeneral ? 'Launch session' : isLoop ? 'Start loop' : isReview ? 'Start review' : 'Start task'}
            variant="primary"
            size="lg"
            block
            loading={starting}
            disabled={disabled}
            onClick={handleStart}
          />
          {harnessBlocked && <p style={{ fontSize: '12px', color: 'var(--red)', textAlign: 'center' }}>{harnessBlocked}</p>}
          <p class="mono" style={{ fontSize: '11.5px', color: 'var(--ink-3)', textAlign: 'center', overflowWrap: 'anywhere' }}>{command}</p>
        </div>
      </aside>
    </div>
  )
}

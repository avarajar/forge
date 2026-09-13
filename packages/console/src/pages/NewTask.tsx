import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Badge, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { CLAUDE_MODELS, findCell, getHarnessStyle, resolveHarness } from '../config/types.js'
import { harnesses, loadHarnesses, supportsIn } from '../hooks/useHarnesses.js'
import { HarnessPicker, harnessUnavailableReason } from '../components/HarnessPicker.js'

interface NewTaskProps {
  projects: Record<string, { path: string; account: string; harness?: string }>
  accounts: string[]
  initialType?: string
  initialAccount?: string
  initialProject?: string
  onBack: () => void
  onCreated: (session?: CWSession) => void
  onStartPrototype?: (project: string) => void
  onOpenAccounts?: () => void
}

const TYPES = [
  { id: 'dev', label: 'Dev', color: '#f59e0b' },
  { id: 'review', label: 'Review', color: '#6366f1' },
  { id: 'loop', label: 'Loop', color: '#e11d48' },
  { id: 'general', label: 'General', color: '#059669' },
]

export const NewTask: FunctionComponent<NewTaskProps> = ({
  projects, accounts, initialType, initialAccount, initialProject, onBack, onCreated, onStartPrototype, onOpenAccounts
}) => {
  const [type, setType] = useState(initialType ?? 'dev')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [project, setProject] = useState('')
  const [task, setTask] = useState('')
  const [description, setDescription] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [model, setModel] = useState('')
  const [skipPermissions, setSkipPermissions] = useState(false)
  const [starting, setStarting] = useState(false)
  const [detection, setDetection] = useState<Record<string, unknown> | null>(null)
  const [loopPrompt, setLoopPrompt] = useState('')
  const [loopInterval, setLoopInterval] = useState('')
  const [harness, setHarness] = useState('claude')

  useEffect(() => { loadHarnesses() }, [])

  const response = harnesses.value
  const doctor = response?.available ? response.doctor : null

  const projectNames = Object.keys(projects)
  const isGeneral = type === 'general'
  const isReview = type === 'review'
  const isLoop = type === 'loop'
  const loopIntervalValid = !loopInterval.trim() || /^\d+[smh]$/.test(loopInterval.trim())

  // Derive accounts from projects if not provided
  const accountList = accounts.length > 0
    ? accounts
    : Array.from(new Set(Object.values(projects).map(p => p.account).filter(Boolean))).sort()

  // Filter projects by selected account
  const filteredProjectNames = selectedAccount
    ? projectNames.filter(n => projects[n]?.account === selectedAccount)
    : projectNames

  // On mount: set initial account and project (runs once)
  useEffect(() => {
    // If a project is pre-selected, derive account from it when not explicitly set
    const derivedAccount = initialProject && !initialAccount && projects[initialProject]
      ? projects[initialProject].account
      : undefined
    const acc = (initialAccount ?? derivedAccount) && accountList.includes((initialAccount ?? derivedAccount)!)
      ? (initialAccount ?? derivedAccount)!
      : accountList.length > 0 ? accountList[0] : ''
    setSelectedAccount(acc)
    const projs = acc
      ? projectNames.filter(n => projects[n]?.account === acc)
      : projectNames
    const proj = initialProject && projs.includes(initialProject)
      ? initialProject
      : (!isGeneral && projs.length > 0) ? projs[0] : ''
    if (proj) setProject(proj)
  }, [])

  // When account changes (user interaction), update project list
  const handleAccountChange = (acc: string) => {
    setSelectedAccount(acc)
    const projs = projectNames.filter(n => projects[n]?.account === acc)
    if (!isGeneral && projs.length > 0 && !projs.includes(project)) {
      setProject(projs[0])
    } else if (isGeneral && project && !projs.includes(project)) {
      setProject('')
    }
  }

  useEffect(() => {
    if (project && !isGeneral) {
      fetch(`/api/cw/detect/${encodeURIComponent(project)}`)
        .then(r => r.json())
        .then(d => setDetection(d as Record<string, unknown>))
        .catch(() => setDetection(null))
    }
  }, [project, isGeneral])

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

  const handleStart = async () => {
    if (harnessBlocked) return
    if (!isGeneral && !isLoop && !task.trim()) return
    if (isLoop && (!loopPrompt.trim() || !loopIntervalValid)) return

    if (type === 'design' && onStartPrototype) {
      onStartPrototype(project)
      return
    }

    setStarting(true)
    try {
      const body: Record<string, unknown> = {
        type: type === 'design' ? 'dev' : type,
        account: selectedAccount || undefined,
        skipPermissions: skipPermissions || undefined,
      }
      if (doctor) body.harness = harness
      if (isLoop) {
        body.project = project
        body.loopPrompt = loopPrompt.trim()
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

  return (
    <div>
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 text-xs font-medium rounded-lg border transition-colors text-forge-muted hover:text-forge-text"
        style={{ backgroundColor: 'var(--forge-ghost-bg)', borderColor: 'var(--forge-ghost-border)' }}
        onClick={onBack}
      >
        ← Back to tasks
      </button>

      <h2 class="text-xl font-bold mb-6">{isGeneral ? 'New Session' : isLoop ? 'New Loop' : 'New Task'}</h2>

      <div class="max-w-lg">
        {/* Type selector */}
        <div class="flex flex-wrap gap-2 mb-6">
          {TYPES.map(t => (
            <button
              key={t.id}
              class={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                type === t.id
                  ? 'text-forge-accent'
                  : 'border-forge-border bg-forge-surface text-forge-muted hover:text-forge-text'
              }`}
              style={type === t.id
                ? { backgroundColor: 'var(--forge-tint-accent-bg)', borderColor: 'var(--forge-accent)' }
                : undefined
              }
              onClick={() => { setType(t.id); setModel(''); if (t.id === 'general') setProject('') }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Account selector — always shown for general, conditional for others */}
        {(isGeneral || accountList.length > 1) && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Account</label>
            <select
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              value={selectedAccount}
              onChange={(e) => handleAccountChange((e.target as HTMLSelectElement).value)}
            >
              {accountList.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
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

        {/* Project selector — optional for general, required for others */}
        {(!isGeneral || filteredProjectNames.length > 0) && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">
              Project{isGeneral && <span class="font-normal text-forge-muted"> (optional)</span>}
            </label>
            <select
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              value={project}
              onChange={(e) => setProject((e.target as HTMLSelectElement).value)}
            >
              {isGeneral && <option value="">— none —</option>}
              {filteredProjectNames.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {project && projects[project] && (
              <div class="text-xs text-forge-muted mt-1">{(projects[project] as { path: string }).path}</div>
            )}
          </div>
        )}

        {/* Task name / PR number — hidden for general */}
        {!isGeneral && !isLoop && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">
              {isReview ? 'PR Number or URL' : 'Task Name or URL'}
            </label>
            <input
              type="text"
              value={task}
              onInput={(e) => setTask((e.target as HTMLInputElement).value)}
              placeholder={isReview ? '42 or https://github.com/...' : 'fix-auth or https://linear.app/...'}
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
            />
          </div>
        )}

        {/* Description — hidden for general */}
        {!isGeneral && !isLoop && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Description (optional)</label>
            <textarea
              value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              placeholder="Describe the task..."
              rows={3}
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
            />
          </div>
        )}

        {/* Loop prompt + interval */}
        {isLoop && (
          <>
            <div class="mb-4">
              <label class="block text-sm font-medium mb-1">Loop prompt</label>
              <textarea
                value={loopPrompt}
                onInput={(e) => setLoopPrompt((e.target as HTMLTextAreaElement).value)}
                placeholder={'e.g. "Babysit my open PRs — check for new review comments and address them", "Run the test suite and fix what breaks", "Work through the TODO backlog one item at a time"'}
                rows={3}
                class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
              />
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium mb-1">
                Interval <span class="font-normal text-forge-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={loopInterval}
                onInput={(e) => setLoopInterval((e.target as HTMLInputElement).value)}
                placeholder="auto — Claude decides the pace"
                class={`w-full px-3 py-2 rounded-lg bg-forge-surface border text-forge-text text-sm focus:outline-none ${
                  loopIntervalValid ? 'border-forge-border focus:border-forge-accent' : 'border-red-500'
                }`}
              />
              {!loopIntervalValid && (
                <div class="text-xs text-red-500 mt-1">Use forms like 30s, 5m, 2h — or leave empty for self-paced</div>
              )}
            </div>
          </>
        )}

        {/* Workflow (dev only) */}
        {type === 'dev' && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Workflow</label>
            <div class="flex gap-2">
              {['', 'feature', 'bugfix', 'refactor'].map(w => (
                <button
                  key={w}
                  class={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    workflow === w
                      ? 'text-forge-accent'
                      : 'border-forge-border bg-forge-surface text-forge-muted'
                  }`}
                  style={workflow === w
                    ? { backgroundColor: 'rgba(99,102,241,0.1)', borderColor: 'var(--forge-accent)' }
                    : undefined
                  }
                  onClick={() => setWorkflow(w)}
                >
                  {w || 'Auto'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Skip permissions toggle */}
        {canSkipPermissions && (
          <label class="flex items-center gap-2 mb-4 cursor-pointer text-sm text-forge-muted">
            <input
              type="checkbox"
              checked={skipPermissions}
              onChange={(e) => setSkipPermissions((e.target as HTMLInputElement).checked)}
            />
            Bypass permissions
            <span class="text-[11px] opacity-60">(--skip-permissions)</span>
          </label>
        )}

        {/* Model selector */}
        {showModel && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">
              Model{' '}
              <span class="text-forge-muted font-normal">
                {usesClaudeModels ? '(claude default if not set)' : "(the account's model if empty)"}
              </span>
            </label>
            {usesClaudeModels ? (
              <div class="flex flex-wrap gap-2">
                {CLAUDE_MODELS.map(m => (
                  <button
                    key={m.id}
                    class={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      model === m.id ? 'text-forge-accent' : 'border-forge-border bg-forge-surface text-forge-muted'
                    }`}
                    style={model === m.id ? { backgroundColor: 'rgba(99,102,241,0.1)', borderColor: 'var(--forge-accent)' } : undefined}
                    onClick={() => setModel(m.id)}
                    title={m.description}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={model}
                onInput={(e) => setModel((e.target as HTMLInputElement).value)}
                placeholder="the model configured on the account"
                class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              />
            )}
          </div>
        )}

        {/* Stack detection — hidden for general */}
        {!isGeneral && detection && (
          <div class="flex flex-wrap gap-2 mb-6">
            {detection.framework && <Badge label={String(detection.framework)} color="var(--forge-accent)" />}
            {detection.testRunner && <Badge label={String(detection.testRunner)} color="var(--forge-success)" />}
            {detection.hasTailwind && <Badge label="Tailwind" color="var(--forge-accent)" variant="outline" />}
            {detection.hasShadcn && <Badge label="shadcn" color="var(--forge-accent)" variant="outline" />}
            {detection.hasPlaywright && <Badge label="Playwright" color="var(--forge-success)" variant="outline" />}
            {detection.hasDockerfile && <Badge label="Docker" color="var(--forge-warning)" variant="outline" />}
          </div>
        )}

        {missingTicketToken && (
          <div
            class="text-xs rounded-lg px-3 py-2 mb-4 text-forge-text"
            style={{ backgroundColor: 'var(--forge-tint-amber-bg)', border: '1px solid var(--forge-tint-amber-border)' }}
          >
            {harnessName} has no MCP and CW has no {ticketSource === 'linear' ? 'LINEAR_API_KEY' : 'NOTION_TOKEN'}, so
            the ticket will not reach TASK_NOTES.md. The task still starts, without the ticket.
          </div>
        )}

        {/* Start button */}
        <ActionButton
          label={starting ? 'Starting...' : isGeneral ? 'Launch Session ▶' : isLoop ? 'Start Loop ▶' : 'Start Task ▶'}
          variant="primary"
          loading={starting}
          disabled={(!isGeneral && !isLoop && !task.trim()) || (isLoop && (!loopPrompt.trim() || !loopIntervalValid)) || Boolean(harnessBlocked)}
          onClick={handleStart}
        />
        {harnessBlocked && <div class="text-xs mt-2" style={{ color: 'var(--forge-error)' }}>{harnessBlocked}</div>}
        <div class="text-xs text-forge-muted mt-2">
          {isGeneral
            ? project
              ? `Opens ${harnessName} in "${project}" for account "${selectedAccount || accountList[0] || 'default'}"`
              : `Opens ${harnessName} for account "${selectedAccount || accountList[0] || 'default'}"`
            : isLoop
              ? `Runs a recurring Claude loop in "${project}" — ${loopInterval.trim() ? `every ${loopInterval.trim()}` : 'self-paced'}`
              : `Opens a CW session on ${harnessName} for ${project}`
          }
        </div>
      </div>
    </div>
  )
}

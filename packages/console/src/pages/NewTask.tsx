import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Badge, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'

interface NewTaskProps {
  projects: Record<string, { path: string; account: string }>
  accounts: string[]
  initialType?: string
  initialAccount?: string
  initialProject?: string
  onBack: () => void
  onCreated: (session?: CWSession) => void
  onStartPrototype?: (project: string) => void
}

const TYPES = [
  { id: 'dev', label: 'Dev', color: '#f59e0b' },
  { id: 'design', label: 'Design', color: '#8b5cf6' },
  { id: 'review', label: 'Review', color: '#6366f1' },
  { id: 'plan', label: 'Plan', color: '#3b82f6' },
  { id: 'general', label: 'General', color: '#059669' },
]

export const NewTask: FunctionComponent<NewTaskProps> = ({
  projects, accounts, initialType, initialAccount, initialProject, onBack, onCreated, onStartPrototype
}) => {
  const [type, setType] = useState(initialType ?? 'dev')
  const [selectedAccount, setSelectedAccount] = useState('')
  const [project, setProject] = useState('')
  const [task, setTask] = useState('')
  const [description, setDescription] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [skipPermissions, setSkipPermissions] = useState(false)
  const [starting, setStarting] = useState(false)
  const [detection, setDetection] = useState<Record<string, unknown> | null>(null)

  const projectNames = Object.keys(projects)
  const isGeneral = type === 'general'
  const isReview = type === 'review'

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
      : projs.length > 0 ? projs[0] : ''
    if (proj) setProject(proj)
  }, [])

  // When account changes (user interaction), update project list
  const handleAccountChange = (acc: string) => {
    setSelectedAccount(acc)
    const projs = projectNames.filter(n => projects[n]?.account === acc)
    if (projs.length > 0 && !projs.includes(project)) {
      setProject(projs[0])
    }
  }

  useEffect(() => {
    if (project && !isGeneral) {
      fetch(`/api/cw/detect/${project}`)
        .then(r => r.json())
        .then(d => setDetection(d as Record<string, unknown>))
        .catch(() => setDetection(null))
    }
  }, [project, isGeneral])

  const handleStart = async () => {
    if (!isGeneral && !task.trim()) return

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
      if (!isGeneral) {
        body.project = project
        body.task = task.trim()
        body.description = description.trim() || undefined
        body.workflow = workflow || undefined
      }

      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const result = await res.json() as { ok: boolean; error?: string; session?: CWSession }
      if (result.ok) {
        showToast(isGeneral ? 'Session started' : 'Task started', 'success')
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

      <h2 class="text-xl font-bold mb-6">{isGeneral ? 'New Session' : 'New Task'}</h2>

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
              onClick={() => setType(t.id)}
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

        {/* Project selector — hidden for general */}
        {!isGeneral && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Project</label>
            <select
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              value={project}
              onChange={(e) => setProject((e.target as HTMLSelectElement).value)}
            >
              {filteredProjectNames.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {projects[project] && (
              <div class="text-xs text-forge-muted mt-1">{(projects[project] as { path: string }).path}</div>
            )}
          </div>
        )}

        {/* Task name / PR number — hidden for general */}
        {!isGeneral && (
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
        {!isGeneral && (
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
        <label class="flex items-center gap-2 mb-4 cursor-pointer text-sm text-forge-muted">
          <input
            type="checkbox"
            checked={skipPermissions}
            onChange={(e) => setSkipPermissions((e.target as HTMLInputElement).checked)}
          />
          Bypass permissions
          <span class="text-[11px] opacity-60">(--skip-permissions)</span>
        </label>

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

        {/* Start button */}
        <ActionButton
          label={starting ? 'Starting...' : isGeneral ? 'Launch Session ▶' : 'Start Task ▶'}
          variant="primary"
          loading={starting}
          disabled={!isGeneral && !task.trim()}
          onClick={handleStart}
        />
        <div class="text-xs text-forge-muted mt-2">
          {isGeneral
            ? `Opens Claude for account "${selectedAccount || accountList[0] || 'default'}"`
            : `Opens a CW session in your terminal for ${project}`
          }
        </div>
      </div>
    </div>
  )
}

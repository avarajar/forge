import { type FunctionComponent } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { ActionButton, Badge, showToast } from '@forge-dev/ui'

interface NewTaskProps {
  projects: Record<string, { path: string }>
  initialType?: string
  onBack: () => void
  onCreated: () => void
}

const TYPES = [
  { id: 'dev', label: 'Dev', color: '#f59e0b' },
  { id: 'design', label: 'Design', color: '#8b5cf6' },
  { id: 'review', label: 'Review', color: '#6366f1' },
  { id: 'plan', label: 'Plan', color: '#3b82f6' },
  { id: 'create', label: 'Create Project', color: '#10b981' },
]

export const NewTask: FunctionComponent<NewTaskProps> = ({
  projects, initialType, onBack, onCreated
}) => {
  const [type, setType] = useState(initialType ?? 'dev')
  const [project, setProject] = useState('')
  const [task, setTask] = useState('')
  const [description, setDescription] = useState('')
  const [workflow, setWorkflow] = useState('')
  const [starting, setStarting] = useState(false)
  const [detection, setDetection] = useState<Record<string, unknown> | null>(null)

  const projectNames = Object.keys(projects)

  useEffect(() => {
    if (projectNames.length > 0 && !project) {
      setProject(projectNames[0])
    }
  }, [projectNames])

  useEffect(() => {
    if (project && type !== 'create') {
      fetch(`/api/cw/detect/${project}`)
        .then(r => r.json())
        .then(d => setDetection(d as Record<string, unknown>))
        .catch(() => setDetection(null))
    }
  }, [project, type])

  const handleStart = async () => {
    if (type !== 'create' && !task.trim()) return
    if (type === 'create' && !description.trim()) return

    setStarting(true)
    try {
      const res = await fetch('/api/cw/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type === 'design' ? 'dev' : type,
          project: type === 'create' ? task.trim() : project,
          task: type === 'review' ? task.trim() : task.trim(),
          description: description.trim() || undefined,
          workflow: workflow || undefined
        })
      })
      const result = await res.json() as { ok: boolean; error?: string }
      if (result.ok) {
        showToast('Task started — check your terminal', 'success')
        onCreated()
      } else {
        showToast(result.error ?? 'Failed to start task', 'error')
      }
    } catch {
      showToast('Failed to start task', 'error')
    } finally {
      setStarting(false)
    }
  }

  const isReview = type === 'review'
  const isCreate = type === 'create'

  return (
    <div>
      <button class="text-sm text-forge-muted hover:text-forge-text mb-4" onClick={onBack}>
        ← Back to tasks
      </button>

      <h2 class="text-xl font-bold mb-6">New Task</h2>

      <div class="max-w-lg">
        {/* Type selector */}
        <div class="flex flex-wrap gap-2 mb-6">
          {TYPES.map(t => (
            <button
              key={t.id}
              class={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                type === t.id
                  ? 'border-forge-accent bg-forge-accent/10 text-forge-accent'
                  : 'border-forge-border bg-forge-surface text-forge-muted hover:text-forge-text'
              }`}
              onClick={() => setType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Project selector (not for Create) */}
        {!isCreate && (
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Project</label>
            <select
              class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
              value={project}
              onChange={(e) => setProject((e.target as HTMLSelectElement).value)}
            >
              {projectNames.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {projects[project] && (
              <div class="text-xs text-forge-muted mt-1">{projects[project].path}</div>
            )}
          </div>
        )}

        {/* Task name / PR number / Project name */}
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">
            {isReview ? 'PR Number or URL' : isCreate ? 'Project Name' : 'Task Name or URL'}
          </label>
          <input
            type="text"
            value={task}
            onInput={(e) => setTask((e.target as HTMLInputElement).value)}
            placeholder={isReview ? '42 or https://github.com/...' : isCreate ? 'my-new-project' : 'fix-auth or https://linear.app/...'}
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none"
          />
        </div>

        {/* Description */}
        <div class="mb-4">
          <label class="block text-sm font-medium mb-1">
            {isCreate ? 'Describe what you want to build' : 'Description (optional)'}
          </label>
          <textarea
            value={description}
            onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
            placeholder={isCreate ? 'A SaaS platform for...' : 'Describe the task...'}
            rows={3}
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
          />
        </div>

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
                      ? 'border-forge-accent bg-forge-accent/10 text-forge-accent'
                      : 'border-forge-border bg-forge-surface text-forge-muted'
                  }`}
                  onClick={() => setWorkflow(w)}
                >
                  {w || 'Auto'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stack detection */}
        {detection && !isCreate && (
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
          label={starting ? 'Starting...' : isCreate ? 'Create Project ▶' : 'Start Task ▶'}
          variant="primary"
          loading={starting}
          disabled={isCreate ? !description.trim() : !task.trim()}
          onClick={handleStart}
        />
        <div class="text-xs text-forge-muted mt-2">
          {isCreate
            ? 'Creates a new project with CW'
            : `Opens a CW session in your terminal for ${project}`
          }
        </div>
      </div>
    </div>
  )
}

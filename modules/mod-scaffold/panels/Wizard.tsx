import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { ActionButton } from '@forge-dev/ui'

type WizardStep = 'name' | 'template' | 'options' | 'creating' | 'done'

const TEMPLATES = [
  { id: 'vite-react', name: 'Vite + React' },
  { id: 'vite-preact', name: 'Vite + Preact' },
  { id: 'nextjs', name: 'Next.js' },
  { id: 'hono', name: 'Hono API' },
  { id: 'astro', name: 'Astro' },
  { id: 'express', name: 'Express API' },
]

function WizardPanel(_props: PanelProps) {
  const [step, setStep] = useState<WizardStep>('name')
  const [projectName, setProjectName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [initGit, setInitGit] = useState(true)
  const [output, setOutput] = useState<string | null>(null)

  const steps: WizardStep[] = ['name', 'template', 'options']
  const currentIndex = steps.indexOf(step)

  const handleCreate = async () => {
    setStep('creating')
    setOutput(`Would create project "${projectName}" using template "${selectedTemplate}"${initGit ? ' with git init' : ''}`)
    setStep('done')
  }

  return (
    <div class="max-w-lg">
      {/* Progress indicator */}
      <div class="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s} class="flex items-center gap-2">
            <div class={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
              ${i < currentIndex ? 'bg-forge-success text-white'
                : i === currentIndex ? 'bg-forge-accent text-white'
                : 'bg-forge-surface border border-forge-border text-forge-muted'}`}>
              {i < currentIndex ? '\u2713' : i + 1}
            </div>
            <span class={`text-xs ${i === currentIndex ? 'text-forge-text font-medium' : 'text-forge-muted'}`}>
              {s === 'name' ? 'Name' : s === 'template' ? 'Template' : 'Options'}
            </span>
            {i < steps.length - 1 && (
              <div class={`w-8 h-px ${i < currentIndex ? 'bg-forge-success' : 'bg-forge-border'}`} />
            )}
          </div>
        ))}
      </div>

      {step === 'name' && (
        <div>
          <label class="block text-sm font-medium mb-2">Project Name</label>
          <input type="text" value={projectName}
            onInput={(e) => setProjectName((e.target as HTMLInputElement).value)}
            placeholder="my-awesome-project"
            class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none" />
          <div class="mt-4">
            <ActionButton label="Next" variant="primary" disabled={!projectName.trim()} onClick={() => setStep('template')} />
          </div>
        </div>
      )}

      {step === 'template' && (
        <div>
          <label class="block text-sm font-medium mb-2">Choose Template</label>
          <div class="space-y-2">
            {TEMPLATES.map(t => (
              <button key={t.id}
                class={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors
                  ${selectedTemplate === t.id ? 'border-forge-accent bg-forge-accent/10 text-forge-accent' : 'border-forge-border bg-forge-surface text-forge-text hover:border-forge-accent/40'}`}
                onClick={() => setSelectedTemplate(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          <div class="flex gap-2 mt-4">
            <ActionButton label="Back" variant="secondary" onClick={() => setStep('name')} />
            <ActionButton label="Next" variant="primary" disabled={!selectedTemplate} onClick={() => setStep('options')} />
          </div>
        </div>
      )}

      {step === 'options' && (
        <div>
          <label class="block text-sm font-medium mb-2">Options</label>
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={initGit} onChange={(e) => setInitGit((e.target as HTMLInputElement).checked)} class="rounded" />
            Initialize Git repository
          </label>
          <div class="flex gap-2 mt-4">
            <ActionButton label="Back" variant="secondary" onClick={() => setStep('template')} />
            <ActionButton label="Create Project" variant="primary" onClick={handleCreate} />
          </div>
        </div>
      )}

      {step === 'creating' && (
        <div class="text-center py-8"><div class="text-forge-muted animate-pulse">Creating project...</div></div>
      )}

      {step === 'done' && (
        <div>
          <div class="p-4 rounded-lg bg-forge-success/10 border border-forge-success/30 text-sm mb-4">{output}</div>
          <ActionButton label="Create Another" variant="secondary" onClick={() => { setStep('name'); setProjectName(''); setSelectedTemplate(''); setOutput(null) }} />
        </div>
      )}
    </div>
  )
}

export default definePanel({ id: 'wizard', title: 'New Project', component: WizardPanel })

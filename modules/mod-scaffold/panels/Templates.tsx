import { type FunctionComponent } from 'preact'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { DataList, type DataListItem, ActionButton } from '@forge-dev/ui'

interface Template {
  id: string
  name: string
  description: string
  command: string
  category: string
}

const TEMPLATES: Template[] = [
  { id: 'vite-react', name: 'Vite + React', description: 'Fast React SPA with Vite bundler', command: 'npm create vite@latest -- --template react-ts', category: 'Frontend' },
  { id: 'vite-preact', name: 'Vite + Preact', description: 'Lightweight Preact SPA with Vite', command: 'npm create vite@latest -- --template preact-ts', category: 'Frontend' },
  { id: 'nextjs', name: 'Next.js', description: 'Full-stack React framework', command: 'npx create-next-app@latest --ts --app --tailwind', category: 'Full-stack' },
  { id: 'hono', name: 'Hono API', description: 'Fast edge-ready API server', command: 'npm create hono@latest', category: 'Backend' },
  { id: 'astro', name: 'Astro', description: 'Content-focused static site framework', command: 'npm create astro@latest', category: 'Frontend' },
  { id: 'express', name: 'Express API', description: 'Classic Node.js HTTP server', command: 'npx express-generator --no-view', category: 'Backend' }
]

function TemplatesPanel(_props: PanelProps) {
  const items: DataListItem[] = TEMPLATES.map(t => ({
    id: t.id,
    title: t.name,
    subtitle: t.description,
    badge: { label: t.category, color: t.category === 'Frontend' ? 'var(--forge-accent)' : t.category === 'Backend' ? 'var(--forge-success)' : 'var(--forge-warning)' },
    trailing: (
      <ActionButton label="Use" variant="secondary" onClick={() => { navigator.clipboard.writeText(t.command) }} />
    )
  }))

  return (
    <div>
      <div class="mb-4">
        <h3 class="text-sm font-medium text-forge-muted">{TEMPLATES.length} templates available</h3>
      </div>
      <DataList items={items} />
    </div>
  )
}

export default definePanel({ id: 'templates', title: 'Templates', component: TemplatesPanel })

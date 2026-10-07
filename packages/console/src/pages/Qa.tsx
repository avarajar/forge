import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { EmptyState } from '@forge-dev/ui'
import { escalations } from '@forge-dev/mod-qa/panels'
import { PageHeader } from '../components/PageHeader.js'
import type { ProjectMap } from '../components/StartCard.js'

const STORAGE_KEY = 'forge.qa.project'
// el servidor carga mod-qa como módulo incluido (BUNDLED_MODULES en core)
const MODULE_ID = 'mod-qa'

function remembered(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export const Qa: FunctionComponent<{ projects: ProjectMap; preferred?: string }> = ({ projects, preferred }) => {
  const names = Object.keys(projects).sort()
  const pick = (want: string) => (names.includes(want) ? want : names[0] ?? '')
  const [project, setProject] = useState(() => pick(preferred || remembered()))

  useEffect(() => {
    if (!names.includes(project)) setProject(pick(preferred || remembered()))
  }, [names.join('\n'), preferred])

  const choose = (name: string) => {
    setProject(name)
    try {
      localStorage.setItem(STORAGE_KEY, name)
    } catch {
      // sin localStorage solo se pierde el recuerdo del proyecto elegido
    }
  }

  const Panel = escalations.component
  return (
    <div class="flex flex-col min-h-full">
      <PageHeader title="QA" subtitle="PRs que qa-pilot escaló a una persona, con la evidencia para decidir">
        {names.length > 0 && (
          <label class="inline-flex items-center gap-2" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
            Proyecto
            <select class="field" value={project} onChange={(e) => choose((e.target as HTMLSelectElement).value)} style={{ minWidth: '160px' }}>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </PageHeader>
      <div style={{ padding: '18px 22px', maxWidth: '1180px', width: '100%' }}>
        {names.length === 0 ? (
          <EmptyState icon="i-lucide-folder-search" title="No hay proyectos" description="Agrega un proyecto de CW para ver sus PRs escalados." />
        ) : (
          <Panel key={project} moduleId={MODULE_ID} projectId={null} cwProject={project} />
        )}
      </div>
    </div>
  )
}

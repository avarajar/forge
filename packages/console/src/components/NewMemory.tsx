import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { ActionButton, Drawer, Tabs, showToast } from '@forge-dev/ui'
import type { KiokuBrain, KiokuSaveResult } from '@forge-dev/core'
import { Field, inputValue } from './Field.js'
import { errorText, postJson } from '../config/api.js'
import { PAGE_TYPES, pageNote as note, soft } from '../config/types.js'
import { brainName, chainFor, kioku, loadKioku } from '../hooks/useKioku.js'
import { AreaForm } from './BrainForms.js'

interface NewMemoryProps {
  // the project picked on the Memory page; its project brain is the default
  project: string | null
  onClose: () => void
}

type Similar = Extract<KiokuSaveResult, { status: 'similar' }>['similar']

function defaultBrain(brains: KiokuBrain[], project: string | null): string {
  const chain = project ? chainFor(project) : []
  const pick = chain.find(b => b.tier === 'project' || b.tier === 'client') ?? brains.find(b => b.personal) ?? brains[0]
  return pick?.key ?? ''
}

export const NewMemory: FunctionComponent<NewMemoryProps> = ({ project, onClose }) => {
  const brains = (kioku.value?.brains ?? []).filter(b => b.onDisk)
  const [brainKey, setBrainKey] = useState(() => defaultBrain(brains, project))
  const [type, setType] = useState(PAGE_TYPES[0].id)
  const [namespace, setNamespace] = useState('')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [sections, setSections] = useState<Record<string, string>>({})
  const [similar, setSimilar] = useState<Similar | null>(null)
  const [saving, setSaving] = useState(false)
  const [addingArea, setAddingArea] = useState(false)

  const brain = brains.find(b => b.key === brainKey)
  const namespaces = brain?.namespaces ?? []
  // a brain with one namespace needs none named
  const area = namespaces.length === 1 ? namespaces[0] : namespace
  const spec = PAGE_TYPES.find(t => t.id === type) ?? PAGE_TYPES[0]
  // context pages are free text, every other type is its sections
  const free = spec.sections.length === 0
  const fields = free ? ['Text'] : spec.sections
  const complete = Boolean(brain && area && title.trim() && summary.trim() && fields.every(f => sections[f]?.trim()))

  const save = async (create = false) => {
    if (!brain || !complete || saving) return
    setSaving(true)
    const body = free
      ? `${(sections.Text ?? '').trim()}\n`
      : spec.sections.map(s => `## ${s}\n\n${(sections[s] ?? '').trim()}\n`).join('\n')
    try {
      const result = await postJson<KiokuSaveResult>('/api/kioku/pages', { brain: brain.key, type, title, summary, body, namespace: area, create })
      if (result.status === 'similar') {
        setSimilar(result.similar)
      } else if (result.status === 'namespace') {
        showToast(`Pick an area of ${brainName(brain)}`, 'error')
      } else {
        showToast(`Saved to ${result.brain}: ${result.path}`, 'success')
        void loadKioku(true)
        onClose()
      }
    } catch (err) {
      showToast(errorText(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer title="New memory" onClose={onClose}>
      <Field label="Brain">
        <select class="field" value={brainKey} onChange={(e) => { setBrainKey(inputValue(e)); setNamespace(''); setSimilar(null) }}>
          {brains.map(b => <option key={b.key} value={b.key}>{brainName(b)} · {b.tier}</option>)}
        </select>
      </Field>

      {brain && namespaces.length === 0 && (
        <div class="flex items-center" style={{ ...note, gap: '12px', background: soft('--orange') }}>
          <span class="flex-1">{brainName(brain)} has no areas yet. Each page goes in one, and a person names them.</span>
          <ActionButton label="Add area" variant="secondary" size="sm" onClick={() => setAddingArea(true)} />
        </div>
      )}
      {namespaces.length > 1 && (
        <Field label="Area">
          <select class="field" value={namespace} onChange={(e) => setNamespace(inputValue(e))}>
            <option value="">Choose…</option>
            {namespaces.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      )}

      <div class="flex">
        <Tabs size="sm" label="Page type" tabs={PAGE_TYPES.map(t => ({ id: t.id, label: t.label }))} active={type} onChange={(id) => { setType(id); setSimilar(null) }} />
      </div>

      <Field label="Title">
        <input type="text" class="field" value={title} placeholder="Payments retry at most three times" onInput={(e) => { setTitle(inputValue(e)); setSimilar(null) }} />
      </Field>
      <Field label="Summary · one line the agent reads first">
        <input type="text" class="field" value={summary} onInput={(e) => setSummary(inputValue(e))} />
      </Field>

      {fields.map(f => (
        <Field key={`${type}:${f}`} label={f}>
          <textarea class="field" rows={f === 'Text' ? 8 : 3} value={sections[f] ?? ''} onInput={(e) => setSections(s => ({ ...s, [f]: inputValue(e) }))} />
        </Field>
      ))}

      {similar && (
        <div style={{ ...note, background: soft('--orange') }}>
          <p style={{ fontWeight: 600, marginBottom: '6px' }}>{brain ? brainName(brain) : 'The brain'} already has pages on this:</p>
          <ul class="flex flex-col" style={{ gap: '4px', paddingLeft: '16px', listStyle: 'disc' }}>
            {similar.map(p => <li key={p.path}><b>{p.title}</b>{p.summary ? ` — ${p.summary}` : ''}</li>)}
          </ul>
          <p style={{ marginTop: '6px', color: 'var(--ink-2)' }}>Save it anyway to keep both; kioku links them under See also.</p>
        </div>
      )}

      {brain?.remote && (
        <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
          Kioku commits to {brainName(brain)}'s main branch and pushes it; it has no review step.
        </p>
      )}

      <div class="flex justify-end" style={{ gap: '8px' }}>
        <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
        <ActionButton label={similar ? 'Save anyway' : 'Save'} variant="primary" disabled={!complete || saving} onClick={() => save(similar !== null)} />
      </div>
      {addingArea && brain && <AreaForm brain={brain} onClose={() => setAddingArea(false)} />}
    </Drawer>
  )
}

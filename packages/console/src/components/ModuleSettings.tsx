import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, Drawer, ToggleSwitch, showToast } from '@forge-dev/ui'
import type { ModuleSettings as Values, ScalarSettingDef, SettingDef } from '@forge-dev/sdk'
import { Field, inputValue, labelStyle } from './Field.js'
import { DirectoryPicker } from './DirectoryPicker.js'
import { errorText } from '../config/api.js'

type Errors = Record<string, string>
type Item = Record<string, unknown>

interface Props {
  moduleId: string
  displayName: string
  schema: Record<string, SettingDef>
  onClose: () => void
  onSaved: () => void
}

const errorStyle = { fontSize: '11.5px', color: 'var(--red)' }

// controls that are not a single native input cannot sit inside a <label>
const plainControl = (d: ScalarSettingDef) => d.type === 'boolean' || (d.type === 'string' && d.format === 'path')

const ScalarInput: FunctionComponent<{ def: ScalarSettingDef; value: unknown; projects: string[]; onChange: (v: unknown) => void }> = ({ def, value, projects, onChange }) => {
  if (def.type === 'boolean') return <ToggleSwitch checked={value === true} onChange={onChange} label={def.label} />
  if (def.type === 'enum') {
    return (
      <select class="field" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(inputValue(e))}>
        {def.values.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    )
  }
  if (def.type === 'number') {
    return <input type="number" class="field" value={typeof value === 'number' ? value : ''} min={def.min} max={def.max} onInput={(e) => { const t = inputValue(e); onChange(t === '' ? undefined : Number(t)) }} />
  }
  if (def.format === 'cw-project') {
    return (
      <select class="field" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(inputValue(e) || undefined)}>
        <option value="">None</option>
        {projects.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    )
  }
  if (def.format === 'path') return <DirectoryPicker value={typeof value === 'string' ? value : ''} onChange={(path) => onChange(path)} requireGit={false} />
  return <input type={def.format === 'url' ? 'url' : 'text'} class="field" value={typeof value === 'string' ? value : ''} onInput={(e) => onChange(inputValue(e))} />
}

const Labeled: FunctionComponent<{ def: SettingDef; error?: string; plain?: boolean }> = ({ def, error, plain, children }) => (
  <Field plain={plain} label={<>{def.label ?? ''}{def.required ? ' *' : ''}</>}>
    {children}
    {def.help && <span style={labelStyle}>{def.help}</span>}
    {error && <span style={errorStyle}>{error}</span>}
  </Field>
)

// a form generated from the module's settings schema; the server validates and answers with paths
export const ModuleSettings: FunctionComponent<Props> = ({ moduleId, displayName, schema, onClose, onSaved }) => {
  const [values, setValues] = useState<Values | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [projects, setProjects] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const base = `/api/modules/${encodeURIComponent(moduleId)}/settings`

  useEffect(() => {
    fetch(base).then(r => r.json() as Promise<Values>).then(setValues).catch(() => setValues({}))
    fetch('/api/cw/projects').then(r => r.json() as Promise<Record<string, unknown>>).then(p => setProjects(Object.keys(p))).catch(() => {})
  }, [base])

  const set = (key: string, value: unknown) => setValues(v => ({ ...v, [key]: value }))
  const setItem = (key: string, index: number, field: string, value: unknown) => setValues(v => {
    const list = [...((v?.[key] as Item[] | undefined) ?? [])]
    list[index] = { ...list[index], [field]: value }
    return { ...v, [key]: list }
  })

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) })
      if (res.status === 400) {
        const { errors: list } = await res.json() as { errors: Array<{ path: string; message: string }> }
        setErrors(Object.fromEntries(list.map(e => [e.path, e.message])))
        return
      }
      if (!res.ok) throw new Error(`Saving failed (${res.status})`)
      setErrors({})
      showToast(`${displayName} settings saved`, 'success')
      onSaved()
      onClose()
    } catch (err) {
      showToast(errorText(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer title={`${displayName} settings`} onClose={onClose}>
      {!values ? <div class="text-ink2" style={{ fontSize: '13px' }}>Loading…</div> : (
        <div class="flex flex-col" style={{ gap: '14px' }}>
          {Object.entries(schema).map(([key, def]) => {
            if (def.type !== 'list') {
              return (
                <Labeled key={key} def={{ ...def, label: def.label ?? key }} error={errors[key]} plain={plainControl(def)}>
                  <ScalarInput def={def} value={values[key]} projects={projects} onChange={(v) => set(key, v)} />
                </Labeled>
              )
            }
            const items = (values[key] as Item[] | undefined) ?? []
            return (
              <div key={key} class="flex flex-col" style={{ gap: '10px' }}>
                <span style={{ ...labelStyle, fontWeight: 600 }}>{def.label ?? key}</span>
                {def.help && <span style={labelStyle}>{def.help}</span>}
                {errors[key] && <span style={errorStyle}>{errors[key]}</span>}
                {items.map((item, i) => (
                  <div key={i} class="flex flex-col" style={{ gap: '10px', padding: '12px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--hair)' }}>
                    {Object.entries(def.item).map(([field, sub]) => (
                      <Labeled key={field} def={{ ...sub, label: sub.label ?? field }} error={errors[`${key}[${i}].${field}`]} plain={plainControl(sub)}>
                        <ScalarInput def={sub} value={item[field]} projects={projects} onChange={(v) => setItem(key, i, field, v)} />
                      </Labeled>
                    ))}
                    <div><ActionButton label="Remove" variant="danger" size="sm" onClick={() => setValues(v => ({ ...v, [key]: items.filter((_, j) => j !== i) }))} /></div>
                  </div>
                ))}
                <div><ActionButton label={`Add ${(def.label ?? key).replace(/s$/, '').toLowerCase()}`} icon="i-lucide-plus" variant="secondary" size="sm" onClick={() => set(key, [...items, {}])} /></div>
              </div>
            )
          })}
          <div class="flex" style={{ gap: '8px', marginTop: '6px' }}>
            <span class="flex-1" />
            <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
            <ActionButton label="Save" loading={saving} onClick={save} />
          </div>
        </div>
      )}
    </Drawer>
  )
}

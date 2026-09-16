import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { ActionButton, Badge } from '@forge-dev/ui'
import { soft } from '../config/types.js'

/* ── Types ── */

export type InputType = 'description' | 'figma' | 'screenshot' | 'url' | 'components'

export interface InputSelectorProps {
  onSubmit: (inputType: InputType, inputData: Record<string, unknown>) => void
  disabled?: boolean
  detection?: {
    hasTailwind?: boolean
    hasShadcn?: boolean
    hasTokens?: boolean
  } | null
}

/* ── Input type config ── */

const INPUT_TYPES: { id: InputType; label: string; description: string }[] = [
  { id: 'description', label: 'Description', description: 'Describe what to build in words' },
  { id: 'figma', label: 'Figma', description: 'Link to a frame or component' },
  { id: 'screenshot', label: 'Screenshot', description: 'Upload a design or mockup' },
  { id: 'url', label: 'URL reference', description: 'Forge captures the screenshot' },
  { id: 'components', label: 'Components', description: 'Use the project’s own components' },
]

const boxStyle = { padding: '11px 12px', borderRadius: '12px', border: '1px solid var(--hair)', background: 'var(--card)', color: 'var(--ink)', fontSize: '13px', outline: 'none', boxShadow: 'var(--shadow-s)', width: '100%' }

/* ── Dynamic input area ── */

const DynamicInput: FunctionComponent<{
  inputType: InputType
  value: string
  onChange: (val: string) => void
  dragOver: boolean
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
  droppedFile: File | null
  detection?: InputSelectorProps['detection']
}> = ({ inputType, value, onChange, dragOver, onDragOver, onDragLeave, onDrop, droppedFile, detection }) => {
  if (inputType === 'description') {
    return (
      <textarea
        value={value}
        rows={5}
        aria-label="Description"
        class="field"
        style={{ ...boxStyle, resize: 'none' }}
        placeholder="Describe the UI or feature to build…"
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
      />
    )
  }

  if (inputType === 'figma' || inputType === 'url') {
    return (
      <input
        type="url"
        value={value}
        aria-label={inputType === 'figma' ? 'Figma link' : 'Page URL'}
        class="field"
        style={boxStyle}
        placeholder={inputType === 'figma' ? 'https://www.figma.com/file/…' : 'https://example.com/page'}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
    )
  }

  if (inputType === 'screenshot') {
    return (
      <div
        class="flex flex-col items-center justify-center text-center"
        style={{
          ...boxStyle, gap: '4px', padding: '26px 14px',
          border: `2px dashed ${dragOver ? 'var(--blue)' : 'var(--hair-2)'}`,
          background: dragOver ? soft('--blue') : 'var(--card)',
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {droppedFile ? (
          <>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{droppedFile.name}</span>
            <span class="mono" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>{(droppedFile.size / 1024).toFixed(1)} KB</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{dragOver ? 'Drop to upload' : 'Drag and drop an image here'}</span>
            <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>PNG, JPG, GIF or WebP</span>
          </>
        )}
      </div>
    )
  }

  const hasAny = detection && (detection.hasTailwind || detection.hasShadcn || detection.hasTokens)
  return (
    <p style={{ ...boxStyle, color: 'var(--ink-2)', lineHeight: 1.5 }}>
      {hasAny
        ? 'Forge found components in this project. The prototype uses your design system and component library.'
        : 'No component library found in this project. Forge scaffolds components from your stack.'}
    </p>
  )
}

const CHIP_TOKENS: Record<string, string> = { Tailwind: '--teal', shadcn: '--purple', Tokens: '--orange' }

/* ── InputSelector ── */

export const InputSelector: FunctionComponent<InputSelectorProps> = ({
  onSubmit,
  disabled = false,
  detection,
}) => {
  const [selectedType, setSelectedType] = useState<InputType>('description')
  const [inputValue, setInputValue] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const generating = disabled

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type.startsWith('image/')) setDroppedFile(file)
  }

  const handleTypeChange = (type: InputType) => {
    setSelectedType(type)
    setInputValue('')
    setDroppedFile(null)
    setDragOver(false)
  }

  const handleGenerate = () => {
    if (!canSubmit) return
    const inputData: Record<string, unknown> = {}
    if (selectedType === 'screenshot' && droppedFile) inputData.file = droppedFile
    else if (selectedType === 'components') inputData.detection = detection
    else inputData.value = inputValue.trim()
    onSubmit(selectedType, inputData)
  }

  const canSubmit = !generating && (
    selectedType === 'screenshot' ? droppedFile !== null
    : selectedType === 'components' ? true
    : inputValue.trim().length > 0
  )

  const contextBadges: string[] = []
  if (detection?.hasTailwind) contextBadges.push('Tailwind')
  if (detection?.hasShadcn) contextBadges.push('shadcn')
  if (detection?.hasTokens) contextBadges.push('Tokens')

  return (
    <div class="flex flex-col" style={{ gap: '11px' }}>
      <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--ink-3)' }} id="start-from">Start from</span>
      <div class="flex flex-col" style={{ gap: '8px' }} role="radiogroup" aria-labelledby="start-from">
        {INPUT_TYPES.map((t) => {
          const on = selectedType === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              class="flex items-start text-left cursor-pointer transition-all duration-180 ease-spring hover:bg-elev disabled:cursor-not-allowed"
              style={{
                gap: '10px', padding: '10px 12px', borderRadius: '12px', color: 'var(--ink)',
                border: `1px solid ${on ? 'var(--blue)' : 'var(--hair)'}`,
                background: on ? soft('--blue') : 'var(--card)',
                boxShadow: on ? 'var(--shadow-s)' : 'none',
              }}
              onClick={() => handleTypeChange(t.id)}
              disabled={generating}
            >
              <span class="grid place-items-center shrink-0" style={{ width: '17px', height: '17px', marginTop: '1px', borderRadius: '50%', border: `2px solid ${on ? 'var(--blue)' : 'var(--ink-3)'}` }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: on ? 'var(--blue)' : 'transparent' }} />
              </span>
              <span class="flex flex-col min-w-0">
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{t.label}</span>
                <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>{t.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      <DynamicInput
        inputType={selectedType}
        value={inputValue}
        onChange={setInputValue}
        dragOver={dragOver}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        droppedFile={droppedFile}
        detection={detection}
      />

      {contextBadges.length > 0 && (
        <div class="flex flex-wrap" style={{ gap: '5px' }}>
          {contextBadges.map((label) => <Badge key={label} label={label} color={`var(${CHIP_TOKENS[label]})`} />)}
        </div>
      )}

      <ActionButton label={generating ? 'Generating…' : 'Generate'} variant="primary" block loading={generating} disabled={!canSubmit} onClick={handleGenerate} />
    </div>
  )
}

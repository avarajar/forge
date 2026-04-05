import { type FunctionComponent } from 'preact'
import { useState, useRef } from 'preact/hooks'

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
  { id: 'figma', label: 'Figma', description: 'Link to a Figma frame or component' },
  { id: 'screenshot', label: 'Screenshot', description: 'Upload a design or mockup image' },
  { id: 'url', label: 'URL Reference', description: 'Reference an existing page or site' },
  { id: 'components', label: 'Components', description: 'Use detected project components' },
]

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
        onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)}
        placeholder="Describe the UI or feature you want to build..."
        rows={6}
        class="w-full px-3 py-2.5 rounded-lg text-sm text-forge-text resize-none focus:outline-none transition-colors"
        style={{
          backgroundColor: 'var(--forge-surface)',
          border: '1px solid var(--forge-border)',
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-accent)' }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-border)' }}
      />
    )
  }

  if (inputType === 'figma') {
    return (
      <input
        type="url"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder="https://www.figma.com/file/..."
        class="w-full px-3 py-2.5 rounded-lg text-sm text-forge-text focus:outline-none transition-colors"
        style={{
          backgroundColor: 'var(--forge-surface)',
          border: '1px solid var(--forge-border)',
        }}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-accent)' }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-border)' }}
      />
    )
  }

  if (inputType === 'url') {
    return (
      <div>
        <input
          type="url"
          value={value}
          onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          placeholder="https://example.com/page"
          class="w-full px-3 py-2.5 rounded-lg text-sm text-forge-text focus:outline-none transition-colors"
          style={{
            backgroundColor: 'var(--forge-surface)',
            border: '1px solid var(--forge-border)',
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-accent)' }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--forge-border)' }}
        />
        <p class="text-xs text-forge-muted mt-2">
          Forge will capture a screenshot automatically
        </p>
      </div>
    )
  }

  if (inputType === 'screenshot') {
    return (
      <div
        class="w-full flex flex-col items-center justify-center gap-2 rounded-lg py-8 px-4 text-center transition-colors"
        style={{
          backgroundColor: dragOver ? 'var(--forge-tint-accent-bg)' : 'var(--forge-surface)',
          border: dragOver
            ? '2px dashed var(--forge-accent)'
            : '2px dashed var(--forge-border)',
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {droppedFile ? (
          <>
            <span class="text-sm font-medium text-forge-text">{droppedFile.name}</span>
            <span class="text-xs text-forge-muted">
              {(droppedFile.size / 1024).toFixed(1)} KB
            </span>
          </>
        ) : (
          <>
            <span class="text-sm font-medium text-forge-text">
              {dragOver ? 'Drop to upload' : 'Drag & drop an image here'}
            </span>
            <span class="text-xs text-forge-muted">PNG, JPG, GIF, WebP supported</span>
          </>
        )}
      </div>
    )
  }

  if (inputType === 'components') {
    const hasAny = detection && (detection.hasTailwind || detection.hasShadcn || detection.hasTokens)
    return (
      <div
        class="w-full rounded-lg px-4 py-4 text-sm"
        style={{
          backgroundColor: 'var(--forge-surface)',
          border: '1px solid var(--forge-border)',
        }}
      >
        {hasAny ? (
          <p class="text-forge-muted leading-relaxed">
            Forge detected components in your project. The generated code will use your existing
            design system and component library.
          </p>
        ) : (
          <p class="text-forge-muted leading-relaxed">
            No component library detected in this project. Forge will scaffold components from
            scratch based on your stack.
          </p>
        )}
      </div>
    )
  }

  return null
}

/* ── Context badges ── */

const ContextBadge: FunctionComponent<{ label: string }> = ({ label }) => (
  <span
    class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
    style={{
      backgroundColor: 'var(--forge-tint-accent-bg)',
      border: '1px solid var(--forge-border)',
      color: 'var(--forge-accent)',
    }}
  >
    {label}
  </span>
)

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

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setDroppedFile(file)
    }
  }

  const handleTypeChange = (type: InputType) => {
    setSelectedType(type)
    setInputValue('')
    setDroppedFile(null)
    setDragOver(false)
  }

  const handleGenerate = () => {
    if (generating) return

    const inputData: Record<string, unknown> = {}

    if (selectedType === 'screenshot' && droppedFile) {
      inputData.file = droppedFile
    } else if (selectedType === 'components') {
      inputData.detection = detection
    } else {
      inputData.value = inputValue.trim()
    }

    onSubmit(selectedType, inputData)
  }

  const canSubmit = (() => {
    if (generating) return false
    if (selectedType === 'screenshot') return droppedFile !== null
    if (selectedType === 'components') return true
    return inputValue.trim().length > 0
  })()

  const contextBadges: string[] = []
  if (detection?.hasTailwind) contextBadges.push('Tailwind')
  if (detection?.hasShadcn) contextBadges.push('shadcn')
  if (detection?.hasTokens) contextBadges.push('Tokens')

  return (
    <div class="flex flex-col gap-4">
      {/* Input type selector — vertical radio-style */}
      <div class="flex flex-col gap-1.5">
        {INPUT_TYPES.map((t) => {
          const isSelected = selectedType === t.id
          return (
            <button
              key={t.id}
              class="flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors"
              style={
                isSelected
                  ? {
                      backgroundColor: 'var(--forge-tint-accent-bg)',
                      border: '1px solid var(--forge-accent)',
                    }
                  : {
                      backgroundColor: 'var(--forge-surface)',
                      border: '1px solid var(--forge-border)',
                    }
              }
              onClick={() => handleTypeChange(t.id)}
              disabled={generating}
            >
              {/* Radio dot */}
              <span
                class="shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                style={{
                  borderColor: isSelected ? 'var(--forge-accent)' : 'var(--forge-muted)',
                }}
              >
                {isSelected && (
                  <span
                    class="w-2 h-2 rounded-full"
                    style={{ backgroundColor: 'var(--forge-accent)' }}
                  />
                )}
              </span>

              <div class="flex-1 min-w-0">
                <span
                  class="block text-sm font-medium"
                  style={{ color: isSelected ? 'var(--forge-accent)' : 'var(--forge-text)' }}
                >
                  {t.label}
                </span>
                <span class="block text-xs text-forge-muted mt-0.5">{t.description}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Dynamic input area */}
      <DynamicInput
        inputType={selectedType}
        value={inputValue}
        onChange={setInputValue}
        dragOver={dragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        droppedFile={droppedFile}
        detection={detection}
      />

      {/* Context badges */}
      {contextBadges.length > 0 && (
        <div class="flex flex-wrap gap-1.5">
          {contextBadges.map((label) => (
            <ContextBadge key={label} label={label} />
          ))}
        </div>
      )}

      {/* Generate button */}
      <button
        class="w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        style={{
          backgroundColor: canSubmit ? 'var(--forge-accent)' : 'var(--forge-surface)',
          color: canSubmit ? '#fff' : 'var(--forge-muted)',
          border: '1px solid var(--forge-border)',
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: generating ? 0.7 : 1,
        }}
        onClick={handleGenerate}
        disabled={!canSubmit}
      >
        {generating ? 'Generating...' : 'Generate'}
      </button>
    </div>
  )
}

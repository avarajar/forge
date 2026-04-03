import { type FunctionComponent } from 'preact'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export const ToggleSwitch: FunctionComponent<ToggleSwitchProps> = ({
  checked, onChange, label, disabled
}) => {
  return (
    <label class={`inline-flex items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        class={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors
          ${checked ? 'bg-forge-success' : 'bg-forge-border'}`}
        onClick={() => !disabled && onChange(!checked)}
      >
        <span
          class={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform
            ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
      {label && <span class="text-sm text-forge-text">{label}</span>}
    </label>
  )
}

import { type FunctionComponent } from 'preact'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export const ToggleSwitch: FunctionComponent<ToggleSwitchProps> = ({
  checked, onChange, label, disabled
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    class={`relative shrink-0 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    style={{
      width: '44px', height: '26px', borderRadius: '99px', border: 0,
      background: checked ? 'var(--green)' : 'var(--hair-2)',
      transition: 'background .22s var(--ease)',
    }}
    onClick={() => !disabled && onChange(!checked)}
  >
    <span
      class="absolute pointer-events-none"
      style={{
        top: '3px', left: checked ? '21px' : '3px', width: '20px', height: '20px', borderRadius: '50%',
        background: '#fff', boxShadow: 'var(--shadow-s)', transition: 'left .22s var(--ease)',
      }}
    />
  </button>
)

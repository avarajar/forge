import { type FunctionComponent } from 'preact'
import type { CWDoctor, CWDoctorCell } from '@forge-dev/core'
import { findCell, getHarnessStyle } from '../config/types.js'

export const harnessUnavailableReason = (harness: string, cell: CWDoctorCell | undefined, isLoop: boolean): string | null => {
  if (isLoop && harness !== 'claude') return "Loop uses Claude Code's /loop"
  if (cell?.status === 'not_installed') return typeof cell.detail === 'string' ? cell.detail : 'Not installed'
  return null
}

interface HarnessPickerProps {
  doctor: CWDoctor
  account: string
  value: string
  defaultHarness: string
  isLoop: boolean
  onChange: (harness: string) => void
  onOpenAccounts?: () => void
}

export const HarnessPicker: FunctionComponent<HarnessPickerProps> = ({
  doctor, account, value, defaultHarness, isLoop, onChange, onOpenAccounts,
}) => (
  <div class="mb-4">
    <label class="block text-sm font-medium mb-1">
      Harness <span class="font-normal text-forge-muted">who runs the session</span>
    </label>
    <div class="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
      {doctor.harnesses.map(h => {
        const cell = findCell(doctor, account, h.name)
        const reason = harnessUnavailableReason(h.name, cell, isLoop)
        const style = getHarnessStyle(h.name)
        const selected = value === h.name
        const notLoggedIn = cell?.status === 'not_logged_in'
        const detail = reason
          ?? (notLoggedIn ? 'not logged in' : null)
          ?? (cell?.status === 'error' && typeof cell.detail === 'string' ? cell.detail : null)
          ?? (h.name === defaultHarness ? 'account default' : h.version ?? '')
        return (
          <div
            key={h.name}
            role="button"
            tabIndex={reason ? -1 : 0}
            aria-disabled={Boolean(reason)}
            class={`flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              reason ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={selected
              ? { backgroundColor: 'var(--forge-tint-accent-bg)', border: '1px solid var(--forge-accent)' }
              : { backgroundColor: 'var(--forge-surface)', border: '1px solid var(--forge-ghost-border)' }}
            onClick={() => { if (!reason) onChange(h.name) }}
            onKeyDown={(e: KeyboardEvent) => { if (!reason && (e.key === 'Enter' || e.key === ' ')) onChange(h.name) }}
          >
            <span class="flex items-center gap-1.5 font-semibold text-forge-text">
              <span class="w-2 h-2 rounded-full" style={{ backgroundColor: style.color }} />
              {style.label}
            </span>
            <span class="text-[11px] text-forge-muted truncate max-w-full" title={detail}>{detail}</span>
            {notLoggedIn && onOpenAccounts && (
              <button
                type="button"
                class="text-[11px] text-forge-accent underline"
                onClick={(e: Event) => { e.stopPropagation(); onOpenAccounts() }}
                onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
              >
                Connect
              </button>
            )}
          </div>
        )
      })}
    </div>
    <div class="text-xs text-forge-muted mt-1">
      For this task only. An account's default harness is set when the account is created.
    </div>
  </div>
)

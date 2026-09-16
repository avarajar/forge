import { type FunctionComponent } from 'preact'
import type { CWDoctor, CWDoctorCell } from '@forge-dev/core'
import { findCell, getHarnessStyle } from '../config/types.js'

export const harnessUnavailableReason = (harness: string, cell: CWDoctorCell | undefined, isLoop: boolean): string | null => {
  if (isLoop && harness !== 'claude') return "Loop uses Claude Code's /loop"
  if (cell?.status === 'not_installed') return typeof cell.detail === 'string' && cell.detail ? cell.detail : 'Not installed'
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

const cellDetail = (doctor: CWDoctor, name: string, cell: CWDoctorCell | undefined, isDefault: boolean, reason: string | null): string => {
  if (reason) return reason
  if (cell?.status === 'not_logged_in') return 'Not logged in'
  if (cell?.status === 'error' && typeof cell.detail === 'string') return cell.detail
  const version = doctor.harnesses.find(h => h.name === name)?.version
  const model = cell?.model
  return [isDefault ? 'Default' : version, model].filter(Boolean).join(' · ') || (isDefault ? 'Default' : '')
}

export const HarnessPicker: FunctionComponent<HarnessPickerProps> = ({
  doctor, account, value, defaultHarness, isLoop, onChange, onOpenAccounts,
}) => (
  <div class="flex flex-col" style={{ gap: '6px' }} role="radiogroup" aria-label="Harness">
    <span style={{ fontSize: '12px', color: 'var(--ink-2)' }}>Harness · this task only</span>
    <div class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
      {doctor.harnesses.map(h => {
        const cell = findCell(doctor, account, h.name)
        const reason = harnessUnavailableReason(h.name, cell, isLoop)
        const style = getHarnessStyle(h.name)
        const selected = value === h.name
        const notLoggedIn = cell?.status === 'not_logged_in'
        const detail = cellDetail(doctor, h.name, cell, h.name === defaultHarness, reason)
        return (
          <div
            key={h.name}
            role="radio"
            aria-checked={selected}
            tabIndex={reason ? -1 : 0}
            aria-disabled={Boolean(reason)}
            title={reason ?? undefined}
            class={`flex items-start transition-all duration-180 ease-spring ${reason ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-elev'}`}
            style={{
              gap: '9px', padding: '10px 11px', borderRadius: '12px',
              border: `1px solid ${selected ? 'var(--blue)' : 'var(--hair)'}`,
              background: selected ? 'color-mix(in srgb, var(--blue) 18%, transparent)' : 'var(--card)',
              boxShadow: selected ? 'var(--shadow-s)' : 'none',
              opacity: reason ? 0.45 : 1,
            }}
            onClick={() => { if (!reason) onChange(h.name) }}
            onKeyDown={(e: KeyboardEvent) => { if (!reason && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onChange(h.name) } }}
          >
            <span class="shrink-0" style={{ width: '8px', height: '8px', borderRadius: '50%', marginTop: '5px', background: style.color, boxShadow: selected ? `0 0 8px ${style.color}` : 'none' }} />
            <span class="flex flex-col min-w-0">
              <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{style.label}</span>
              <span class="truncate" style={{ fontSize: '11.5px', color: 'var(--ink-2)' }} title={detail}>{detail}</span>
              {notLoggedIn && onOpenAccounts && (
                <button
                  type="button"
                  class="self-start cursor-pointer"
                  style={{ border: 0, background: 'none', padding: 0, color: 'var(--blue)', fontSize: '11.5px', fontWeight: 600 }}
                  onClick={(e: Event) => { e.stopPropagation(); onOpenAccounts() }}
                  onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
                >
                  Connect
                </button>
              )}
            </span>
          </div>
        )
      })}
    </div>
  </div>
)

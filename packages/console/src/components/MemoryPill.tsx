import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { tierToken } from '../config/types.js'
import { brainName, sumPages, useKiokuChain } from '../hooks/useKioku.js'
import { Dot } from './Dot.js'

// a dot per brain the session loads; the list shows on hover, in a portal since the card's animation would clip it
export const MemoryPill: FunctionComponent<{ project: string }> = ({ project }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const chain = useKiokuChain(project)
  if (chain.length === 0) return null

  return (
    <span
      class="inline-flex items-center shrink-0 whitespace-nowrap"
      style={{ gap: '6px', padding: '3px 9px', borderRadius: '99px', background: 'var(--elev)', border: '1px solid var(--hair)', color: 'var(--ink-2)', fontSize: '11.5px', fontWeight: 600 }}
      aria-label={`Memory: ${chain.map(brainName).join(', ')}`}
      onMouseEnter={(e) => setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      <span class="inline-flex">
        {chain.map((b, i) => (
          <span key={b.key} style={{ width: '9px', height: '9px', borderRadius: '50%', background: `var(${tierToken(b.tier)})`, border: '2px solid var(--card)', marginLeft: i === 0 ? 0 : '-4px' }} />
        ))}
      </span>
      <span class="mono">{sumPages(chain)}</span>
      {anchor && createPortal(
        <span
          class="flex flex-col"
          style={{ position: 'fixed', top: `${anchor.bottom + 8}px`, right: `${window.innerWidth - anchor.right}px`, zIndex: 50, width: '240px', gap: '6px', padding: '10px 12px', borderRadius: '12px', background: 'var(--card-2)', border: '1px solid var(--hair-2)', boxShadow: 'var(--shadow-l)', animation: 'riseIn .2s var(--ease) both' }}
        >
          <span style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: '.03em', color: 'var(--ink-3)' }}>THIS SESSION REMEMBERS</span>
          {chain.map(b => (
            <span key={b.key} class="flex items-center" style={{ gap: '7px', fontSize: '12px', color: 'var(--ink)', fontWeight: 500 }}>
              <Dot color={`var(${tierToken(b.tier)})`} />
              {brainName(b)}
              <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>{b.tier}</span>
              <span class="flex-1" />
              <span class="mono" style={{ color: 'var(--ink-2)' }}>{b.pages}</span>
            </span>
          ))}
        </span>,
        document.body,
      )}
    </span>
  )
}

import { useEffect, useState } from 'preact/hooks'
import { ActionButton, EmptyState } from '@forge-dev/ui'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { CAPPED_NOTE, countFor, failedLine, filterNews, filterPending, FIRST_READING_NOTE, GITHUB_SEARCH, groupPending, groupProblems, isGroupFolded, loadFailedLine, newsList, NO_FILTERS, notesLine, PENDING_EMPTY, type SourceName } from './ops'
import { accountToken, dayName, Pill, PendingRow, ProblemRow, readLine, ReadingLine, Row, SkeletonRows, useActing, useDigest, useFilters, useFolds, useProjects, useReadingStyles } from './rows'

const heading = { margin: 0, fontSize: '13px', fontWeight: 650, letterSpacing: '-.01em' }
const muted = { fontSize: '12.5px', color: 'var(--ink-2)', padding: '4px 6px' }
const SOURCES: { id: SourceName; label: string }[] = [{ id: 'linear', label: 'Linear' }, { id: 'slack', label: 'Slack' }, { id: 'github', label: 'GitHub' }]

function View({ forge }: PanelProps) {
  useReadingStyles()
  const [days, setDays] = useState<string[]>([])
  const [day, setDay] = useState<string | null>(null)
  const { reply, error, reload, hurry } = useDigest(forge, day ? `/digest/${day}` : '/digest')
  const projects = useProjects(forge)
  const [filters, setFilters] = useFilters()
  const [folds, setFold] = useFolds()
  const digest = reply?.digest
  const acting = useActing(forge, digest?.date, reload, hurry)
  const reading = reply?.reading
  const isReading = acting.refreshing || !!reading
  const [details, setDetails] = useState(false)
  const problems = groupProblems(digest?.problems ?? [])
  const notes = notesLine(digest?.notes)
  const enabled = reply?.enabled === true
  const allNews = newsList(digest?.items ?? [])
  const allPending = reply?.pending ?? []
  const everything = [...allNews, ...allPending]
  const accounts = [...new Set(everything.flatMap(x => (x.account ? [x.account] : [])))]
  const present = SOURCES.filter(s => everything.some(x => x.source === s.id))
  // a filter on an account or source that has nothing at all is not applied
  const active = { ...filters, account: accounts.includes(filters.account) ? filters.account : '', source: present.some(s => s.id === filters.source) ? filters.source : '' }
  const counts = countFor(allNews, allPending, active)
  const news = filterNews(allNews, active)
  const pending = filterPending(allPending, active)
  const searching = active.query.trim() !== ''
  const filtered = active.account !== '' || active.source !== '' || searching
  const set = (next: Partial<typeof filters>) => setFilters({ ...filters, ...next })

  useEffect(() => {
    forge.route<{ days: string[] }>('/days').then(r => setDays(r.days), () => {})
  }, [forge, digest?.readAt])

  return (
    <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '1280px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {days.length > 0 && (
          <select aria-label="Day" value={digest?.date ?? ''} onChange={e => setDay((e.target as HTMLSelectElement).value)} style={{ font: 'inherit', fontSize: '12.5px', padding: '5px 8px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--card)', color: 'var(--ink)' }}>
            {days.map(d => <option key={d} value={d}>{dayName(d)}</option>)}
          </select>
        )}
        <b style={{ fontSize: '14px', fontWeight: 650 }}>Today{digest ? ` · ${dayName(digest.date)}` : ''}</b>
        <input type="search" aria-label="Search" placeholder="Search…" value={filters.query} onInput={e => set({ query: (e.target as HTMLInputElement).value })} style={{ font: 'inherit', fontSize: '12.5px', padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--card)', color: 'var(--ink)', minWidth: '180px', marginLeft: 'auto' }} />
        <span style={{ display: 'flex', gap: '8px' }}>
          {enabled && <ActionButton label={isReading ? 'Reading…' : 'Refresh'} variant="primary" size="sm" disabled={isReading} loading={isReading} onClick={acting.refresh} />}
          {reply && <ActionButton label={enabled ? 'Turn off' : 'Turn on'} variant={enabled ? 'secondary' : 'primary'} size="sm" disabled={acting.busy} onClick={() => acting.run(() => forge.action(enabled ? 'disable' : 'enable'))} />}
        </span>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--ink-2)' }}>
        {isReading ? <ReadingLine reading={reading} /> : digest ? readLine(digest) : 'Not read yet'}
      </div>

      {reply && !enabled && (
        <div style={{ padding: '12px 14px', borderRadius: '10px', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--ink-2)', background: 'var(--card)', border: '1px solid var(--hair)', maxWidth: '640px' }}>
          Today is off. Turned on, it reads your Linear, Slack and GitHub each morning and whenever you press Refresh. Each reading spends your account's usage. Research it proposes can start sessions on its own, a few a day.
        </div>
      )}

      {(error || digest?.error) && (
        <div style={{ padding: '8px 12px', borderRadius: '10px', fontSize: '12px', color: 'var(--red)', background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--red) 45%, var(--hair))' }}>
          {error ? loadFailedLine(error) : failedLine(digest!.error!)}
        </div>
      )}

      {problems.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {problems.map(g => <ProblemRow key={g.account} group={g} acting={acting} details={details} />)}
          <button type="button" aria-expanded={details} onClick={() => setDetails(!details)} style={{ alignSelf: 'flex-start', font: 'inherit', fontSize: '11.5px', padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>{details ? 'Hide details' : 'Details'}</button>
        </div>
      )}

      {notes && <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{notes}</div>}

      {!digest && isReading ? (
        <SkeletonRows />
      ) : !digest ? (
        <EmptyState title="Nothing to show" description={enabled ? 'Today reads your Linear, Slack and GitHub once a day. Use Refresh to read them now.' : 'Turn Today on to read your Linear, Slack and GitHub.'} />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {accounts.length > 1 && (
              <div role="group" aria-label="Account" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--ink-3)', minWidth: '52px' }}>Account</span>
                <Pill label="All" n={counts.total} on={!active.account} onClick={() => set({ account: '' })} />
                {accounts.map(a => <Pill key={a} label={a} token={accountToken(a)} n={counts.accounts[a] ?? 0} on={active.account === a} onClick={() => set({ account: a })} />)}
              </div>
            )}
            <div role="group" aria-label="Source" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--ink-3)', minWidth: '52px' }}>Source</span>
              <Pill label="All" n={counts.sources.linear + counts.sources.slack + counts.sources.github} on={!active.source} onClick={() => set({ source: '' })} />
              {present.map(s => <Pill key={s.id} label={s.label} n={counts.sources[s.id]} on={active.source === s.id} onClick={() => set({ source: s.id })} />)}
              {filtered && <button type="button" onClick={() => setFilters(NO_FILTERS)} style={{ font: 'inherit', fontSize: '11.5px', padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>Clear</button>}
            </div>
          </div>

          <div class="today-cols">
            <section style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <h3 style={{ ...heading, marginBottom: '4px' }}>News · {news.length}</h3>
              {news.length === 0 && <div style={muted}>{filtered && allNews.length > 0 ? 'No news matches.' : reply?.firstReading ? FIRST_READING_NOTE : 'Nothing new.'}</div>}
              {news.map(i => <Row key={i.id} item={i} projects={projects} acting={acting} forge={forge} />)}
            </section>
            <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={heading}>Pending · {pending.length}{reply?.pendingCapped && <span style={{ fontWeight: 400, fontSize: '11.5px', color: 'var(--ink-3)' }}> · {CAPPED_NOTE} — <a href={GITHUB_SEARCH} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>see GitHub</a></span>}</h3>
              {pending.length === 0 && <div style={muted}>{filtered && allPending.length > 0 ? 'No pending matches.' : PENDING_EMPTY}</div>}
              {groupPending(pending).map(g => {
                // a search shows the matches, so no group stays folded
                const folded = !searching && isGroupFolded(g, folds)
                return (
                  <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button type="button" aria-expanded={!folded} onClick={() => setFold(g.id, !folded)} style={{ alignSelf: 'flex-start', font: 'inherit', fontSize: '11px', fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', padding: '2px 0', border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>
                      {folded ? '▸' : '▾'} {g.title} · {g.items.length}
                    </button>
                    {!folded && g.items.map(p => <PendingRow key={p.id} item={p} projects={projects} acting={acting} forge={forge} />)}
                  </div>
                )
              })}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

export default definePanel({ id: 'main', title: 'Today', component: View })

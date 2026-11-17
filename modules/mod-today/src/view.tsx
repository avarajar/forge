import { useEffect, useRef, useState } from 'preact/hooks'
import { ActionButton, EmptyState } from '@forge-dev/ui'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { acceptable, CAPPED_NOTE, countFor, failedLine, filterNews, filterPending, FIRST_READING_NOTE, GITHUB_SEARCH, groupProblems, inboxGroups, loadFailedLine, newsList, NO_ACCOUNT, NO_FILTERS, PENDING_EMPTY, type SourceName } from './ops'
import { Inbox } from './inbox'
import { Triage } from './triage'
import { accountToken, Btn, dayName, Pill, Notes, primaryStyle, ProblemRow, readLine, ReadingLine, SkeletonRows, takeStartDay, useActing, useDigest, useFilters, useFolds, useLastSeen, useProjects, useReadingStyles, useTriage } from './rows'

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
  const enabled = reply?.enabled === true
  const allNews = newsList(digest?.items ?? [])
  const allPending = reply?.pending ?? []
  const everything = [...allNews, ...allPending]
  const accounts = [...new Set(everything.flatMap(x => (x.account ? [x.account] : [])))]
  const present = SOURCES.filter(s => everything.some(x => x.source === s.id))
  const hasNone = everything.some(x => !x.account)
  // a filter on an account or source that has nothing at all is not applied
  const active = { ...filters, account: accounts.includes(filters.account) || (hasNone && filters.account === NO_ACCOUNT) ? filters.account : '', source: present.some(s => s.id === filters.source) ? filters.source : '' }
  const counts = countFor(allNews, allPending, active)
  const news = filterNews(allNews, active)
  // what Accept would start or send: the news in view that has what it needs
  const ready = acceptable(news)
  const pending = filterPending(allPending, active)
  const searching = active.query.trim() !== ''
  const filtered = active.account !== '' || active.source !== '' || searching
  const set = (next: Partial<typeof filters>) => setFilters({ ...filters, ...next })
  const groups = inboxGroups(news, pending)
  const lastSeen = useLastSeen()
  const search = useRef<HTMLInputElement>(null)
  // the triage sees everything, whatever the filters
  const allGroups = inboxGroups(allNews, allPending)
  const [triage, setTriage] = useState(() => takeStartDay())
  const [decided, decide, resetDecisions] = useTriage(digest?.date)
  const toSort = allGroups.filter(g => g.id === 'needs' || g.id === 'progress').reduce((n, g) => n + g.entries.length, 0)

  useEffect(() => {
    forge.route<{ days: string[] }>('/days').then(r => setDays(r.days), () => {})
  }, [forge, digest?.readAt])

  return (
    <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '1280px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <b style={{ fontSize: '14px', fontWeight: 650, display: 'flex', alignItems: 'center', gap: '8px' }}>
          Today
          {digest && days.length > 0 ? (
            <>
              <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>·</span>
              <select aria-label="Day" value={digest.date} onChange={e => setDay((e.target as HTMLSelectElement).value)} style={{ font: 'inherit', fontSize: '13px', fontWeight: 600, padding: '4px 8px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--card)', color: 'var(--ink)' }}>
                {days.map(d => <option key={d} value={d}>{dayName(d)}</option>)}
              </select>
            </>
          ) : digest ? ` · ${dayName(digest.date)}` : null}
        </b>
        <span style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          {enabled && digest && toSort > 0 && <ActionButton label="Start the day" variant="secondary" size="sm" onClick={() => setTriage(true)} />}
          {enabled && <ActionButton label={isReading ? 'Reading…' : 'Refresh'} variant="primary" size="sm" disabled={isReading} loading={isReading} onClick={acting.refresh} />}
          {reply && <ActionButton label={enabled ? 'Turn off' : 'Turn on'} variant={enabled ? 'secondary' : 'primary'} size="sm" disabled={acting.busy} onClick={async () => { await acting.run(() => forge.action(enabled ? 'disable' : 'enable')) }} />}
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

      <Notes notes={digest?.notes} />

      {!digest && isReading ? (
        <SkeletonRows />
      ) : !digest ? (
        <EmptyState title="Nothing to show" description={enabled ? 'Today reads your Linear, Slack and GitHub once a day. Use Refresh to read them now.' : 'Turn Today on to read your Linear, Slack and GitHub.'} />
      ) : (
        <>
          <Inbox
            forge={forge}
            groups={groups}
            folds={folds}
            setFold={setFold}
            searching={searching}
            projects={projects}
            acting={acting}
            lastSeen={lastSeen}
            keys={!triage}
            focusSearch={() => search.current?.focus()}
            clearSearch={() => { set({ query: '' }); search.current?.blur() }}
            empty={filtered && everything.length > 0 ? 'Nothing matches.' : reply?.firstReading ? FIRST_READING_NOTE : PENDING_EMPTY}
            footer={reply?.pendingCapped ? <div style={{ fontSize: '11.5px', color: 'var(--ink-3)', padding: '8px 12px' }}>{CAPPED_NOTE} — <a href={GITHUB_SEARCH} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>see GitHub</a></div> : null}
            header={
              <>
                <input ref={search} type="search" aria-label="Search" placeholder="Search…  ⌘F" value={filters.query} onInput={e => set({ query: (e.target as HTMLInputElement).value })} style={{ font: 'inherit', fontSize: '12.5px', padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--hair-2)', background: 'var(--elev)', color: 'var(--ink)', width: '100%', boxSizing: 'border-box' }} />
                {(accounts.length > 1 || (accounts.length > 0 && hasNone)) && (
                  <div role="group" aria-label="Account" style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <Pill label="All" n={counts.total} on={!active.account} onClick={() => set({ account: '' })} />
                    {accounts.map(a => <Pill key={a} label={a} token={accountToken(a)} n={counts.accounts[a] ?? 0} on={active.account === a} onClick={() => set({ account: a })} />)}
                    {hasNone && <Pill label="No account" n={counts.noAccount} on={active.account === NO_ACCOUNT} onClick={() => set({ account: NO_ACCOUNT })} />}
                  </div>
                )}
                <div role="group" aria-label="Source" style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  <Pill label="All" n={counts.sources.linear + counts.sources.slack + counts.sources.github} on={!active.source} onClick={() => set({ source: '' })} />
                  {present.map(s => <Pill key={s.id} label={s.label} n={counts.sources[s.id]} on={active.source === s.id} onClick={() => set({ source: s.id })} />)}
                  {filtered && <button type="button" onClick={() => setFilters(NO_FILTERS)} style={{ font: 'inherit', fontSize: '11.5px', padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>Clear</button>}
                </div>
                {ready.length > 0 && digest && <Btn label={`Accept ${ready.length === 1 ? 'it' : `the ${ready.length}`}`} style={primaryStyle} disabled={acting.busy} onClick={() => acting.run(() => forge.action('accept-all', { date: digest.date, ids: ready.map(i => i.id).join(',') }))} />}
              </>
            }
          />
        </>
      )}
      {triage && digest && <Triage forge={forge} groups={allGroups} done={decided} decide={decide} reset={resetDecisions} projects={projects} acting={acting} onClose={() => setTriage(false)} />}
    </div>
  )
}

export default definePanel({ id: 'main', title: 'Today', component: View })

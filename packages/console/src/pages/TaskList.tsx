import { type FunctionComponent } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import { ActionButton, Tabs } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { QUICK_TYPES, getHarnessStyle, pageCard, projectOf, quickLabel, sessionKey, type QuickType } from '../config/types.js'
import { TaskRow, DoneRow } from '../components/TaskCard.js'
import { ProjectBanner } from '../components/ProjectBanner.js'
import { StartCard, type ProjectMap } from '../components/StartCard.js'
import { ModuleBanners } from '../components/ModuleBanners.js'
import { PageHeader } from '../components/PageHeader.js'
import { Dot } from '../components/Dot.js'
import { HarnessBadge } from '../components/HarnessBadge.js'
import { stackParts, useProjectStack } from '../hooks/useProjectStack.js'

interface TaskListProps {
  spaces: CWSession[]
  allSpaces: CWSession[]
  projects: ProjectMap
  accountNames: string[]
  filterAccount: string | null
  filterProject: string | null
  onFilterProject: (p: string | null) => void
  filterType: QuickType | null
  onFilterType: (t: QuickType | null) => void
  harnessNames: string[]
  filterHarness: string | null
  onFilterHarness: (h: string | null) => void
  showDone: boolean
  onShowDone: (v: boolean) => void
  openTabKeys: Set<string>
  onSelectTask: (session: CWSession) => void
  onMarkDone: (session: CWSession) => void | Promise<void>
  onNewTask: () => void
  onCreateProject: () => void
  onRefresh: () => void
  onStarted: (session?: CWSession) => void
}

const DONE_LIMIT = 10
const LAYOUT_KEY = 'forge-task-layout'

type Layout = 'recent' | 'project'

const readLayout = (): Layout => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'project' ? 'project' : 'recent'
  } catch {
    return 'recent'
  }
}

const listCard = { ...pageCard, overflow: 'hidden' }
const listHeader = { padding: '11px 15px', boxShadow: 'inset 0 -1px 0 var(--hair-soft)' }

// the harness most of a card's tasks run on; ties go to the first one seen
const commonHarness = (list: CWSession[]): string => {
  const counts = new Map<string, number>()
  for (const s of list) {
    const h = s.harness ?? 'claude'
    counts.set(h, (counts.get(h) ?? 0) + 1)
  }
  let best = 'claude'
  let top = 0
  for (const [h, n] of counts) if (n > top) { best = h; top = n }
  return best
}

// names the common harness once in the header, only when more than one harness is in play
const DefaultHarness: FunctionComponent<{ harness: string; sessions: CWSession[]; harnessNames: string[] }> = ({ harness, sessions, harnessNames }) =>
  harnessNames.length > 1 || sessions.some(s => (s.harness ?? 'claude') !== harness)
    ? (
      <>
        <HarnessBadge quiet session={{ harness }} />
        <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>by default</span>
      </>
    )
    : null

const GroupCard: FunctionComponent<{
  project: string
  account: string
  sessions: CWSession[]
  index: number
  harnessNames: string[]
  openTabKeys: Set<string>
  onSelectTask: (session: CWSession) => void
  onMarkDone: (session: CWSession) => void | Promise<void>
}> = ({ project, account, sessions, index, harnessNames, openTabKeys, onSelectTask, onMarkDone }) => {
  const stack = stackParts(useProjectStack(project))
  const def = commonHarness(sessions)
  const live = sessions.some(s => openTabKeys.has(sessionKey(s)))
  return (
    <section style={{ ...listCard, animation: `riseIn .4s var(--ease) ${index * 70}ms both` }} aria-label={project || 'No project'}>
      <div class="flex items-center flex-wrap" style={{ ...listHeader, gap: '10px' }}>
        <Dot size={9} live={live} />
        <span style={{ fontSize: '14px', fontWeight: 650, letterSpacing: '-0.01em' }}>{project || 'No project'}</span>
        <span class="truncate" style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>{[account, stack.join(' · ')].filter(Boolean).join(' · ')}</span>
        <span class="flex-1" />
        <DefaultHarness harness={def} sessions={sessions} harnessNames={harnessNames} />
        <span class="mono num" style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{sessions.length} task{sessions.length === 1 ? '' : 's'}</span>
      </div>
      {sessions.map(s => (
        <TaskRow
          key={sessionKey(s)}
          session={s}
          defaultHarness={def}
          isOpenInTab={openTabKeys.has(sessionKey(s))}
          onSelect={() => onSelectTask(s)}
          onMarkDone={s.type === 'login' ? undefined : () => onMarkDone(s)}
        />
      ))}
    </section>
  )
}

export const TaskList: FunctionComponent<TaskListProps> = ({
  spaces, allSpaces, projects, accountNames, filterAccount, filterProject, onFilterProject,
  filterType, onFilterType, harnessNames, filterHarness, onFilterHarness, showDone, onShowDone,
  openTabKeys, onSelectTask, onMarkDone, onNewTask, onCreateProject, onRefresh, onStarted,
}) => {
  const [layout, setLayout] = useState<Layout>(readLayout)
  const changeLayout = (next: Layout) => {
    setLayout(next)
    try { localStorage.setItem(LAYOUT_KEY, next) } catch {}
  }

  // spaces arrive most recently opened first
  const active = useMemo(() => spaces.filter(s => s.status === 'active'), [spaces])
  const done = useMemo(() => spaces.filter(s => s.status === 'done'), [spaces])

  const totalActive = useMemo(() => allSpaces.filter(s => s.status === 'active').length, [allSpaces])
  const totalDone = useMemo(() => allSpaces.filter(s => s.status === 'done').length, [allSpaces])
  const working = useMemo(() => allSpaces.filter(s => s.status === 'active' && openTabKeys.has(sessionKey(s))).length, [allSpaces, openTabKeys])

  // counts ignore the type filter so every segment shows what it would reveal
  const scoped = useMemo(() => allSpaces.filter(s =>
    s.status === 'active'
    && (!filterAccount || s.account === filterAccount)
    && (!filterProject || s.project === filterProject)
    && (!filterHarness || (s.harness ?? 'claude') === filterHarness)
  ), [allSpaces, filterAccount, filterProject, filterHarness])

  const groups = useMemo(() => {
    const byProject = new Map<string, CWSession[]>()
    for (const s of active) {
      const key = projectOf(s)
      const list = byProject.get(key) ?? []
      list.push(s)
      byProject.set(key, list)
    }
    return Array.from(byProject, ([project, sessions]) => ({ project, sessions }))
  }, [active])

  const recentHarness = useMemo(() => commonHarness(active), [active])

  const projectAccount = filterProject ? projects[filterProject]?.account ?? active[0]?.account : undefined

  const subtitle = filterProject
    ? `${projectAccount ? `${projectAccount} · ` : ''}${scoped.length} active`
    : `${totalActive} active · ${totalDone} done · ${working} agent${working === 1 ? '' : 's'} working`

  return (
    <>
      <PageHeader title={filterProject ?? 'Tasks'} subtitle={subtitle}>
        <ActionButton label="Add project" variant="secondary" onClick={onCreateProject} />
        <ActionButton label="New task" variant="primary" onClick={onNewTask} />
      </PageHeader>

      <div class="flex flex-col w-full" style={{ padding: '18px 22px 40px', gap: '16px', maxWidth: '1180px' }}>
        <ModuleBanners />
        <StartCard projects={projects} accounts={accountNames} onStarted={onStarted} onOpenDrawer={onNewTask} />

        <div class="flex items-center flex-wrap" style={{ gap: '10px' }}>
          <Tabs
            label="Filter by type"
            tabs={[
              { id: 'all', label: 'All', count: scoped.length },
              ...QUICK_TYPES.map(t => ({ id: t.key, label: quickLabel(t.key), count: scoped.filter(s => s.type === t.sessionType).length })),
            ]}
            active={filterType ?? 'all'}
            onChange={(id) => onFilterType(id === 'all' ? null : id as QuickType)}
          />
          {harnessNames.length > 1 && (
            <select
              class="cursor-pointer bg-transparent hover:bg-elev transition-colors duration-160"
              aria-label="Filter by harness"
              value={filterHarness ?? 'all'}
              onChange={(e) => { const v = (e.target as HTMLSelectElement).value; onFilterHarness(v === 'all' ? null : v) }}
              style={{ height: '30px', padding: '0 26px 0 10px', borderRadius: 'var(--r-sm)', border: 0, color: 'var(--ink-2)', fontSize: '12.5px', fontWeight: 500 }}
            >
              <option value="all">Any harness</option>
              {harnessNames.map(h => <option key={h} value={h}>{getHarnessStyle(h).label}</option>)}
            </select>
          )}
          <span class="flex-1" />
          <button
            type="button"
            aria-pressed={showDone}
            class={`cursor-pointer transition-all duration-180 ease-spring${showDone ? '' : ' bg-transparent hover:bg-elev'}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 10px', borderRadius: 'var(--r-sm)', border: 0, background: showDone ? 'var(--card)' : undefined, boxShadow: showDone ? 'var(--shadow-s)' : 'none', color: showDone ? 'var(--ink)' : 'var(--ink-2)', fontSize: '12.5px', fontWeight: 500 }}
            onClick={() => onShowDone(!showDone)}
          >
            <span class={showDone ? 'i-lucide-square-check' : 'i-lucide-square'} aria-hidden="true" style={{ width: '13px', height: '13px' }} />
            Done
          </button>
          {!filterProject && (
            <Tabs
              size="xs"
              label="Order tasks"
              tabs={[{ id: 'recent', label: 'Recent', icon: 'i-lucide-clock' }, { id: 'project', label: 'By project', icon: 'i-lucide-folder' }]}
              active={layout}
              onChange={(id) => changeLayout(id === 'project' ? 'project' : 'recent')}
            />
          )}
        </div>

        {filterProject && (
          <ProjectBanner
            project={filterProject}
            account={projectAccount}
            accounts={accountNames}
            onDeleted={() => { onFilterProject(null); onRefresh() }}
            onMoved={onRefresh}
          />
        )}

        {layout === 'recent' && !filterProject && active.length > 0 && (
          <section style={{ ...listCard, animation: 'riseIn .4s var(--ease) both' }} aria-label="Recently opened">
            <div class="flex items-center" style={{ ...listHeader, gap: '10px' }}>
              <span class="i-lucide-clock shrink-0" style={{ width: '14px', height: '14px', color: 'var(--ink-2)' }} />
              <span style={{ fontSize: '14px', fontWeight: 650, letterSpacing: '-0.01em' }}>Recently opened</span>
              <span class="flex-1" />
              <DefaultHarness harness={recentHarness} sessions={active} harnessNames={harnessNames} />
              <span class="mono num" style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{active.length} task{active.length === 1 ? '' : 's'}</span>
            </div>
            {active.map(s => (
              <TaskRow
                key={sessionKey(s)}
                session={s}
                defaultHarness={recentHarness}
                showProject
                isOpenInTab={openTabKeys.has(sessionKey(s))}
                onSelect={() => onSelectTask(s)}
                onMarkDone={s.type === 'login' ? undefined : () => onMarkDone(s)}
              />
            ))}
          </section>
        )}

        {(layout === 'project' || filterProject) && groups.map((g, i) => (
          <GroupCard
            key={g.project}
            project={g.project}
            account={projects[g.project]?.account ?? g.sessions[0].account}
            sessions={g.sessions}
            index={i}
            harnessNames={harnessNames}
            openTabKeys={openTabKeys}
            onSelectTask={onSelectTask}
            onMarkDone={onMarkDone}
          />
        ))}

        {groups.length === 0 && (
          <section style={{ ...listCard, animation: 'riseIn .4s var(--ease) both' }}>
            {filterProject && (
              <div class="flex items-center" style={{ ...listHeader, gap: '10px' }}>
                <Dot size={9} />
                <span style={{ fontSize: '14px', fontWeight: 650, letterSpacing: '-0.01em' }}>{filterProject}</span>
              </div>
            )}
            <div class="flex flex-col items-center text-center" style={{ padding: '28px 16px', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                {filterType || filterHarness ? 'No active tasks match these filters.' : filterProject ? `No active tasks on ${filterProject}.` : 'No active tasks. Start something new.'}
              </p>
              <ActionButton label="New task" variant="primary" onClick={onNewTask} />
            </div>
          </section>
        )}

        {showDone && done.length > 0 && (
          <section style={{ ...listCard, boxShadow: 'var(--shadow-s)' }} aria-label="Done">
            <div style={{ ...listHeader, padding: '10px 15px', fontSize: '13px', fontWeight: 600, color: 'var(--ink-2)' }}>
              Done · last {Math.min(DONE_LIMIT, done.length)} of {done.length}
            </div>
            {done.slice(0, DONE_LIMIT).map(s => (
              <DoneRow key={sessionKey(s)} session={s} onSelect={() => onSelectTask(s)} />
            ))}
          </section>
        )}
      </div>
    </>
  )
}

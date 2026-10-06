import { useState, useEffect, useCallback } from 'preact/hooks'
import { definePanel, type PanelProps } from '@forge-dev/sdk'
import { ActionButton, EmptyState } from '@forge-dev/ui'
import { latestDecision, weekStats, isStale, visualChanges, type Decision, type EvidenceFile, type PrComment, type VisualChange, type WeekStats } from '../lib/decision.js'
import { readGh, readGhRun, readPng, timeAgo, checkMark, type ActionResponse } from '../lib/inbox.js'

interface EscalatedPr {
  number: number
  title: string
  url: string
  updatedAt: string
  author?: { login: string } | null
}

interface PrView {
  number: number
  title: string
  url: string
  headRefOid: string
  headRefName: string
  author?: { login: string } | null
  comments: PrComment[]
  additions: number
  deletions: number
  changedFiles: number
}

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: T }

const soft = (token: string, pct = 16) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`
const card = { background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: '12px' }
const CHECK_TONE = { pass: '--green', fail: '--red', warn: '--orange' } as const

function useAction(moduleId: string, projectId: string | null, cwProject?: string | null) {
  return useCallback(async (action: string, params?: Record<string, string>): Promise<ActionResponse> => {
    try {
      const res = await fetch(`/api/actions/${moduleId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...(cwProject ? { cwProject } : {}), params }),
      })
      return await res.json() as ActionResponse
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Forge no respondió' }
    }
  }, [moduleId, projectId, cwProject])
}

function GhError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ ...card, padding: '18px 20px', borderColor: soft('--red', 50) }}>
      <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>No se pudo leer GitHub</h3>
      <p style={{ fontSize: '13px', color: 'var(--ink-2)', marginBottom: '10px' }}>
        Ejecuta <code style={{ fontFamily: 'var(--mono)' }}>gh auth login</code> en una terminal y comprueba que el proyecto es un repositorio de GitHub.
      </p>
      <pre style={{ fontFamily: 'var(--mono)', fontSize: '11.5px', color: 'var(--ink-3)', whiteSpace: 'pre-wrap', marginBottom: '12px' }}>{message}</pre>
      <ActionButton label="Reintentar" variant="secondary" size="sm" onClick={onRetry} />
    </div>
  )
}

function Kpis({ stats }: { stats: Load<WeekStats> }) {
  const value = (pick: (s: WeekStats) => number) => stats.state === 'ok' ? String(pick(stats.data)) : '–'
  const items = [
    { label: 'PRs esta semana', value: value((s) => s.total), tone: '--ink' },
    { label: 'Aprobados solos', value: value((s) => s.auto), tone: '--green' },
    { label: 'Escalados', value: value((s) => s.escalated), tone: '--orange' },
    { label: 'Bloqueados', value: value((s) => s.blocked), tone: '--red' },
  ]
  return (
    <div class="grid gap-2.5 mb-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
      {items.map((k) => (
        <div key={k.label} style={{ ...card, borderRadius: '10px', padding: '10px 12px', minWidth: 0 }}>
          <span style={{ fontSize: '11.5px', color: 'var(--ink-2)' }}>{k.label}</span>
          <b style={{ display: 'block', fontSize: '20px', fontVariantNumeric: 'tabular-nums', color: `var(${k.tone})` }}>{k.value}</b>
        </div>
      ))}
    </div>
  )
}

function Chip({ label, tone }: { label: string; tone?: string }) {
  return (
    <span style={{
      fontSize: '11.5px', borderRadius: '6px', padding: '3px 8px',
      border: `1px solid ${tone ? `var(${tone})` : 'var(--hair)'}`,
      color: tone ? `var(${tone})` : 'var(--ink)',
      background: tone ? soft(tone) : 'var(--elev)',
    }}>{label}</span>
  )
}

function DecisionView({ decision }: { decision: Decision }) {
  return (
    <>
      <div class="flex flex-wrap gap-1.5">
        {decision.gates.map((g) => <Chip key={g.id + g.reason} label={`${g.id} · ${g.reason}`} tone="--orange" />)}
        {Object.entries(decision.checks).map(([check, status]) => (
          <Chip key={check} label={`${check} ${checkMark(status)}`} tone={status === 'pass' ? undefined : CHECK_TONE[status]} />
        ))}
      </div>
      {decision.findings.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-2)', marginBottom: '6px' }}>Hallazgos</div>
          <ul class="flex flex-col gap-1.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {decision.findings.map((f, i) => (
              <li key={i} style={{ ...card, borderRadius: '8px', padding: '8px 10px', fontSize: '12.5px' }}>
                <div class="flex flex-wrap gap-1.5 mb-1" style={{ fontSize: '11px', color: 'var(--ink-3)' }}>
                  <span>{f.check}</span><span>· {f.kind}</span>
                  {f.journey && <span>· {f.journey}</span>}
                  {f.severity && <span>· {f.severity}</span>}
                </div>
                <div>{f.message}</div>
                {(f.file || f.artifact) && (
                  <code style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-2)' }}>{f.file ?? f.artifact}</code>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

// las imágenes viven en la rama qa-pilot/evidence; se leen con gh porque el repo puede ser privado
function EvidenceImage({ file, label, run, onOpen }: {
  file?: EvidenceFile
  label: string
  run: ReturnType<typeof useAction>
  onOpen: (src: string, label: string) => void
}) {
  const [img, setImg] = useState<Load<string>>({ state: 'loading' })
  useEffect(() => {
    if (!file) return
    let live = true
    setImg({ state: 'loading' })
    void run('get-evidence', { REF: file.ref, PATH: file.path }).then((r) => {
      const png = readPng(r)
      if (live) setImg(png.ok ? { state: 'ok', data: png.data } : { state: 'error', message: png.message })
    })
    return () => { live = false }
  }, [file?.ref, file?.path, run])

  const frame = { ...card, borderRadius: '8px', overflow: 'hidden', aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--elev)' }
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <figcaption style={{ fontSize: '11.5px', color: 'var(--ink-2)', marginBottom: '4px' }}>{label}</figcaption>
      {!file ? (
        <div style={{ ...frame, fontSize: '12px', color: 'var(--ink-3)' }}>—</div>
      ) : img.state === 'loading' ? (
        <div style={frame} class="animate-pulse" />
      ) : img.state === 'error' ? (
        <div style={{ ...frame, fontSize: '11.5px', color: 'var(--ink-3)', padding: '8px', textAlign: 'center' }}>{img.message}</div>
      ) : (
        <button type="button" onClick={() => onOpen(img.data, label)} class="cursor-zoom-in" style={{ ...frame, padding: 0 }} title="Ver en grande">
          <img src={img.data} alt={label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </button>
      )}
    </figure>
  )
}

function VisualChanges({ changes, run }: { changes: VisualChange[]; run: ReturnType<typeof useAction> }) {
  const [open, setOpen] = useState<{ src: string; label: string } | null>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])
  const show = (src: string, label: string) => setOpen({ src, label })

  return (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-2)', marginBottom: '6px' }}>Cambios visuales</div>
      <ul class="flex flex-col gap-2.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {changes.map((c) => (
          <li key={c.name} style={{ ...card, borderRadius: '10px', padding: '10px 12px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 600 }}>{c.name}{c.journey ? ` · ${c.journey}` : ''}</div>
            {c.ai && (
              <p style={{ fontSize: '13px', margin: '4px 0 0' }}>
                {c.ai} <span title="Descripción hecha por Claude mirando Antes y Después; puede equivocarse" style={{ fontSize: '10.5px', padding: '1px 5px', borderRadius: '4px', background: soft('--purple'), color: 'var(--purple)' }}>IA</span>
              </p>
            )}
            {c.summary && <p style={{ fontSize: '12px', color: 'var(--ink-2)', margin: '3px 0 0' }}>Cambió: {c.summary}</p>}
            <div class="grid gap-2 mt-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <EvidenceImage file={c.before} label="Antes" run={run} onOpen={show} />
              <EvidenceImage file={c.after} label="Después" run={run} onOpen={show} />
              <EvidenceImage file={c.diff} label="Diferencia" run={run} onOpen={show} />
            </div>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: '11.5px', color: 'var(--ink-3)', marginTop: '6px' }}>
        El recuadro rojo en Después marca la zona que cambió. En Diferencia, lo rojo son los píxeles distintos y lo amarillo, bordes suavizados que no cuentan.
      </p>
      {open && (
        <div
          role="dialog"
          aria-label={open.label}
          onClick={() => setOpen(null)}
          class="cursor-zoom-out"
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'color-mix(in srgb, black 70%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
          <img src={open.src} alt={open.label} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px', background: 'white' }} />
        </div>
      )}
    </div>
  )
}

function Detail({ pr, run, onDone }: {
  pr: EscalatedPr
  run: ReturnType<typeof useAction>
  onDone: () => void
}) {
  const [view, setView] = useState<Load<PrView>>({ state: 'loading' })
  const [asking, setAsking] = useState(false)
  const [msg, setMsg] = useState('')
  const [status, setStatus] = useState('Esperando tu decisión.')

  const load = useCallback(async () => {
    setView({ state: 'loading' })
    const r = readGh<PrView>(await run('get-decision', { PR: String(pr.number) }))
    setView(r.ok ? { state: 'ok', data: r.data } : { state: 'error', message: r.message })
  }, [pr.number, run])

  useEffect(() => {
    setAsking(false)
    setMsg('')
    setStatus('Esperando tu decisión.')
    void load()
  }, [load])

  if (view.state === 'loading') return <div style={{ ...card, height: '220px' }} class="animate-pulse" />
  if (view.state === 'error') return <GhError message={view.message} onRetry={load} />

  const data = view.data
  const decision = latestDecision(data.comments)
  const stale = decision ? isStale(decision, data.headRefOid) : false
  const canApprove = decision !== null && decision.decision === 'escalate' && !stale
  const changes = decision ? visualChanges(decision) : []
  const diff = decision?.diff ?? { files: data.changedFiles, added: data.additions, removed: data.deletions }

  const approve = async () => {
    const r = readGhRun(await run('approve', { PR: String(pr.number) }))
    setStatus(r.ok ? 'Aprobado: qa-pilot pone el status en verde y activa el auto-merge.' : `No se pudo aprobar: ${r.message}`)
    if (r.ok) onDone()
  }

  const requestChanges = async () => {
    const r = readGhRun(await run('request-changes', { PR: String(pr.number), MSG: msg.trim() }))
    if (r.ok) {
      setStatus('Comentario publicado en el PR.')
      setAsking(false)
      setMsg('')
    } else {
      setStatus(r.message.startsWith('Param MSG')
        ? 'El mensaje admite letras, números, espacios y puntuación básica, en una línea y sin < > $ ` \\ [ ].'
        : `No se pudo comentar: ${r.message}`)
    }
  }

  return (
    <div class="flex flex-col gap-3.5" style={{ ...card, padding: '16px 18px', minWidth: 0 }}>
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, letterSpacing: '-0.01em' }}>#{data.number} · {data.title}</h3>
        <div style={{ fontSize: '12px', color: 'var(--ink-2)', marginTop: '2px' }}>
          {data.author?.login ? `abierto por ${data.author.login} en ` : 'rama '}
          <code style={{ fontFamily: 'var(--mono)' }}>{data.headRefName}</code>
          {` · ${diff.files} archivos, +${diff.added} −${diff.removed}`}
        </div>
      </div>

      {decision === null ? (
        <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
          Este PR no tiene un comentario de decisión de qa-pilot legible. Revisa el workflow antes de aprobar.
        </p>
      ) : (
        <>
          {stale && (
            <p style={{ fontSize: '12.5px', padding: '8px 10px', borderRadius: '8px', background: soft('--orange'), color: 'var(--orange)' }}>
              La decisión es del commit <code>{decision.sha.slice(0, 7)}</code> y el PR ya está en <code>{data.headRefOid.slice(0, 7)}</code>. Espera la nueva corrida.
            </p>
          )}
          <DecisionView decision={decision} />
          {changes.length > 0 && <VisualChanges changes={changes} run={run} />}
        </>
      )}

      {asking && (
        <div class="flex flex-col gap-2">
          <textarea
            value={msg}
            maxLength={500}
            rows={3}
            placeholder="Qué debe cambiar (una línea, sin < > $ ni comillas invertidas)"
            onInput={(e) => setMsg((e.target as HTMLTextAreaElement).value.replace(/\s*\n\s*/g, ' '))}
            style={{ ...card, borderRadius: '8px', padding: '8px 10px', fontSize: '13px', color: 'var(--ink)', fontFamily: 'var(--font)', resize: 'vertical' }}
          />
          <div class="flex gap-2">
            <ActionButton label="Enviar comentario" size="sm" disabled={msg.trim() === ''} onClick={requestChanges} />
            <ActionButton label="Cancelar" variant="secondary" size="sm" onClick={() => setAsking(false)} />
          </div>
        </div>
      )}

      <div class="flex flex-wrap gap-2">
        {!asking && <ActionButton label="Pedir cambios" variant="secondary" icon="i-lucide-message-square" onClick={() => setAsking(true)} />}
        <ActionButton
          label="Aprobar"
          icon="i-lucide-check"
          disabled={!canApprove}
          title={canApprove ? 'Añade qa:approved al PR' : 'Solo se aprueba una decisión escalada y vigente'}
          onClick={approve}
        />
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-1.5"
          style={{ ...card, borderRadius: '9px', padding: '7px 13px', fontSize: '13px', color: 'var(--ink)', textDecoration: 'none' }}
        >
          <span class="i-lucide-external-link" /> Abrir PR
        </a>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--ink-3)' }} aria-live="polite">{status}</p>
    </div>
  )
}

function EscalationsPanel({ moduleId, projectId, cwProject }: PanelProps) {
  const run = useAction(moduleId, projectId, cwProject)
  const hasProject = Boolean(projectId || cwProject)
  const [list, setList] = useState<Load<EscalatedPr[]>>({ state: 'loading' })
  const [stats, setStats] = useState<Load<WeekStats>>({ state: 'loading' })
  const [selected, setSelected] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setList({ state: 'loading' })
    const [prs, week] = await Promise.all([
      run('list-escalations').then((r) => readGh<EscalatedPr[]>(r)),
      run('week-stats').then((r) => readGh<{ number: number; labels: { name: string }[] }[]>(r)),
    ])
    setList(prs.ok ? { state: 'ok', data: prs.data } : { state: 'error', message: prs.message })
    setStats(week.ok ? { state: 'ok', data: weekStats(week.data) } : { state: 'error', message: week.message })
    if (prs.ok) setSelected((cur) => prs.data.some((p) => p.number === cur) ? cur : prs.data[0]?.number ?? null)
  }, [run])

  useEffect(() => {
    if (hasProject) void refresh()
  }, [hasProject, refresh])

  if (!hasProject) {
    return <EmptyState icon="i-lucide-folder-search" title="Elige un proyecto" description="Los escalamientos se leen del repositorio de GitHub del proyecto." />
  }

  const current = list.state === 'ok' ? list.data.find((p) => p.number === selected) : undefined

  return (
    <div>
      <div class="flex items-center justify-between mb-3.5">
        <h2 style={{ fontSize: '15px', fontWeight: 700 }}>Escalamientos</h2>
        <ActionButton label="Actualizar" variant="secondary" size="sm" icon="i-lucide-refresh-cw" loading={list.state === 'loading'} onClick={refresh} />
      </div>
      <Kpis stats={stats} />

      {list.state === 'loading' ? (
        <div style={{ ...card, height: '160px' }} class="animate-pulse" />
      ) : list.state === 'error' ? (
        <GhError message={list.message} onRetry={refresh} />
      ) : list.data.length === 0 ? (
        <EmptyState icon="i-lucide-inbox" title="Nada te necesita" description="No hay PRs abiertos con qa:needs-human. Lo que pasó los checks y las reglas se aprobó solo." />
      ) : (
        <div class="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', alignItems: 'start' }}>
          <div class="flex flex-col gap-2" role="listbox" aria-label="PRs escalados">
            {list.data.map((pr) => (
              <button
                key={pr.number}
                type="button"
                role="option"
                aria-selected={pr.number === selected}
                onClick={() => setSelected(pr.number)}
                class="text-left cursor-pointer"
                style={{
                  ...card, borderRadius: '10px', padding: '10px 12px', color: 'var(--ink)',
                  borderColor: pr.number === selected ? 'var(--blue)' : 'var(--hair)',
                  background: pr.number === selected ? soft('--blue', 10) : 'var(--card)',
                }}
              >
                <div class="flex justify-between gap-2" style={{ fontSize: '11.5px', color: 'var(--ink-3)' }}>
                  <span>#{pr.number} · {timeAgo(pr.updatedAt)}</span>
                  {pr.author?.login && <span>{pr.author.login}</span>}
                </div>
                <b style={{ display: 'block', fontSize: '13px', marginTop: '2px' }}>{pr.title}</b>
              </button>
            ))}
          </div>
          {current && <Detail key={current.number} pr={current} run={run} onDone={refresh} />}
        </div>
      )}
    </div>
  )
}

export default definePanel({ id: 'escalations', title: 'Escalamientos', component: EscalationsPanel })

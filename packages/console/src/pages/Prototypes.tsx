import { type FunctionComponent } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import { ActionButton, EmptyState, Modal, showToast } from '@forge-dev/ui'
import type { CWSession, LiveframeFrame, LiveframeStatus } from '@forge-dev/core'
import { PageHeader } from '../components/PageHeader.js'
import { Field } from '../components/Field.js'
import { secondaryButton, secondaryClass } from '../components/TaskLinks.js'
import { soft } from '../config/types.js'

interface PrototypesProps {
  accounts: string[]
  onOpenSession: (session: CWSession) => void
  onFramesChanged: (count: number) => void
}

const card = { borderRadius: '16px', background: 'var(--card)', border: '1px solid var(--hair)', boxShadow: 'var(--shadow-m)' }
const note = { padding: '10px 14px', borderRadius: '12px', fontSize: '12.5px' }
const inputValue = (e: Event) => (e.target as HTMLInputElement).value

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({})) as T & { error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}

const errorText = (err: unknown) => err instanceof Error ? err.message : String(err)

export const Prototypes: FunctionComponent<PrototypesProps> = ({ accounts, onOpenSession, onFramesChanged }) => {
  const [status, setStatus] = useState<LiveframeStatus | null>(null)
  const [frames, setFrames] = useState<LiveframeFrame[] | null>(null)
  const [project, setProject] = useState('')
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [pushing, setPushing] = useState<LiveframeFrame | null>(null)
  const [pushNote, setPushNote] = useState('')

  const load = useCallback(async () => {
    try {
      const list = await (await fetch('/api/liveframe/frames')).json() as LiveframeFrame[]
      setFrames(list)
      onFramesChanged(list.length)
    } catch {
      setFrames([])
    }
  }, [onFramesChanged])

  useEffect(() => {
    void load()
    fetch('/api/liveframe/status').then(r => r.json() as Promise<LiveframeStatus>).then(setStatus).catch(() => {})
  }, [load])

  const openAgent = async (frame: LiveframeFrame) => {
    if (!status) return
    try {
      const result = await postJson<{ session: CWSession }>('/api/cw/start', {
        type: 'general', account: status.account, directory: frame.dir, task: `Liveframe: ${frame.project}/${frame.frame}`,
      })
      onOpenSession(result.session)
    } catch (err) {
      showToast(errorText(err), 'error')
    }
  }

  const adopt = async (request: Promise<LiveframeFrame>, done: string) => {
    try {
      const frame = await request
      showToast(done, 'success')
      void load()
      await openAgent(frame)
      return true
    } catch (err) {
      showToast(errorText(err), 'error')
      return false
    }
  }

  const create = async () => {
    if (await adopt(postJson<LiveframeFrame>('/api/liveframe/frames', { project, name }), `Frame "${name}" created`)) setName('')
  }

  const pull = async () => {
    if (await adopt(postJson<LiveframeFrame>('/api/liveframe/pull', { target }), `Pulled ${target}`)) setTarget('')
  }

  const push = async () => {
    if (!pushing) return
    try {
      const { url } = await postJson<{ url: string }>(`/api/liveframe/frames/${pushing.project}/${pushing.frame}/push`, { note: pushNote })
      showToast(`Published: ${url}`, 'success')
      setPushing(null)
    } catch (err) {
      showToast(errorText(err), 'error')
    }
  }

  const missingAccount = status !== null && !accounts.includes(status.account)
  const ready = status?.installed !== false && !missingAccount
  const byProject = (frames ?? []).reduce<Record<string, LiveframeFrame[]>>((groups, f) => {
    (groups[f.project] ??= []).push(f)
    return groups
  }, {})

  return (
    <>
      <PageHeader title="Prototypes" subtitle={status ? `Liveframe frames in ${status.root} · agents run on ${status.account}` : 'Liveframe frames'}>
        {status && (
          <a class={secondaryClass} style={secondaryButton} href={status.api} target="_blank" rel="noopener noreferrer">
            Liveframe gallery <span class="i-lucide-external-link" style={{ width: '12px', height: '12px' }} />
          </a>
        )}
        <ActionButton label="Refresh" variant="secondary" onClick={load} />
      </PageHeader>

      <div class="flex flex-col w-full" style={{ padding: '18px 22px 40px', gap: '14px', maxWidth: '1180px' }}>
        {status && !status.installed && (
          <p style={{ ...note, background: soft('--red') }}>
            The Liveframe CLI is not installed. Run <code>npm i -g {status.api}/cli.tgz</code>, then <code>lf login</code>.
          </p>
        )}
        {missingAccount && (
          <p style={{ ...note, background: soft('--red') }}>Liveframe agents run on the CW account <code>{status?.account}</code>, which does not exist here. Add it in Accounts or set <code>FORGE_LIVEFRAME_ACCOUNT</code>.</p>
        )}
        {status?.installed && !status.signedIn && (
          <p style={{ ...note, background: soft('--orange') }}>Liveframe is not signed in on this machine. Run <code>lf login</code> in a terminal.</p>
        )}

        <section class="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
          <div class="flex flex-col" style={{ ...card, padding: '16px 18px', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '14.5px', fontWeight: 600 }}>New prototype</h2>
              <p style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>Scaffolds a frame with <code>lf new</code> and opens an agent in it. The frame's CLAUDE.md teaches the agent Liveframe's conventions and <code>lf push</code>.</p>
            </div>
            <Field label="Liveframe project · created if missing">
              <input type="text" class="field" value={project} placeholder="Reservas" onInput={(e) => setProject(inputValue(e))} />
            </Field>
            <Field label="Frame name">
              <input type="text" class="field" value={name} placeholder="Checkout ideas" onInput={(e) => setName(inputValue(e))} />
            </Field>
            <div class="flex justify-end">
              <ActionButton label="Create and open agent" variant="primary" size="sm" disabled={!ready || !project.trim() || !name.trim()} onClick={create} />
            </div>
          </div>

          <div class="flex flex-col" style={{ ...card, padding: '16px 18px', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '14.5px', fontWeight: 600 }}>Continue a frame</h2>
              <p style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>Pulls an existing frame's latest source with <code>lf pull</code> and opens an agent in it.</p>
            </div>
            <Field label="project/frame">
              <input type="text" class="field" value={target} placeholder="reservas/checkout-flow" onInput={(e) => setTarget(inputValue(e))} />
            </Field>
            <div class="flex justify-end">
              <ActionButton label="Pull and open agent" variant="secondary" size="sm" disabled={!ready || !target.includes('/')} onClick={pull} />
            </div>
          </div>
        </section>

        {frames && frames.length === 0 && (
          <EmptyState icon="i-lucide-frame" title="No frames yet" description="Frames you create or pull here live on this machine, one folder per frame." />
        )}

        {Object.entries(byProject).map(([projectSlug, list]) => (
          <section key={projectSlug} style={{ ...card, overflow: 'hidden' }}>
            <h2 style={{ padding: '12px 18px', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid var(--hair)' }}>{projectSlug}</h2>
            {list.map(frame => (
              <div key={frame.dir} class="flex items-center flex-wrap" style={{ gap: '10px', padding: '12px 18px', borderBottom: '1px solid var(--hair)' }}>
                <div class="min-w-0" style={{ flex: '1 1 220px' }}>
                  <p class="truncate" style={{ fontSize: '13.5px', fontWeight: 500 }}>{frame.frame}</p>
                  <p class="truncate" style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{frame.kind} · {frame.branch} · {frame.dir}</p>
                </div>
                <a class={secondaryClass} style={secondaryButton} href={frame.url} target="_blank" rel="noopener noreferrer">
                  Live <span class="i-lucide-external-link" style={{ width: '12px', height: '12px' }} />
                </a>
                <ActionButton label="Push" variant="secondary" size="sm" disabled={!ready} onClick={() => { setPushNote(''); setPushing(frame) }} />
                <ActionButton label="Open agent" variant="primary" size="sm" disabled={!status || missingAccount} onClick={() => openAgent(frame)} />
              </div>
            ))}
          </section>
        ))}
      </div>

      <Modal open={pushing !== null} title={`Push ${pushing?.project}/${pushing?.frame}`} onClose={() => setPushing(null)}>
        <div class="space-y-4">
          <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>Builds the frame and deploys it as a new version with <code>lf push</code>.</p>
          <Field label="What changed · optional">
            <input type="text" class="field" value={pushNote} placeholder="wallet-first layout" onInput={(e) => setPushNote(inputValue(e))} />
          </Field>
          <div class="flex justify-end pt-1">
            <ActionButton label="Push" variant="primary" onClick={push} />
          </div>
        </div>
      </Modal>
    </>
  )
}

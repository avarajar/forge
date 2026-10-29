import { type FunctionComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ActionButton, Modal, showToast } from '@forge-dev/ui'
import type { CWSession } from '@forge-dev/core'
import { errorText, postJson, requestJson } from '../config/api.js'
import { projectOf, sessionDirOf, sessionLabel } from '../config/types.js'
import { sessionStates } from '../hooks/useSessionStates.js'
import { loadPlugins, plugins } from '../hooks/usePlugins.js'

const small = { fontSize: '11.5px', color: 'var(--ink-3)' }
const link = { fontSize: '11.5px', fontWeight: 600, color: 'var(--blue)', background: 'none', border: 0, padding: 0, cursor: 'pointer' }

// `/kioku-search <words>` is the command and what it takes
const splitCommand = (command: string) => {
  const at = command.indexOf(' ')
  return at < 0 ? { name: command, hint: '' } : { name: command.slice(0, at), hint: command.slice(at + 1).trim() }
}

// how the PTY manager and the session states name a session
const liveKey = (s: CWSession) => `${s.project}::${sessionDirOf(s)}`

// the live Claude Code sessions of the accounts where the plugin is installed and on
function runnable(spaces: CWSession[], plugin: string): CWSession[] {
  const accounts = new Set((plugins.value ?? []).find(p => p.name === plugin)?.installs.filter(i => i.scope === 'account' && i.enabled).map(i => i.scopeRef))
  const live = sessionStates.value
  return spaces.filter(s => s.harness === 'claude' && s.status === 'active' && accounts.has(s.account) && live[liveKey(s)])
}

const RunDialog: FunctionComponent<{ command: string; plugin: string; note?: string; onClose: () => void }> = ({ command, plugin, note, onClose }) => {
  const { name, hint } = splitCommand(command)
  const [spaces, setSpaces] = useState<CWSession[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [args, setArgs] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void Promise.all([requestJson<CWSession[]>('GET', '/api/cw/spaces'), plugins.value ? null : loadPlugins()])
      .then(([list]) => setSpaces(list), () => setSpaces([]))
  }, [])

  const sessions = spaces ? runnable(spaces, plugin) : []
  const session = sessions.find(s => liveKey(s) === picked) ?? sessions[0]
  // a hint in angle brackets is required, one in square brackets optional
  const line = args.trim() ? `${name} ${args.trim()}` : name
  const missing = hint.startsWith('<') && !args.trim()

  const run = async () => {
    if (!session) return
    setBusy(true)
    try {
      await postJson('/api/cw/terminal/command', { project: session.project, sessionDir: sessionDirOf(session), line })
      showToast(`Sent ${name} to ${sessionLabel(session)}`, 'success')
      onClose()
    } catch (err) {
      showToast(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const footer = (
    <>
      <span class="flex-1" />
      <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
      <ActionButton label={busy ? 'Sending…' : 'Run'} variant="primary" disabled={!session || missing || busy} onClick={run} />
    </>
  )

  return (
    <Modal open title={`Run ${name}`} onClose={onClose} footer={footer}>
      <div class="flex flex-col" style={{ gap: '12px', fontSize: '13px' }}>
        {hint && (
          <label class="flex flex-col" style={{ gap: '4px' }}>
            <span style={small}>{name} {hint}</span>
            <input type="text" class="field" value={args} placeholder={hint.replace(/[<>[\]]/g, '')} onInput={(e) => setArgs((e.target as HTMLInputElement).value)} />
          </label>
        )}
        {spaces === null && <p style={small}>Looking for open sessions…</p>}
        {spaces && sessions.length === 0 && <p style={small}>No Claude Code session of an account with {plugin} is open in Forge. Start one from Tasks, then run it here.</p>}
        {sessions.length > 0 && (
          <div class="flex flex-col" style={{ gap: '4px' }}>
            <span style={small}>Session</span>
            {sessions.map(s => {
              return (
                <label key={liveKey(s)} class="flex items-center cursor-pointer" style={{ gap: '8px' }}>
                  <input type="radio" name="session" checked={session === s} onChange={() => setPicked(liveKey(s))} />
                  <span style={{ fontWeight: 500 }}>{sessionLabel(s)}</span>
                  <span style={small}>{[projectOf(s), s.account].filter(Boolean).join(' · ')}</span>
                </label>
              )
            })}
          </div>
        )}
        <code style={{ fontSize: '11.5px', color: 'var(--ink-2)' }}>{line}</code>
        {note && <p style={small}>{note}</p>}
        <p style={small}>Forge types it into the session's terminal, as if you had.</p>
      </div>
    </Modal>
  )
}

// types a plugin's slash command into a live session the person picks
export const RunCommand: FunctionComponent<{ command: string; plugin: string; note?: string; disabled?: boolean }> = ({ command, plugin, note, disabled }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" style={{ ...link, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }} disabled={disabled} onClick={() => setOpen(true)}>Run…</button>
      {open && <RunDialog command={command} plugin={plugin} note={note} onClose={() => setOpen(false)} />}
    </>
  )
}

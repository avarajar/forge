import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StateTracker, remoteClassifierFromEnv, type HookEvent, type RemoteCall } from './session-state.js'
import type { Classification, StateClassifier } from './state-classifier.js'

const DONE = '✻ Brewed for 3s\n❯ '
const PERMISSION = 'Do you want to proceed?\n❯ 1. Yes\n2. No\nEsc to cancel · Tab to amend'

const remoteReturning = (answer: Classification | Error, calls: string[] = []): StateClassifier => ({
  name: 'fake',
  classify: async (input) => {
    calls.push(input.text)
    if (answer instanceof Error) throw answer
    return answer
  },
})

describe('StateTracker with Claude Code hooks', () => {
  let tracker: StateTracker

  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
  afterEach(() => { tracker?.dispose(); vi.useRealTimers(); vi.restoreAllMocks() })

  const started = (sessionId = 'lead') => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.hookEvent('p::a', { name: 'SessionStart', sessionId, source: 'startup' })
  }
  const state = () => tracker.snapshot()['p::a']

  it('maps hook events to states with full confidence', () => {
    started()
    expect(state()).toMatchObject({ state: 'waiting', source: 'hook', confidence: 1 })
    const cases: Array<[HookEvent, string]> = [
      [{ name: 'UserPromptSubmit' }, 'working'],
      [{ name: 'PermissionRequest' }, 'permission'],
      [{ name: 'PreToolUse' }, 'working'],
      [{ name: 'Notification', notificationType: 'permission_prompt' }, 'permission'],
      [{ name: 'PostToolUse' }, 'working'],
      [{ name: 'Notification', notificationType: 'idle_prompt' }, 'waiting'],
      [{ name: 'PostToolUseFailure' }, 'working'],
      [{ name: 'Stop' }, 'waiting'],
      [{ name: 'StopFailure' }, 'error'],
      [{ name: 'PermissionDenied' }, 'working'],
      [{ name: 'Notification', notificationType: 'elicitation_dialog' }, 'permission'],
      [{ name: 'PreCompact' }, 'working'],
    ]
    for (const [event, expected] of cases) {
      tracker.hookEvent('p::a', { ...event, sessionId: 'lead' })
      expect(state().state, event.name).toBe(expected)
    }
  })

  it('changes nothing on subagent events or other notifications', () => {
    started()
    tracker.hookEvent('p::a', { name: 'UserPromptSubmit', sessionId: 'lead' })
    tracker.hookEvent('p::a', { name: 'SubagentStart', sessionId: 'lead' })
    tracker.hookEvent('p::a', { name: 'SubagentStop', sessionId: 'lead' })
    tracker.hookEvent('p::a', { name: 'Notification', sessionId: 'lead', notificationType: 'auth_success' })
    expect(state().state).toBe('working')
  })

  it('ignores an agent teammate that starts while the lead runs', () => {
    started('lead')
    tracker.hookEvent('p::a', { name: 'UserPromptSubmit', sessionId: 'lead' })
    tracker.hookEvent('p::a', { name: 'SessionStart', sessionId: 'mate', source: 'startup' })
    tracker.hookEvent('p::a', { name: 'Stop', sessionId: 'mate' })
    expect(state().state).toBe('working')
  })

  it('follows the next Claude session after the previous one ended, or after /clear', () => {
    started('run-1')
    tracker.hookEvent('p::a', { name: 'SessionEnd', sessionId: 'run-1' })
    tracker.hookEvent('p::a', { name: 'SessionStart', sessionId: 'run-2', source: 'startup' })
    tracker.hookEvent('p::a', { name: 'UserPromptSubmit', sessionId: 'run-2' })
    expect(state().state).toBe('working')
    tracker.hookEvent('p::a', { name: 'SessionStart', sessionId: 'run-3', source: 'clear' })
    tracker.hookEvent('p::a', { name: 'Stop', sessionId: 'run-2' })
    expect(state().state).toBe('waiting')
    tracker.hookEvent('p::a', { name: 'PreToolUse', sessionId: 'run-2' })
    expect(state().state).toBe('waiting')
  })

  it('follows the lead into a session it resumes', () => {
    started('first')
    tracker.hookEvent('p::a', { name: 'SessionStart', sessionId: 'older', source: 'resume' })
    tracker.hookEvent('p::a', { name: 'PermissionRequest', sessionId: 'older' })
    expect(state().state).toBe('permission')
  })

  it('reads a permission refused with Esc from the screen, since it fires no Stop', () => {
    started()
    tracker.hookEvent('p::a', { name: 'PermissionRequest', sessionId: 'lead' })
    tracker.output('p::a', '⎿  Interrupted · What should Claude do instead?\n❯ ')
    vi.advanceTimersByTime(1600)
    expect(state()).toMatchObject({ state: 'waiting', source: 'local' })
  })

  it('hands the session back to the screen after SessionEnd', () => {
    started()
    tracker.hookEvent('p::a', { name: 'Stop', sessionId: 'lead' })
    tracker.hookEvent('p::a', { name: 'SessionEnd', sessionId: 'lead' })
    for (let i = 0; i < 11; i++) { tracker.output('p::a', '✻ Brewing… '); vi.advanceTimersByTime(200) }
    expect(state()).toMatchObject({ state: 'working', source: 'local' })
  })

  it('holds waiting and permission through redraws and typing', () => {
    started()
    for (let i = 0; i < 11; i++) { tracker.output('p::a', '✻ Brewing… '); vi.advanceTimersByTime(200) }
    vi.advanceTimersByTime(2000)
    expect(state()).toMatchObject({ state: 'waiting', source: 'hook' })
  })

  it('moves a granted permission to working when output keeps flowing', () => {
    started()
    tracker.hookEvent('p::a', { name: 'PermissionRequest', sessionId: 'lead' })
    tracker.output('p::a', PERMISSION)
    vi.advanceTimersByTime(300)
    tracker.output('p::a', 'y')
    expect(state().state).toBe('permission')
    for (let i = 0; i < 11; i++) { tracker.output('p::a', '✻ Running… '); vi.advanceTimersByTime(200) }
    expect(state()).toMatchObject({ state: 'working', source: 'local' })
  })

  it('does not count output from before the permission request as a burst after it', () => {
    started()
    tracker.hookEvent('p::a', { name: 'PreToolUse', sessionId: 'lead' })
    for (let i = 0; i < 11; i++) { tracker.output('p::a', '✻ Brewing… '); vi.advanceTimersByTime(200) }
    tracker.hookEvent('p::a', { name: 'PermissionRequest', sessionId: 'lead' })
    tracker.output('p::a', PERMISSION)
    vi.advanceTimersByTime(200)
    tracker.output('p::a', ' ctx:20% ')
    expect(state()).toMatchObject({ state: 'permission', source: 'hook' })
  })

  it('reads an interrupted turn from the screen, since Esc fires no Stop', () => {
    started()
    tracker.hookEvent('p::a', { name: 'UserPromptSubmit', sessionId: 'lead' })
    tracker.output('p::a', '⎿  Interrupted · What should Claude do instead?\n❯ ')
    vi.advanceTimersByTime(1600)
    expect(state()).toMatchObject({ state: 'waiting', source: 'local' })
  })

  it('still takes an error from the screen, and the next hook event replaces it', () => {
    started()
    tracker.hookEvent('p::a', { name: 'UserPromptSubmit', sessionId: 'lead' })
    tracker.output('p::a', 'API Error: 529 overloaded')
    vi.advanceTimersByTime(1600)
    expect(state().state).toBe('error')
    tracker.hookEvent('p::a', { name: 'UserPromptSubmit', sessionId: 'lead' })
    expect(state()).toMatchObject({ state: 'working', source: 'hook' })
  })

  it('never asks the remote classifier about a session hooks drive', () => {
    const calls: string[] = []
    tracker = new StateTracker({ remote: remoteReturning({ state: 'idle', confidence: 0.99, source: 'fake' }, calls) })
    tracker.track('p::a', 'claude')
    tracker.hookEvent('p::a', { name: 'Stop', sessionId: 'lead' })
    tracker.output('p::a', 'something unclear')
    vi.advanceTimersByTime(5000)
    expect(calls).toHaveLength(0)
    expect(state().state).toBe('waiting')
  })

  it('keeps exited once the process ended', () => {
    started()
    tracker.exit('p::a', 0)
    tracker.hookEvent('p::a', { name: 'UserPromptSubmit', sessionId: 'lead' })
    expect(state().state).toBe('exited')
  })
})

describe('StateTracker', () => {
  let tracker: StateTracker

  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0) })
  afterEach(() => { tracker?.dispose(); vi.useRealTimers(); vi.restoreAllMocks() })

  it('starts a tracked session as working', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'working', since: 0 })
  })

  it('classifies once the output settles, not on every chunk', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.output('p::a', '✻ Brewing… ')
    vi.advanceTimersByTime(1000)
    tracker.output('p::a', DONE)
    vi.advanceTimersByTime(1000)
    expect(tracker.snapshot()['p::a'].state).toBe('working')
    vi.advanceTimersByTime(600)
    expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'waiting', source: 'local', since: 2500 })
  })

  it('keeps an attention state through a short burst such as a status line refresh', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.output('p::a', PERMISSION)
    vi.advanceTimersByTime(2000)
    tracker.output('p::a', ' ctx:20% ')
    vi.advanceTimersByTime(300)
    expect(tracker.snapshot()['p::a'].state).toBe('permission')
    vi.advanceTimersByTime(2000)
    expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'permission', since: 1500 })
  })

  it('switches to working when output keeps flowing for two seconds', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.output('p::a', DONE)
    vi.advanceTimersByTime(2000)
    for (let i = 0; i < 11; i++) { tracker.output('p::a', '✻ Brewing… '); vi.advanceTimersByTime(200) }
    expect(tracker.snapshot()['p::a'].state).toBe('working')
  })

  it('ignores output with nothing to show, such as a cursor position query every 200 ms', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.output('p::a', DONE)
    for (let i = 0; i < 20; i++) { vi.advanceTimersByTime(200); tracker.output('p::a', '\x1b[?6n') }
    expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'waiting', since: 1500 })
  })

  it('reads a settled screen even when the timer fires a millisecond early', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.output('p::a', DONE)
    const now = Date.now
    vi.spyOn(Date, 'now').mockImplementation(() => now() - 1)
    vi.advanceTimersByTime(1500)
    expect(tracker.snapshot()['p::a'].state).toBe('waiting')
  })

  it('reports an exit with its code, and drops it ten minutes later', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.exit('p::a', 2)
    expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'exited', exitCode: 2 })
    vi.advanceTimersByTime(10 * 60 * 1000 + 1)
    expect(tracker.snapshot()['p::a']).toBeUndefined()
  })

  it('forgets a killed session', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.forget('p::a')
    expect(tracker.snapshot()).toEqual({})
  })

  it('never puts terminal text in the snapshot', () => {
    tracker = new StateTracker()
    tracker.track('p::a', 'claude')
    tracker.output('p::a', 'secret-token-123')
    vi.advanceTimersByTime(2000)
    expect(JSON.stringify(tracker.snapshot())).not.toContain('secret')
  })

  describe('with a remote classifier', () => {
    it('takes the remote answer when the local rules are unsure', async () => {
      tracker = new StateTracker({ remote: remoteReturning({ state: 'waiting', confidence: 0.88, source: 'jev' }) })
      tracker.track('p::a', 'codex')
      tracker.output('p::a', '› Ask Codex to do anything')
      await vi.advanceTimersByTimeAsync(1600)
      expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'waiting', confidence: 0.88, source: 'jev' })
    })

    it('does not ask when the local rules are sure', async () => {
      const calls: string[] = []
      tracker = new StateTracker({ remote: remoteReturning({ state: 'idle', confidence: 0.9, source: 'jev' }, calls) })
      tracker.track('p::a', 'claude')
      tracker.output('p::a', PERMISSION)
      await vi.advanceTimersByTimeAsync(1600)
      expect(calls).toHaveLength(0)
      expect(tracker.snapshot()['p::a'].state).toBe('permission')
    })

    it('does not let the remote classifier overrule an error the local rules found', async () => {
      const calls: string[] = []
      tracker = new StateTracker({ remote: remoteReturning({ state: 'waiting', confidence: 0.95, source: 'jev' }, calls) })
      tracker.track('p::a', 'claude')
      tracker.output('p::a', '⎿ API Error: 529 overloaded\n❯ ')
      await vi.advanceTimersByTimeAsync(1600)
      expect(calls).toHaveLength(0)
      expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'error', source: 'local' })
    })

    it('keeps the local answer when the remote one is not confident enough', async () => {
      tracker = new StateTracker({ remote: remoteReturning({ state: 'error', confidence: 0.4, source: 'jev' }) })
      tracker.track('p::a', 'codex')
      tracker.output('p::a', 'hello')
      await vi.advanceTimersByTimeAsync(1600)
      expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'idle', source: 'local' })
    })

    it('keeps the local answer and reports the failure when the remote call fails', async () => {
      const onError = vi.fn()
      tracker = new StateTracker({ remote: remoteReturning(new Error('Jev answered 401')), onError })
      tracker.track('p::a', 'codex')
      tracker.output('p::a', 'hello')
      await vi.advanceTimersByTimeAsync(1600)
      expect(tracker.snapshot()['p::a'].source).toBe('local')
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Jev answered 401' }))
    })

    it('does not ask about an empty screen', async () => {
      const calls: string[] = []
      tracker = new StateTracker({ remote: remoteReturning({ state: 'waiting', confidence: 0.9, source: 'jev' }, calls) })
      tracker.track('p::a', 'codex')
      await vi.advanceTimersByTimeAsync(1600)
      expect(calls).toHaveLength(0)
    })

    it('does not ask twice about the same screen', async () => {
      const calls: string[] = []
      tracker = new StateTracker({ remote: remoteReturning({ state: 'waiting', confidence: 0.9, source: 'jev' }, calls) })
      tracker.track('p::a', 'codex')
      tracker.output('p::a', 'hello')
      await vi.advanceTimersByTimeAsync(1600)
      tracker.output('p::a', '')
      await vi.advanceTimersByTimeAsync(1600)
      expect(calls).toHaveLength(1)
    })

    it('sends the screen a terminal would show, with the letters a redraw jumped over', async () => {
      const screens: (string | undefined)[] = []
      const remote: StateClassifier = { name: 'fake', classify: async (input) => { screens.push(input.screen); return { state: 'waiting', confidence: 0.9, source: 'jev' } } }
      tracker = new StateTracker({ remote })
      tracker.track('p::a', 'codex')
      tracker.output('p::a', 'ask the user to confirm\r\n')
      tracker.output('p::a', '\x1b[1Aask\x1b[5Gt\x1b[7Ge user to co\x1b[20Gfirm')
      await vi.advanceTimersByTimeAsync(1600)
      expect(screens).toEqual(['ask the user to confirm'])
    })

    it('reads the screen at the size the terminal was resized to', async () => {
      const screens: (string | undefined)[] = []
      const remote: StateClassifier = { name: 'fake', classify: async (input) => { screens.push(input.screen); return { state: 'waiting', confidence: 0.9, source: 'jev' } } }
      tracker = new StateTracker({ remote })
      tracker.track('p::a', 'codex')
      tracker.resize('p::a', 10, 5)
      // a jump past the last column stops at it
      tracker.output('p::a', 'a\x1b[40Gz')
      await vi.advanceTimersByTimeAsync(1600)
      expect(screens).toEqual(['a        z'])
    })

    it('drops a remote answer that arrives after new output', async () => {
      let release: (c: Classification) => void = () => {}
      const remote: StateClassifier = { name: 'slow', classify: () => new Promise(r => { release = r }) }
      tracker = new StateTracker({ remote })
      tracker.track('p::a', 'codex')
      tracker.output('p::a', 'hello')
      await vi.advanceTimersByTimeAsync(1600)
      tracker.output('p::a', 'more')
      release({ state: 'error', confidence: 0.99, source: 'jev' })
      await vi.advanceTimersByTimeAsync(0)
      expect(tracker.snapshot()['p::a'].state).not.toBe('error')
    })

    it('records every call with the local answer, the remote one and what happened to it', async () => {
      const calls: RemoteCall[] = []
      tracker = new StateTracker({ remote: remoteReturning({ state: 'waiting', confidence: 0.88, source: 'jev' }), onRemote: c => calls.push(c) })
      tracker.track('p::a', 'codex')
      tracker.output('p::a', 'hello')
      await vi.advanceTimersByTimeAsync(1600)
      expect(calls).toEqual([expect.objectContaining({
        key: 'p::a', harness: 'codex', screen: 'hello', outcome: 'applied', error: null,
        local: expect.objectContaining({ state: 'idle' }), remote: expect.objectContaining({ state: 'waiting', confidence: 0.88 }),
      })])
    })

    it('records low confidence, stale and failed calls', async () => {
      const calls: RemoteCall[] = []
      tracker = new StateTracker({ remote: remoteReturning({ state: 'error', confidence: 0.4, source: 'jev' }), onRemote: c => calls.push(c) })
      tracker.track('p::a', 'codex')
      tracker.output('p::a', 'hello')
      await vi.advanceTimersByTimeAsync(1600)

      let release: (c: Classification) => void = () => {}
      const slow = new StateTracker({ remote: { name: 'slow', classify: () => new Promise(r => { release = r }) }, onRemote: c => calls.push(c) })
      slow.track('p::b', 'codex')
      slow.output('p::b', 'hello')
      await vi.advanceTimersByTimeAsync(1600)
      slow.output('p::b', 'more')
      release({ state: 'waiting', confidence: 0.99, source: 'jev' })
      await vi.advanceTimersByTimeAsync(0)
      slow.dispose()

      const failing = new StateTracker({ remote: remoteReturning(new Error('Jev answered 500')), onRemote: c => calls.push(c) })
      failing.track('p::c', 'codex')
      failing.output('p::c', 'hello')
      await vi.advanceTimersByTimeAsync(1600)
      failing.dispose()

      expect(calls.map(c => c.outcome)).toEqual(['low-confidence', 'stale', 'failed'])
      expect(calls[2]).toMatchObject({ remote: null, error: 'Jev answered 500' })
    })

    describe('in shadow mode', () => {
      it('asks about screens the local rules are sure of, errors included, and records the answer', async () => {
        const texts: string[] = []
        const calls: RemoteCall[] = []
        tracker = new StateTracker({ remote: remoteReturning({ state: 'idle', confidence: 0.9, source: 'jev' }, texts), shadow: true, onRemote: c => calls.push(c) })
        tracker.track('p::a', 'claude')
        tracker.output('p::a', PERMISSION)
        await vi.advanceTimersByTimeAsync(1600)
        tracker.output('p::a', '\n⎿ API Error: 529 overloaded\n❯ ')
        await vi.advanceTimersByTimeAsync(1600)
        expect(texts).toHaveLength(2)
        expect(calls.map(c => [c.local.state, c.outcome])).toEqual([['permission', 'shadow'], ['error', 'shadow']])
      })

      it('never applies the remote answer', async () => {
        tracker = new StateTracker({ remote: remoteReturning({ state: 'error', confidence: 0.99, source: 'jev' }), shadow: true })
        tracker.track('p::a', 'codex')
        tracker.output('p::a', 'hello')
        await vi.advanceTimersByTimeAsync(1600)
        expect(tracker.snapshot()['p::a']).toMatchObject({ state: 'idle', source: 'local' })
        expect(tracker.isShadow).toBe(true)
      })

      it('still skips empty and repeated screens', async () => {
        const texts: string[] = []
        tracker = new StateTracker({ remote: remoteReturning({ state: 'waiting', confidence: 0.9, source: 'jev' }, texts), shadow: true })
        tracker.track('p::a', 'claude')
        await vi.advanceTimersByTimeAsync(1600)
        tracker.output('p::a', DONE)
        await vi.advanceTimersByTimeAsync(1600)
        tracker.output('p::a', '')
        await vi.advanceTimersByTimeAsync(1600)
        expect(texts).toEqual([DONE])
      })
    })
  })
})

describe('remoteClassifierFromEnv', () => {
  it('stays local unless Jev is asked for', () => {
    expect(remoteClassifierFromEnv({ TYPESAFE_API_KEY: 'k', FORGE_JEV_SHADOW: '1' })).toEqual({ remote: null, shadow: false, warning: null })
  })

  it('warns when Jev is asked for without a key', () => {
    const { remote, warning } = remoteClassifierFromEnv({ FORGE_STATE_CLASSIFIER: 'jev' })
    expect(remote).toBeNull()
    expect(warning).toMatch(/TYPESAFE_API_KEY/)
  })

  it('builds the Jev classifier when both are set', () => {
    expect(remoteClassifierFromEnv({ FORGE_STATE_CLASSIFIER: 'jev', TYPESAFE_API_KEY: 'k' })).toMatchObject({ remote: { name: 'jev' }, shadow: false })
  })

  it('turns shadow mode on with FORGE_JEV_SHADOW=1', () => {
    expect(remoteClassifierFromEnv({ FORGE_STATE_CLASSIFIER: 'jev', TYPESAFE_API_KEY: 'k', FORGE_JEV_SHADOW: '1' }).shadow).toBe(true)
  })
})

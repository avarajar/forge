import { type FunctionComponent } from 'preact'
import { useState } from 'preact/hooks'
import { ActionButton, Drawer, Modal, Tabs, showToast } from '@forge-dev/ui'
import type { KiokuBrain } from '@forge-dev/core'
import { Field, inputValue } from './Field.js'
import { errorText, postJson } from '../config/api.js'
import { pageNote as note, soft } from '../config/types.js'
import { brainName, kioku, loadKioku } from '../hooks/useKioku.js'

const TIERS = [
  { id: 'project', label: 'Project' },
  { id: 'team', label: 'Team' },
  { id: 'personal', label: 'Personal' },
]

// "new" in a brain select means the repo typed beside it
const NEW = '__new'

// posts, refreshes the store and closes; kioku's refusal becomes a toast
async function submit(url: string, body: unknown, done: string, onClose: () => void): Promise<void> {
  try {
    await postJson(url, body)
    showToast(done, 'success')
    void loadKioku(true)
    onClose()
  } catch (err) {
    showToast(errorText(err), 'error')
  }
}

const brainsOf = (tiers: string[]): KiokuBrain[] => (kioku.value?.brains ?? []).filter(b => b.onDisk && tiers.includes(b.tier ?? ''))

const LocalNote: FunctionComponent = () => (
  <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
    Kioku makes it on this machine only, with no repository. Publish on its card gives it one.
  </p>
)

export const NewBrain: FunctionComponent<{ onClose: () => void }> = ({ onClose }) => {
  const [repo, setRepo] = useState('')
  const [tier, setTier] = useState('project')
  const [team, setTeam] = useState('')
  const [language, setLanguage] = useState('')
  const teams = brainsOf(['team'])

  return (
    <Drawer title="New brain" onClose={onClose}>
      <div class="flex">
        <Tabs size="sm" label="Tier" tabs={TIERS} active={tier} onChange={setTier} />
      </div>
      <Field label="Repository · owner/repo, the one it gets once published">
        <input type="text" class="field" value={repo} placeholder="monoku/brain-shop" onInput={(e) => setRepo(inputValue(e))} />
      </Field>
      {tier === 'project' && teams.length > 0 && <BrainPick label="Team brain" brains={teams} value={team} onValue={setTeam} />}
      <Field label="Language of its pages · optional">
        <input type="text" class="field" value={language} placeholder="en" onInput={(e) => setLanguage(inputValue(e))} />
      </Field>
      <LocalNote />
      <div class="flex justify-end" style={{ gap: '8px' }}>
        <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
        <ActionButton label="Create" variant="primary" disabled={!repo.trim()} onClick={() => submit('/api/kioku/brains', { repo, tier, team, language }, `Made ${repo.trim()}`, onClose)} />
      </div>
    </Drawer>
  )
}

interface BrainPickProps {
  label: string
  brains: KiokuBrain[]
  value: string
  onValue: (v: string) => void
  // with these, New brain… shows a field for the repo of one to make
  repo?: string
  placeholder?: string
  onRepo?: (v: string) => void
}

// a brain select with its existing brains, none, or a new one typed in
const BrainPick: FunctionComponent<BrainPickProps> = ({ label, brains, value, onValue, repo, placeholder, onRepo }) => (
  <>
    <Field label={label}>
      <select class="field" value={value} onChange={(e) => onValue(inputValue(e))}>
        <option value="">None</option>
        {brains.map(b => <option key={b.key} value={b.key}>{brainName(b)}</option>)}
        {onRepo && <option value={NEW}>New brain…</option>}
      </select>
    </Field>
    {onRepo && value === NEW && <input type="text" class="field" value={repo} placeholder={placeholder} onInput={(e) => onRepo(inputValue(e))} />}
  </>
)

export const LinkBrain: FunctionComponent<{ project: string; onClose: () => void }> = ({ project, onClose }) => {
  const [brain, setBrain] = useState(NEW)
  const [brainRepo, setBrainRepo] = useState('')
  const [team, setTeam] = useState('')
  const [teamRepo, setTeamRepo] = useState('')
  const pick = (value: string, repo: string) => (value === NEW ? repo.trim() : value)
  const chosen = { brain: pick(brain, brainRepo), team: pick(team, teamRepo) }

  return (
    <Drawer title={`A brain for ${project}`} onClose={onClose}>
      <BrainPick label="Project brain" brains={brainsOf(['project', 'client'])} value={brain} repo={brainRepo} placeholder={`monoku/brain-${project}`} onValue={setBrain} onRepo={setBrainRepo} />
      <BrainPick label="Team brain" brains={brainsOf(['team'])} value={team} repo={teamRepo} placeholder="monoku/brain" onValue={setTeam} onRepo={setTeamRepo} />
      <p style={{ ...note, background: soft('--orange') }}>
        Kioku writes <code>kioku.yaml</code> at the root of {project}'s repository, naming these brains. Commit it with the code so every clone loads them.
      </p>
      {(brain === NEW || team === NEW) && <LocalNote />}
      <div class="flex justify-end" style={{ gap: '8px' }}>
        <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
        <ActionButton label="Link" variant="primary" disabled={!chosen.brain && !chosen.team} onClick={() => submit('/api/kioku/link', { project, ...chosen }, `Linked ${project}`, onClose)} />
      </div>
    </Drawer>
  )
}

export const AreaForm: FunctionComponent<{ brain: KiokuBrain; onClose: () => void }> = ({ brain, onClose }) => {
  const [area, setArea] = useState('')
  const [summary, setSummary] = useState('')
  return (
    <Modal open title={`New area in ${brainName(brain)}`} onClose={onClose}>
      <div class="flex flex-col" style={{ gap: '12px' }}>
        <Field label="Area · a path such as payments or payments/refunds">
          <input type="text" class="field" value={area} placeholder="payments" onInput={(e) => setArea(inputValue(e))} />
        </Field>
        <Field label="What it is for · the agent reads it to choose where a page goes">
          <input type="text" class="field" value={summary} placeholder="How money comes in and goes out" onInput={(e) => setSummary(inputValue(e))} />
        </Field>
        {brain.namespaces.length > 0 && <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>Areas now: {brain.namespaces.join(', ')}</p>}
        <div class="flex justify-end" style={{ gap: '8px' }}>
          <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
          <ActionButton label="Add area" variant="primary" disabled={!area.trim() || !summary.trim()} onClick={() => submit('/api/kioku/areas', { brain: brain.key, area, summary }, `Added ${area.trim()} to ${brainName(brain)}`, onClose)} />
        </div>
      </div>
    </Modal>
  )
}

export const PublishBrain: FunctionComponent<{ brain: KiokuBrain; onClose: () => void }> = ({ brain, onClose }) => {
  const [to, setTo] = useState('')
  const [understood, setUnderstood] = useState(false)
  const name = brainName(brain)
  return (
    <Modal open title={`Publish ${name}`} onClose={onClose}>
      <div class="flex flex-col" style={{ gap: '12px' }}>
        <div style={{ ...note, background: soft('--red') }}>
          <p style={{ fontWeight: 600, marginBottom: '4px' }}>This puts every page of {name} on a git host.</p>
          <p>Publishing a brain may need approval first, from your team, a client or your company. Whether it does, and whether you have it, is your call and your responsibility; Forge and kioku do not check.</p>
        </div>
        <Field label="Repository address · optional">
          <input type="text" class="field" value={to} placeholder="git@github.com:owner/repo.git" onInput={(e) => setTo(inputValue(e))} />
        </Field>
        <p style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
          {to.trim()
            ? 'It must be an empty repository that already exists; kioku makes nothing there.'
            : <>Left empty, kioku makes a private GitHub repository for <code>{brain.key}</code> with <code>gh</code>, unless it exists.</>}
        </p>
        <label class="flex items-start cursor-pointer" style={{ gap: '8px', fontSize: '12.5px' }}>
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood((e.target as HTMLInputElement).checked)} style={{ marginTop: '2px' }} />
          <span>I have the approval this needs, or it needs none. Publishing {name} is my decision.</span>
        </label>
        <div class="flex justify-end" style={{ gap: '8px' }}>
          <ActionButton label="Cancel" variant="secondary" onClick={onClose} />
          <ActionButton label="Publish" variant="destructive" disabled={!understood} onClick={() => submit('/api/kioku/publish', { brain: brain.key, to, understood }, `Published ${name}`, onClose)} />
        </div>
      </div>
    </Modal>
  )
}

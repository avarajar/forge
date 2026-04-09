import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { CWReader } from './cw-reader.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const TEST_CW = join(import.meta.dirname, '../.test-cw')

describe('CWReader', () => {
  let reader: CWReader

  beforeEach(() => {
    mkdirSync(join(TEST_CW, 'sessions/myapp/task-fix-bug'), { recursive: true })
    mkdirSync(join(TEST_CW, 'sessions/myapp/review-pr-42'), { recursive: true })
    mkdirSync(join(TEST_CW, 'accounts/default'), { recursive: true })

    writeFileSync(join(TEST_CW, 'projects.json'), JSON.stringify({
      myapp: { path: '/tmp/myapp', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' },
      other: { path: '/tmp/other', account: 'default', type: 'fullstack', registered: '2026-01-02T00:00:00Z' }
    }))

    writeFileSync(join(TEST_CW, 'config.yaml'), `default_account: default\nskip_permissions: true\n`)

    writeFileSync(join(TEST_CW, 'sessions/myapp/task-fix-bug/session.json'), JSON.stringify({
      project: 'myapp', task: 'fix-bug', type: 'task', account: 'default',
      workflow: 'bugfix', worktree: '/tmp/myapp/.tasks/fix-bug',
      notes: join(TEST_CW, 'sessions/myapp/task-fix-bug/TASK_NOTES.md'),
      source: '', source_url: '', status: 'active',
      created: '2026-04-01T10:00:00Z', last_opened: '2026-04-02T15:00:00Z', opens: 3
    }))

    writeFileSync(join(TEST_CW, 'sessions/myapp/task-fix-bug/TASK_NOTES.md'), '# Fix Bug\nNotes here')

    writeFileSync(join(TEST_CW, 'sessions/myapp/review-pr-42/session.json'), JSON.stringify({
      project: 'myapp', pr: '42', type: 'review', account: 'default',
      worktree: '/tmp/myapp/.reviews/pr-42',
      notes: join(TEST_CW, 'sessions/myapp/review-pr-42/REVIEW_NOTES.md'),
      status: 'done', created: '2026-03-30T10:00:00Z', last_opened: '2026-03-30T10:00:00Z',
      opens: 1, closed: '2026-03-31T10:00:00Z'
    }))

    reader = new CWReader(TEST_CW)
  })

  afterEach(() => {
    rmSync(TEST_CW, { recursive: true, force: true })
  })

  it('reads projects', () => {
    const projects = reader.getProjects()
    expect(Object.keys(projects)).toHaveLength(2)
    expect(projects.myapp.path).toBe('/tmp/myapp')
  })

  it('reads all spaces (sessions)', () => {
    const spaces = reader.getSpaces()
    expect(spaces).toHaveLength(2)
    const task = spaces.find(s => s.type === 'task')
    expect(task?.task).toBe('fix-bug')
    expect(task?.status).toBe('active')
  })

  it('reads spaces filtered by project', () => {
    const spaces = reader.getSpaces('myapp')
    expect(spaces).toHaveLength(2)
  })

  it('reads single session', () => {
    const session = reader.getSession('myapp', 'task-fix-bug')
    expect(session?.task).toBe('fix-bug')
    expect(session?.opens).toBe(3)
  })

  it('reads session notes', () => {
    const notes = reader.getNotes('myapp', 'task-fix-bug')
    expect(notes).toContain('Fix Bug')
  })

  it('returns null for missing session', () => {
    const session = reader.getSession('myapp', 'task-nonexistent')
    expect(session).toBeNull()
  })

  it('reads notes from TASK_NOTES.md when session.json does not exist yet', () => {
    // Simulate a freshly started task: TASK_NOTES.md exists but session.json hasn't been created yet
    mkdirSync(join(TEST_CW, 'sessions/myapp/task-new'), { recursive: true })
    writeFileSync(join(TEST_CW, 'sessions/myapp/task-new/TASK_NOTES.md'), '# Task: new\n\n## Description\nSome bug description\n')
    const notes = reader.getNotes('myapp', 'task-new')
    expect(notes).toContain('Some bug description')
  })

  it('reads notes from REVIEW_NOTES.md when session.json does not exist yet', () => {
    mkdirSync(join(TEST_CW, 'sessions/myapp/review-pr-99'), { recursive: true })
    writeFileSync(join(TEST_CW, 'sessions/myapp/review-pr-99/REVIEW_NOTES.md'), '# Review: pr-99\n\n## Description\nReview notes here\n')
    const notes = reader.getNotes('myapp', 'review-pr-99')
    expect(notes).toContain('Review notes here')
  })

  it('reads accounts', () => {
    const accounts = reader.getAccounts()
    expect(accounts).toContain('default')
  })

  it('detects project stack', () => {
    mkdirSync('/tmp/myapp', { recursive: true })
    writeFileSync('/tmp/myapp/package.json', '{"dependencies":{"react":"18"}}')
    writeFileSync('/tmp/myapp/vitest.config.ts', '')
    const detection = reader.detectStack('myapp')
    expect(detection.hasPackageJson).toBe(true)
    expect(detection.hasTests).toBe(true)
    rmSync('/tmp/myapp', { recursive: true, force: true })
  })
})

describe('Skills', () => {
  const TEST_HOME = join(import.meta.dirname, '../.test-home')
  const TEST_CW2 = join(import.meta.dirname, '../.test-cw2')

  const GLOBAL_SKILL_MD = `---
name: my-global-skill
description: A global skill for testing
domain: testing
triggers: when testing
---
# My Global Skill

This is the skill body.
`

  const ACCOUNT_SKILL_MD = `---
name: my-account-skill
description: An account-scoped skill
domain: workflow
---
# Account Skill Body
`

  const PROJECT_SKILL_MD = `---
name: my-project-skill
description: A project-scoped skill
---
# Project Skill Body
`

  let reader: CWReader
  let origHome: string | undefined

  beforeAll(() => {
    origHome = process.env.HOME

    // Global skill: TEST_HOME/.claude/skills/my-global-skill/
    const globalSkillDir = join(TEST_HOME, '.claude', 'skills', 'my-global-skill')
    mkdirSync(globalSkillDir, { recursive: true })
    writeFileSync(join(globalSkillDir, 'SKILL.md'), GLOBAL_SKILL_MD)

    const globalRefsDir = join(globalSkillDir, 'references')
    mkdirSync(globalRefsDir, { recursive: true })
    writeFileSync(join(globalRefsDir, 'ref-one.md'), '# Reference One\nSome reference content.')

    // Account skill: TEST_CW2/accounts/default/skills/my-account-skill/
    const accountSkillDir = join(TEST_CW2, 'accounts', 'default', 'skills', 'my-account-skill')
    mkdirSync(accountSkillDir, { recursive: true })
    writeFileSync(join(accountSkillDir, 'SKILL.md'), ACCOUNT_SKILL_MD)

    // Project skill: /tmp/myapp2/.claude/skills/my-project-skill/
    const projectSkillDir = '/tmp/myapp2/.claude/skills/my-project-skill'
    mkdirSync(projectSkillDir, { recursive: true })
    writeFileSync(join(projectSkillDir, 'SKILL.md'), PROJECT_SKILL_MD)

    // projects.json for TEST_CW2
    mkdirSync(TEST_CW2, { recursive: true })
    writeFileSync(join(TEST_CW2, 'projects.json'), JSON.stringify({
      myapp2: { path: '/tmp/myapp2', account: 'default', type: 'fullstack', registered: '2026-01-01T00:00:00Z' }
    }))

    process.env.HOME = TEST_HOME
    reader = new CWReader(TEST_CW2)
  })

  afterAll(() => {
    process.env.HOME = origHome
    rmSync(TEST_HOME, { recursive: true, force: true })
    rmSync(TEST_CW2, { recursive: true, force: true })
    rmSync('/tmp/myapp2', { recursive: true, force: true })
  })

  it('getSkillDir returns correct path for global scope', () => {
    const dir = reader.getSkillDir('global', 'global', 'my-global-skill')
    expect(dir).toBe(join(TEST_HOME, '.claude', 'skills', 'my-global-skill'))
  })

  it('getSkillDir returns correct path for account scope', () => {
    const dir = reader.getSkillDir('account', 'default', 'my-account-skill')
    expect(dir).toBe(join(TEST_CW2, 'accounts', 'default', 'skills', 'my-account-skill'))
  })

  it('getSkillDir returns correct path for project scope', () => {
    const dir = reader.getSkillDir('project', 'myapp2', 'my-project-skill')
    expect(dir).toBe('/tmp/myapp2/.claude/skills/my-project-skill')
  })

  it('getSkills returns global skills', () => {
    const skills = reader.getSkills()
    expect(skills).toHaveLength(1)
    const skill = skills[0]
    expect(skill.name).toBe('my-global-skill')
    expect(skill.scope).toBe('global')
    expect(skill.scopeRef).toBe('global')
    expect(skill.description).toBe('A global skill for testing')
    expect(skill.domain).toBe('testing')
    expect(skill.triggers).toBe('when testing')
    expect(skill.hasReferences).toBe(true)
  })

  it('getSkills includes account skills when account provided', () => {
    const skills = reader.getSkills('default')
    const names = skills.map(s => s.name)
    expect(names).toContain('my-global-skill')
    expect(names).toContain('my-account-skill')
    const acct = skills.find(s => s.name === 'my-account-skill')
    expect(acct?.scope).toBe('account')
    expect(acct?.scopeRef).toBe('default')
    expect(acct?.hasReferences).toBe(false)
  })

  it('getSkills includes project skills when project provided', () => {
    const skills = reader.getSkills(undefined, 'myapp2')
    const names = skills.map(s => s.name)
    expect(names).toContain('my-global-skill')
    expect(names).toContain('my-project-skill')
    const proj = skills.find(s => s.name === 'my-project-skill')
    expect(proj?.scope).toBe('project')
    expect(proj?.scopeRef).toBe('myapp2')
  })

  it('getSkill returns full detail for global skill', () => {
    const detail = reader.getSkill('global', 'global', 'my-global-skill')
    expect(detail).not.toBeNull()
    expect(detail!.name).toBe('my-global-skill')
    expect(detail!.scope).toBe('global')
    expect(detail!.body).toContain('This is the skill body.')
    expect(detail!.references).toHaveLength(1)
    expect(detail!.references[0].name).toBe('ref-one.md')
    expect(detail!.references[0].content).toContain('Reference One')
    expect(detail!.frontmatter['description']).toBe('A global skill for testing')
  })

  it('getSkill returns full detail for account skill', () => {
    const detail = reader.getSkill('account', 'default', 'my-account-skill')
    expect(detail).not.toBeNull()
    expect(detail!.name).toBe('my-account-skill')
    expect(detail!.body).toContain('Account Skill Body')
    expect(detail!.references).toHaveLength(0)
  })

  it('getSkill returns null for missing skill', () => {
    const detail = reader.getSkill('global', 'global', 'nonexistent')
    expect(detail).toBeNull()
  })
})

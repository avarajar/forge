import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ForgeDB } from './db.js'
import { rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const TEST_DIR = join(import.meta.dirname, '../.test-data')

describe('ForgeDB', () => {
  let db: ForgeDB

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true })
    db = new ForgeDB(join(TEST_DIR, 'test.db'))
  })

  afterEach(() => {
    db.close()
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('creates tables on init', () => {
    const tables = db.listTables()
    expect(tables).toContain('projects')
    expect(tables).toContain('modules')
    expect(tables).toContain('action_logs')
  })

  it('adds and retrieves a project', () => {
    db.addProject({ name: 'test-app', path: '/tmp/test-app' })
    const projects = db.listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0].name).toBe('test-app')
    expect(projects[0].path).toBe('/tmp/test-app')
  })

  it('removes a project', () => {
    db.addProject({ name: 'test-app', path: '/tmp/test-app' })
    const projects = db.listProjects()
    db.removeProject(projects[0].id)
    expect(db.listProjects()).toHaveLength(0)
  })

  it('adds and retrieves a module', () => {
    db.addModule({ name: '@forge-dev/mod-qa', version: '1.0.0' })
    const modules = db.listModules()
    expect(modules).toHaveLength(1)
    expect(modules[0].name).toBe('@forge-dev/mod-qa')
    expect(modules[0].enabled).toBe(true)
  })

  it('logs an action', () => {
    db.addProject({ name: 'test', path: '/tmp/test' })
    const project = db.listProjects()[0]
    const logId = db.logAction({
      projectId: project.id,
      moduleId: 'mod-qa',
      actionId: 'run-e2e',
      command: 'npx playwright test'
    })
    const log = db.getActionLog(logId)
    expect(log?.command).toBe('npx playwright test')
    expect(log?.exitCode).toBeNull()
  })

  it('completes an action log', () => {
    db.addProject({ name: 'test', path: '/tmp/test' })
    const project = db.listProjects()[0]
    const logId = db.logAction({
      projectId: project.id,
      moduleId: 'mod-qa',
      actionId: 'run-e2e',
      command: 'npx playwright test'
    })
    db.completeAction(logId, 0)
    const log = db.getActionLog(logId)
    expect(log?.exitCode).toBe(0)
    expect(log?.finishedAt).toBeTruthy()
  })

  describe('module settings', () => {
    it('stores and retrieves settings', () => {
      db.setModuleSetting('mod-test', 'apiKey', 'abc123')
      db.setModuleSetting('mod-test', 'enabled', 'true')
      const settings = db.getModuleSettings('mod-test')
      expect(settings).toEqual({ apiKey: 'abc123', enabled: 'true' })
    })

    it('overwrites existing setting', () => {
      db.setModuleSetting('mod-test', 'port', '3000')
      db.setModuleSetting('mod-test', 'port', '8080')
      const settings = db.getModuleSettings('mod-test')
      expect(settings.port).toBe('8080')
    })

    it('returns empty object for unknown module', () => {
      const settings = db.getModuleSettings('nonexistent')
      expect(settings).toEqual({})
    })
  })

  describe('action log queries', () => {
    it('lists action logs ordered by recency', () => {
      db.addProject({ name: 'proj', path: '/tmp/proj' })
      const projects = db.listProjects()
      const pid = projects[0].id

      db.logAction({ projectId: pid, moduleId: 'mod-a', actionId: 'run', command: 'echo 1' })
      db.logAction({ projectId: pid, moduleId: 'mod-b', actionId: 'test', command: 'echo 2' })

      const logs = db.listActionLogs({})
      expect(logs).toHaveLength(2)
      expect(logs[0].moduleId).toBe('mod-b')
    })

    it('filters by moduleId', () => {
      db.addProject({ name: 'proj2', path: '/tmp/proj2' })
      const projects = db.listProjects()
      const pid = projects[0].id

      db.logAction({ projectId: pid, moduleId: 'mod-x', actionId: 'a', command: 'echo x' })
      db.logAction({ projectId: pid, moduleId: 'mod-y', actionId: 'b', command: 'echo y' })

      const logs = db.listActionLogs({ moduleId: 'mod-x' })
      expect(logs).toHaveLength(1)
      expect(logs[0].moduleId).toBe('mod-x')
    })

    it('respects limit', () => {
      db.addProject({ name: 'proj3', path: '/tmp/proj3' })
      const projects = db.listProjects()
      const pid = projects[0].id

      for (let i = 0; i < 5; i++) {
        db.logAction({ projectId: pid, moduleId: 'mod-z', actionId: `a${i}`, command: `echo ${i}` })
      }

      const logs = db.listActionLogs({ limit: 3 })
      expect(logs).toHaveLength(3)
    })
  })
})

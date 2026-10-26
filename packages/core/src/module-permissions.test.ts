import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { expandGrants, allowsOrigin, allowsPath, allowsCommand } from './module-permissions.js'

const permissions = {
  network: ['http://localhost:{instances[].port}'],
  'fs:read': ['{instances[].path}/data/dashboard-token'],
  shell: ['{bin}'],
}

describe('expandGrants', () => {
  it('expands one grant per list item', () => {
    const grants = expandGrants(permissions, { instances: [{ path: '/a', port: 5555 }, { path: '/b', port: 5556 }], bin: 'harvey' })
    expect(grants.network).toEqual(['http://localhost:5555', 'http://localhost:5556'])
    expect(grants.fsRead).toEqual(['/a/data/dashboard-token', '/b/data/dashboard-token'])
    expect(grants.shell).toEqual(['harvey'])
  })

  it('drops a grant whose template resolves to nothing', () => {
    const grants = expandGrants(permissions, { instances: [] })
    expect(grants).toEqual({ network: [], fsRead: [], fsWrite: [], shell: [], pty: false })
  })

  it('drops an item whose field is unset', () => {
    const grants = expandGrants(permissions, { instances: [{ path: '/a' }] })
    expect(grants.network).toEqual([])
    expect(grants.fsRead).toEqual(['/a/data/dashboard-token'])
  })

  it('expands ~ to the home folder', () => {
    expect(expandGrants({ 'fs:read': ['~/x'] }, {}).fsRead).toEqual([join(homedir(), 'x')])
  })

  it('keeps pty only when declared true', () => {
    expect(expandGrants({ pty: true }, {}).pty).toBe(true)
  })

  it('drops a host value that would change the origin', () => {
    for (const tenant of ['evil.com#', 'evil.com/', 'evil.com?', 'a@evil.com', 'evil.com\\']) {
      expect(expandGrants({ network: ['https://{tenant}.api.acme.com'] }, { tenant }).network).toEqual([])
    }
    expect(expandGrants({ network: ['https://{tenant}.api.acme.com'] }, { tenant: 'clinic' }).network).toEqual(['https://clinic.api.acme.com'])
  })

  it('drops a path value that climbs out of the literal part', () => {
    expect(expandGrants({ 'fs:read': ['~/.harvey/{name}/'] }, { name: '..' }).fsRead).toEqual([])
    expect(expandGrants({ 'fs:read': ['/data/{name}/token'] }, { name: 'a/../../etc' }).fsRead).toEqual([])
    expect(expandGrants({ 'fs:read': ['{path}/data/token'] }, { path: '/Users/x/harvey' }).fsRead).toEqual(['/Users/x/harvey/data/token'])
  })

  it('never expands a template from a non-scalar value', () => {
    expect(expandGrants({ network: ['http://localhost:{port}'] }, { port: { a: 1 } }).network).toEqual([])
  })
})

describe('allowsOrigin', () => {
  const grants = expandGrants(permissions, { instances: [{ path: '/a', port: 5555 }] })

  it('allows any path on a granted origin', () => {
    expect(allowsOrigin(grants, 'http://localhost:5555/api/today?x=1')).toBe(true)
  })

  it('rejects another port', () => {
    expect(allowsOrigin(grants, 'http://localhost:5556/api/today')).toBe(false)
  })

  it('rejects another scheme and a malformed url', () => {
    expect(allowsOrigin(grants, 'https://localhost:5555/')).toBe(false)
    expect(allowsOrigin(grants, 'not a url')).toBe(false)
  })

  it('rejects a userinfo trick', () => {
    expect(allowsOrigin(grants, 'http://localhost:5555@evil.com/')).toBe(false)
  })
})

describe('allowsPath', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-perm-'))
    mkdirSync(join(root, 'granted/data'), { recursive: true })
    mkdirSync(join(root, 'secret'))
    writeFileSync(join(root, 'granted/data/dashboard-token'), 'tok')
    writeFileSync(join(root, 'granted/data/other'), 'x')
    writeFileSync(join(root, 'secret/key'), 'k')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('allows the exact granted file', async () => {
    expect(await allowsPath([join(root, 'granted/data/dashboard-token')], join(root, 'granted/data/dashboard-token'))).toBe(true)
  })

  it('does not allow a sibling of a granted file', async () => {
    expect(await allowsPath([join(root, 'granted/data/dashboard-token')], join(root, 'granted/data/other'))).toBe(false)
  })

  it('allows files under a granted folder', async () => {
    expect(await allowsPath([join(root, 'granted') + '/'], join(root, 'granted/data/other'))).toBe(true)
  })

  it('rejects .. that leaves a granted folder', async () => {
    expect(await allowsPath([join(root, 'granted') + '/'], join(root, 'granted/../secret/key'))).toBe(false)
  })

  it('rejects a path that escapes through a symlink', async () => {
    symlinkSync(join(root, 'secret'), join(root, 'granted/link'))
    expect(await allowsPath([join(root, 'granted') + '/'], join(root, 'granted/link/key'))).toBe(false)
  })

  it('allows a file that does not exist yet inside a granted folder', async () => {
    expect(await allowsPath([join(root, 'granted') + '/'], join(root, 'granted/new.txt'))).toBe(true)
  })
})

describe('allowsCommand', () => {
  it('allows only granted executables', () => {
    const grants = expandGrants({ shell: ['harvey', '/opt/bin/tool'] }, {})
    expect(allowsCommand(grants, 'harvey')).toBe(true)
    expect(allowsCommand(grants, '/opt/bin/tool')).toBe(true)
    expect(allowsCommand(grants, 'rm')).toBe(false)
  })
})

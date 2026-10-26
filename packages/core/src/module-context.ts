import { readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { PermissionError } from '@forge-dev/sdk'
import type { ForgeContext, GitStatus, ModuleSettings, SessionInfo } from '@forge-dev/sdk'
import type { IForgeDB } from './db-interface.js'
import type { ActionRunner } from './runner.js'
import type { CWReader } from './cw-reader.js'
import { allowsCommand, allowsOrigin, allowsPath, type Grants } from './module-permissions.js'

export interface ContextDeps {
  db: IForgeDB
  reader: CWReader
  runner: ActionRunner
  spawnPty?: (command: string, args: string[], opts: { cwd: string; name: string }) => Promise<{ sessionId: string }>
  fetch?: typeof fetch
  log?: Pick<Console, 'info' | 'warn' | 'error'>
}

export function createForgeContext(
  deps: ContextDeps,
  mod: { id: string; version: string },
  getSettings: () => ModuleSettings,
  getGrants: () => Grants,
  onDenial: (permission: string, value: string) => void,
): ForgeContext {
  const doFetch = deps.fetch ?? globalThis.fetch
  const log = deps.log ?? console
  const deny = (permission: string, value: string): never => {
    onDenial(permission, value)
    throw new PermissionError(permission, value)
  }
  const checkPath = async (permission: 'fs:read' | 'fs:write', path: string) => {
    const list = permission === 'fs:read' ? getGrants().fsRead : getGrants().fsWrite
    if (!(await allowsPath(list, path))) deny(permission, path)
  }
  const prefix = `[module ${mod.id}]`

  return {
    module: mod,
    get settings() { return getSettings() },
    sessions: {
      list: async () => deps.reader.getSpaces().map(toSessionInfo),
    },
    projects: {
      list: async () => Object.entries(deps.reader.getProjects()).map(([name, p]) => ({ name, path: p.path, account: p.account })),
      dir: async (name) => deps.reader.getProjects()[name]?.path ?? null,
    },
    accounts: {
      list: async () => deps.reader.getAccounts().map(name => ({ name })),
    },
    git: {
      status: async (project, sessionDir) => {
        const session = deps.reader.getSession(project, sessionDir)
        if (!session?.worktree) return { files: [] }
        const result = await deps.runner.spawn('git', ['status', '--porcelain=v1', '-b'], { cwd: session.worktree, timeout: 10_000 })
        return result.exitCode === 0 ? parseGitStatus(result.output) : { files: [] }
      },
    },
    storage: {
      get: async <T>(key: string) => {
        const raw = deps.db.kvGet(mod.id, key)
        return raw === undefined ? undefined : JSON.parse(raw) as T
      },
      set: async (key, value) => deps.db.kvSet(mod.id, key, JSON.stringify(value)),
      delete: async (key) => deps.db.kvDelete(mod.id, key),
      list: async (p) => deps.db.kvList(mod.id, p),
    },
    notify: {
      attention: async (n) => {
        deps.db.upsertNotification({ moduleId: mod.id, key: n.key, kind: 'attention', title: n.title, body: n.body, version: n.version })
      },
      badge: async (key, count, label) => {
        if (count <= 0) return deps.db.deleteNotification(mod.id, key)
        deps.db.upsertNotification({ moduleId: mod.id, key, kind: 'badge', title: label ?? '', count, label })
      },
      clear: async (key) => deps.db.deleteNotification(mod.id, key),
    },
    fetch: async (url, init) => {
      if (!allowsOrigin(getGrants(), url)) deny('network', url)
      return doFetch(url, init)
    },
    fs: {
      read: async (path) => {
        await checkPath('fs:read', path)
        return readFile(expandHome(path), 'utf-8')
      },
      list: async (dir) => {
        await checkPath('fs:read', dir.endsWith('/') ? dir : dir + '/')
        return readdir(expandHome(dir))
      },
      write: async (path, data) => {
        await checkPath('fs:write', path)
        await writeFile(expandHome(path), data)
      },
    },
    shell: {
      exec: async (command, args, opts) => {
        if (!allowsCommand(getGrants(), command)) deny('shell', command)
        return deps.runner.spawn(expandHome(command), args, { cwd: opts?.cwd ?? homedir(), timeout: opts?.timeoutMs })
      },
    },
    pty: {
      spawn: async (command, args, opts) => {
        if (!getGrants().pty) deny('pty', command)
        if (!deps.spawnPty) throw new Error('pty.spawn is not available in this Forge')
        return deps.spawnPty(command, args, opts)
      },
    },
    log: {
      info: (msg) => log.info(`${prefix} ${msg}`),
      warn: (msg) => log.warn(`${prefix} ${msg}`),
      error: (msg) => log.error(`${prefix} ${msg}`),
    },
  }
}

function expandHome(path: string): string {
  return path.startsWith('~/') ? homedir() + path.slice(1) : path
}

function toSessionInfo(s: ReturnType<CWReader['getSpaces']>[number]): SessionInfo {
  return {
    project: s.project,
    sessionDir: s.sessionDir ?? '',
    type: s.type,
    task: s.task,
    account: s.account,
    harness: s.harness,
    provider: s.provider,
    model: s.model,
    worktreePath: s.worktree,
  }
}

function parseGitStatus(output: string): GitStatus {
  const lines = output.split('\n').filter(Boolean)
  const status: GitStatus = { files: [] }
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const m = /^## ([^.\s]+)(?:\.\.\.\S+)?(?: \[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\])?/.exec(line)
      if (m) {
        status.branch = m[1]
        if (m[2]) status.ahead = Number(m[2])
        if (m[3]) status.behind = Number(m[3])
      }
    } else {
      status.files.push({ status: line.slice(0, 2).trim(), path: line.slice(3) })
    }
  }
  return status
}

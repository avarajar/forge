#!/usr/bin/env node
// Copies the CW commit pinned in cw.lock.json into packages/platform/cw, where the published
// package carries it and Forge installs it from on start (packages/core/src/cw-install.ts).
//
//   FORGE_CW_SOURCE  a clone or URL to read CW from instead of the repository in cw.lock.json
//   FORGE_CW_REF     a commit, tag or branch instead of the pinned ref

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const out = join(root, 'cw')
const lock = JSON.parse(readFileSync(join(root, 'cw.lock.json'), 'utf-8'))
const source = process.env.FORGE_CW_SOURCE || lock.repo
const ref = process.env.FORGE_CW_REF || lock.ref

// what CW's install.sh copies into ~/.cw, plus the installer itself
const PAYLOAD = ['cw', 'install.sh', 'cw-shell-integration.sh', 'lib', 'templates', 'agents', 'hooks', 'mcps']

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })

const tmp = mkdtempSync(join(tmpdir(), 'forge-cw-bundle-'))
try {
  git(tmp, 'clone', '--quiet', '--filter=blob:none', '--no-checkout', source, 'cw')
  const repo = join(tmp, 'cw')
  const sha = git(repo, 'rev-parse', '--verify', `${ref}^{commit}`).trim()
  const present = new Set(git(repo, 'ls-tree', '--name-only', sha).split('\n').filter(Boolean))
  const paths = PAYLOAD.filter(p => present.has(p))

  const installer = git(repo, 'show', `${sha}:install.sh`)
  if (!installer.includes('--no-shell')) {
    throw new Error(`CW ${sha.slice(0, 7)} has no install.sh --no-shell; Forge would edit the user's shell rc files`)
  }

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const archive = execFileSync('git', ['archive', '--format=tar', sha, ...paths], { cwd: repo, maxBuffer: 256 * 1024 * 1024 })
  execFileSync('tar', ['-x', '-C', out], { input: archive })
  writeFileSync(join(out, '.bundle.json'), JSON.stringify({ repo: lock.repo, ref: sha }, null, 2) + '\n')

  const version = /^CW_VERSION="([^"]+)"/m.exec(readFileSync(join(out, 'cw'), 'utf-8'))?.[1]
  console.log(`Bundled CW ${version ?? '?'} (${sha.slice(0, 7)}) into ${out}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

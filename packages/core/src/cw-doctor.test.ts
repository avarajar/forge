import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { createDoctorClient, envWithoutHarness, readContextTokens } from './cw-doctor.js'

const DIR = join(import.meta.dirname, '../.test-cw-doctor')
const FIXTURE = join(import.meta.dirname, '__fixtures__/cw-0.3.0/doctor-two-accounts.json')
const COUNT = join(DIR, 'count')

const fakeCw = (name: string, body: string): string => {
  const path = join(DIR, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`)
  chmodSync(path, 0o755)
  return path
}

const runs = () => existsSync(COUNT) ? readFileSync(COUNT, 'utf-8').trim().split('\n').length : 0

describe('cw doctor client', () => {
  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })
  })

  afterAll(() => rmSync(DIR, { recursive: true, force: true }))

  it('parses the captured CW 0.3.0 output', async () => {
    const result = await createDoctorClient(fakeCw('cw', `cat '${FIXTURE}'`)).get()
    expect(result.available).toBe(true)
    if (result.available) expect(result.doctor.accounts.map(a => a.default_harness)).toEqual(['codex', 'claude'])
  })

  it('is unavailable for an unknown schema', async () => {
    const result = await createDoctorClient(fakeCw('cw', `echo '{"schema":2}'`)).get()
    expect(result).toEqual({ available: false, reason: 'unsupported doctor schema 2' })
  })

  it('is unavailable when cw exits non-zero', async () => {
    const result = await createDoctorClient(fakeCw('cw', 'echo usage >&2; exit 1')).get()
    expect(result.available).toBe(false)
  })

  it('is unavailable when cw prints something other than JSON', async () => {
    const result = await createDoctorClient(fakeCw('cw', 'echo "Unknown command: doctor --json"')).get()
    expect(result).toEqual({ available: false, reason: 'cw doctor --json did not print JSON' })
  })

  it('is unavailable when the cw binary is missing', async () => {
    const result = await createDoctorClient(join(DIR, 'missing-cw')).get()
    expect(result.available).toBe(false)
  })

  it('runs one process for concurrent callers', async () => {
    const client = createDoctorClient(fakeCw('cw', `echo run >> '${COUNT}'; sleep 0.2; cat '${FIXTURE}'`))
    await Promise.all([client.get(), client.get(), client.get()])
    expect(runs()).toBe(1)
  })

  it('reuses a result for 2 s unless fresh is asked for', async () => {
    const client = createDoctorClient(fakeCw('cw', `echo run >> '${COUNT}'; cat '${FIXTURE}'`))
    await client.get()
    await client.get()
    expect(runs()).toBe(1)
    await client.get(true)
    expect(runs()).toBe(2)
  })

  it('never passes CW_HARNESS to cw', async () => {
    const previous = process.env.CW_HARNESS
    process.env.CW_HARNESS = 'codex'
    try {
      const client = createDoctorClient(fakeCw('cw', `[ -z "$CW_HARNESS" ] && cat '${FIXTURE}' || echo '{"schema":9}'`))
      expect((await client.get()).available).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.CW_HARNESS
      else process.env.CW_HARNESS = previous
    }
  })
})

describe('envWithoutHarness', () => {
  it('drops CW_HARNESS and undefined values only', () => {
    expect(envWithoutHarness({ PATH: '/bin', CW_HARNESS: 'pi', EMPTY: undefined })).toEqual({ PATH: '/bin' })
  })
})

describe('readContextTokens', () => {
  const HOME = join(import.meta.dirname, '../.test-cw-tokens')

  beforeEach(() => {
    rmSync(HOME, { recursive: true, force: true })
    mkdirSync(HOME, { recursive: true })
  })

  afterAll(() => rmSync(HOME, { recursive: true, force: true }))

  it('reads tokens from the environment', () => {
    expect(readContextTokens(HOME, { LINEAR_API_KEY: 'lin_x' })).toEqual({ linear: true, notion: false })
  })

  it('reads tokens from tokens.env, with or without export', () => {
    writeFileSync(join(HOME, 'tokens.env'), 'export NOTION_TOKEN=secret\n# LINEAR_API_KEY=commented\n')
    expect(readContextTokens(HOME, {})).toEqual({ linear: false, notion: true })
  })

  it('ignores empty values', () => {
    writeFileSync(join(HOME, 'tokens.env'), 'LINEAR_API_KEY=\n')
    expect(readContextTokens(HOME, { NOTION_TOKEN: '  ' })).toEqual({ linear: false, notion: false })
  })
})

// checks the built console shares Preact and ui through its import map, and a module view built against it inlines none of them
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'

const dist = join(import.meta.dirname, '../dist')
const SHARED = ['preact', 'preact/hooks', 'preact/jsx-runtime', 'preact/compat', '@preact/signals', '@forge-dev/ui', '@forge-dev/sdk']
// only Preact's core defines this; it appears once when Preact is bundled once
const PREACT_MARKER = 'prototype.forceUpdate='
const failures = []

const html = readFileSync(join(dist, 'index.html'), 'utf-8')
const mapText = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)?.[1]
const imports = mapText ? JSON.parse(mapText).imports : {}
for (const name of SHARED) {
  const url = imports[name]
  if (!url) failures.push(`import map has no entry for ${name}`)
  else if (!existsSync(join(dist, url))) failures.push(`${name} maps to ${url}, which the build did not produce`)
}

const jsFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? jsFiles(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [])
const withPreact = jsFiles(dist).filter(f => readFileSync(f, 'utf-8').includes(PREACT_MARKER))
if (withPreact.length !== 1) failures.push(`Preact's core is in ${withPreact.length} files, expected 1: ${withPreact.join(', ')}`)

const work = mkdtempSync(join(tmpdir(), 'forge-shared-'))
try {
  const entry = join(work, 'view.jsx')
  writeFileSync(entry, [
    "import { useState } from 'preact/hooks'",
    "import { Badge } from '@forge-dev/ui'",
    "import { definePanel } from '@forge-dev/sdk'",
    'function View() { const [n, setN] = useState(0); return <button onClick={() => setN(n + 1)}><Badge label={String(n)} /></button> }',
    "export default definePanel({ id: 'v', title: 'V', component: View })",
  ].join('\n'))
  await build({
    configFile: false,
    logLevel: 'silent',
    root: work,
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    build: { outDir: join(work, 'out'), lib: { entry, formats: ['es'], fileName: () => 'view.js' }, rollupOptions: { external: SHARED } },
  })
  const out = readFileSync(join(work, 'out/view.js'), 'utf-8')
  if (out.includes(PREACT_MARKER)) failures.push('the fixture view inlined Preact')
  const specifiers = [...out.matchAll(/from\s*["']([^"']+)["']/g)].map(m => m[1])
  for (const s of specifiers) if (!(s in imports)) failures.push(`the fixture view imports ${s}, which the import map does not provide`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (failures.length) {
  console.error(failures.map(f => `✗ ${f}`).join('\n'))
  process.exit(1)
}
console.log('✓ shared packages: one Preact, every import map entry built, module views stay external')

import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { MODULE_ID_RE, type ModuleStatus } from '@forge-dev/sdk'

const modulesDir = () => join(homedir(), '.forge', 'modules')
const api = (path: string) => `http://localhost:${process.env.FORGE_PORT ?? '3000'}/api/modules${path}`

// the running server rescans so the change shows without a restart; a stopped server scans on start
async function rescan(): Promise<ModuleStatus[] | null> {
  try {
    const res = await fetch(api('/rescan'), { method: 'POST' })
    return res.ok ? await res.json() as ModuleStatus[] : null
  } catch {
    return null
  }
}

function npm(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npm', args, { stdio: 'inherit' })
    child.on('close', code => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

async function ask(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim())
  } finally {
    rl.close()
  }
}

export function moduleCommand() {
  const cmd = new Command('module').description('Manage Forge modules')

  cmd
    .command('list')
    .description('List modules and whether they loaded')
    .action(async () => {
      let modules: ModuleStatus[]
      try {
        modules = await (await fetch(api(''))).json() as ModuleStatus[]
      } catch {
        console.log('Forge is not running. Start it with `forge console`.')
        process.exitCode = 1
        return
      }
      if (modules.length === 0) {
        console.log('No modules installed. Run `forge module install <name>` to install one.')
        return
      }
      for (const m of modules) {
        const reason = m.reason ? `  ${m.reason}` : ''
        console.log(`  ${m.id.padEnd(20)} ${m.version.padEnd(10)} ${m.source.padEnd(12)} ${m.state}${reason}`)
      }
    })

  cmd
    .command('install <spec>')
    .alias('add')
    .description('Install a module from npm, a folder or a git URL')
    .option('-y, --yes', 'install without asking')
    .action(async (spec: string, opts: { yes?: boolean }) => {
      const { previewManifest, describePermissions, installArgs, createRunner } = await import('@forge-dev/core')
      let preview
      try {
        preview = await previewManifest(spec, { cwd: process.cwd(), run: createRunner() })
      } catch (err) {
        console.error(`Cannot install ${spec}: ${(err as Error).message}`)
        process.exitCode = 1
        return
      }
      const m = preview.manifest
      console.log(`\n${m.displayName} (${m.name} ${m.version})${preview.kind === 'legacy' ? ' — legacy module' : ''}`)
      console.log(describePermissions(m) + '\n')
      if (!opts.yes && !(await ask('Install it? [y/N] '))) {
        console.log('Nothing installed.')
        return
      }
      const code = await npm(installArgs(spec, modulesDir()))
      if (code !== 0) {
        console.error(`npm install failed (exit ${code})`)
        process.exitCode = code
        return
      }
      const list = await rescan()
      const loaded = list?.find(s => s.name === m.name)
      if (!list) console.log(`Installed ${m.name}. Forge loads it the next time it starts.`)
      else if (loaded?.state === 'disabled') console.log(`Installed ${m.name}, but Forge disabled it: ${loaded.reason}`)
      else console.log(`Installed ${m.name}. Refresh the console to see it.`)
    })

  cmd
    .command('remove <module>')
    .description('Remove a module by id or package name')
    .action(async (target: string) => {
      let name = target
      try {
        const list = await (await fetch(api(''))).json() as ModuleStatus[]
        name = list.find(s => s.id === target || s.name === target)?.name ?? target
      } catch { /* server not running: treat the argument as the package name */ }
      const folder = join(modulesDir(), target)
      if (!target.includes('/') && existsSync(join(folder, 'forge-module.json'))) {
        rmSync(folder, { recursive: true, force: true })
      } else {
        const code = await npm(['uninstall', '--prefix', modulesDir(), name])
        if (code !== 0) {
          console.error(`npm uninstall ${name} failed (exit ${code})`)
          process.exitCode = code
          return
        }
      }
      await rescan()
      console.log(`Removed ${name}`)
    })

  cmd
    .command('create <name>')
    .description('Scaffold a module that builds, passes its tests and renders a view')
    .option('-d, --dir <dir>', 'parent folder', '.')
    .action((name: string, opts: { dir: string }) => {
      const unscoped = name.replace(/^@[^/]+\//, '')
      const id = unscoped.replace(/^(forge-)?mod-/, '').toLowerCase()
      if (!MODULE_ID_RE.test(id)) {
        console.error(`"${id}" cannot be a module id: lowercase letters, digits and dashes, 2 to 32 characters`)
        process.exitCode = 1
        return
      }
      const target = resolve(opts.dir, unscoped)
      if (existsSync(target)) {
        console.error(`${target} already exists`)
        process.exitCode = 1
        return
      }
      const pkgName = name.includes('/') || name.startsWith('mod-') || name.startsWith('forge-mod-') ? name : `forge-mod-${id}`
      const display = id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
      const { sdk, ui } = sdkVersions()
      cpSync(TEMPLATE, target, { recursive: true })
      const replace = (text: string) => text.replaceAll('__ID__', id).replaceAll('__NAME__', pkgName).replaceAll('__DISPLAY__', display).replaceAll('__SDK__', sdk).replaceAll('__UI__', ui)
      for (const file of files(target)) writeFileSync(file, replace(readFileSync(file, 'utf-8')))
      console.log(`Created ${pkgName} in ${target}\n`)
      console.log(`  cd ${relative(process.cwd(), target) || '.'}`)
      console.log('  npm install && npm test')
      console.log('  forge module dev .')
    })

  cmd
    .command('dev <path>')
    .description('Load a module from a folder, rebuild it on change and reload it in the running Forge')
    .action(async (path: string) => {
      const dir = resolve(path)
      let id: string
      try {
        id = (JSON.parse(readFileSync(join(dir, 'forge-module.json'), 'utf-8')) as { id?: string }).id ?? ''
      } catch {
        console.error(`${dir} has no forge-module.json`)
        process.exitCode = 1
        return
      }
      const send = (method: string, url: string, body?: unknown) =>
        fetch(api(url), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      let registered: { status?: ModuleStatus }
      try {
        registered = await (await send('POST', '/dev', { path: dir })).json() as { status?: ModuleStatus }
      } catch {
        console.error('Forge is not running. Start it with `forge console`, then run this again.')
        process.exitCode = 1
        return
      }
      const report = (s?: ModuleStatus) => console.log(s ? `${s.id}: ${s.state}${s.reason ? ` — ${s.reason}` : ''}` : `${id}: not loaded`)
      report(registered.status)

      const scripts = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }).scripts ?? {}
      const builder = scripts.dev ? spawn('npm', ['run', 'dev'], { cwd: dir, stdio: 'inherit' }) : null

      let timer: ReturnType<typeof setTimeout> | undefined
      const reload = () => {
        clearTimeout(timer)
        timer = setTimeout(async () => {
          try {
            report(await (await send('POST', `/${encodeURIComponent(id)}/reload`)).json() as ModuleStatus)
          } catch {
            console.error('Forge stopped answering; the module reloads when it is back')
          }
        }, 300)
      }
      const watchers = [join(dir, 'dist'), join(dir, 'forge-module.json')].filter(existsSync).map(p => watch(p, { recursive: statSync(p).isDirectory() }, reload))
      console.log(`Watching ${dir}. Ctrl-C stops and unloads it.`)

      process.on('SIGINT', async () => {
        for (const w of watchers) w.close()
        builder?.kill('SIGTERM')
        await send('DELETE', '/dev', { path: dir }).catch(() => {})
        process.exit(0)
      })
    })

  return cmd
}

const TEMPLATE = join(import.meta.dirname, '../../templates/module')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])
}

// from a Forge checkout the scaffold links the local SDK and UI; otherwise it uses the published ones
function sdkVersions(): { sdk: string; ui: string } {
  const packages = join(import.meta.dirname, '../../..')
  const local = (name: string) => resolve(packages, name)
  if (existsSync(join(local('sdk'), 'package.json')) && existsSync(join(local('ui'), 'package.json'))) {
    return { sdk: `file:${local('sdk')}`, ui: `file:${local('ui')}` }
  }
  return { sdk: '^1.0.0', ui: '^1.0.0' }
}

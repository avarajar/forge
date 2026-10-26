import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline/promises'
import type { ModuleStatus } from '@forge-dev/sdk'

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

  return cmd
}

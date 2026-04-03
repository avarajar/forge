import { Command } from 'commander'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function moduleCommand() {
  const cmd = new Command('module').description('Manage Forge modules')

  cmd
    .command('list')
    .description('List installed modules')
    .action(async () => {
      const res = await fetch('http://localhost:3000/api/modules')
      const modules = await res.json() as { enabled: boolean; name: string; version: string }[]
      if (modules.length === 0) {
        console.log('No modules installed. Run `forge module add <name>` to install one.')
        return
      }
      for (const m of modules) {
        console.log(`  ${m.enabled ? 'Y' : 'N'} ${m.name} (${m.version})`)
      }
    })

  cmd
    .command('add <name>')
    .description('Install a module (e.g. @forge-dev/mod-qa)')
    .action(async (name: string) => {
      const modulesDir = join(homedir(), '.forge', 'modules')
      const shortName = name.replace('@forge-dev/', '')

      console.log(`Installing ${name}...`)

      try {
        execSync(`npm install ${name} --prefix ${modulesDir}`, { stdio: 'pipe' })
      } catch {
        const localPath = join(process.cwd(), 'modules', shortName)
        if (!existsSync(localPath)) {
          console.log(`Failed to install ${name}. Is it published to npm?`)
          return
        }
        console.log(`Found local module at ${localPath}`)
      }

      try {
        await fetch('http://localhost:3000/api/modules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, version: '0.1.0' })
        })
      } catch {
        // Server might not be running
      }

      console.log(`Module ${name} installed`)
    })

  cmd
    .command('remove <name>')
    .description('Remove a module')
    .action(async (name: string) => {
      console.log(`Removing ${name}...`)

      try {
        await fetch(`http://localhost:3000/api/modules/${encodeURIComponent(name)}`, {
          method: 'DELETE'
        })
      } catch {
        // Server might not be running
      }

      const modulesDir = join(homedir(), '.forge', 'modules')
      try {
        execSync(`npm uninstall ${name} --prefix ${modulesDir}`, { stdio: 'pipe' })
      } catch {
        // May not have been npm-installed
      }

      console.log(`Module ${name} removed`)
    })

  return cmd
}

import { Command } from 'commander'

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
    .description('Install a module')
    .action(async (name: string) => {
      console.log(`Installing module: ${name}`)
      // TODO: npm install + register in DB
      console.log(`Module ${name} installed`)
    })

  cmd
    .command('remove <name>')
    .description('Remove a module')
    .action(async (name: string) => {
      console.log(`Removing module: ${name}`)
      // TODO: npm uninstall + unregister from DB
      console.log(`Module ${name} removed`)
    })

  return cmd
}

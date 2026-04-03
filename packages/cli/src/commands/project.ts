import { Command } from 'commander'

export function projectCommand() {
  const cmd = new Command('project').description('Manage projects')

  cmd
    .command('list')
    .description('List registered projects')
    .action(async () => {
      const res = await fetch('http://localhost:3000/api/projects')
      const projects = await res.json() as { name: string; path: string }[]
      if (projects.length === 0) {
        console.log('No projects registered. Run `forge project add <path>` to add one.')
        return
      }
      for (const p of projects) {
        console.log(`  ${p.name} -> ${p.path}`)
      }
    })

  cmd
    .command('add <path>')
    .description('Register a project')
    .option('-n, --name <name>', 'Project name')
    .action(async (path: string, opts: { name?: string }) => {
      const { basename, resolve } = await import('node:path')
      const fullPath = resolve(path)
      const name = opts.name ?? basename(fullPath)
      const res = await fetch('http://localhost:3000/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, path: fullPath })
      })
      const project = await res.json() as { name: string }
      console.log(`Project "${project.name}" registered`)
    })

  cmd
    .command('remove <name>')
    .description('Unregister a project')
    .action(async (name: string) => {
      const listRes = await fetch('http://localhost:3000/api/projects')
      const projects = await listRes.json() as { id: string; name: string }[]
      const project = projects.find(p => p.name === name)

      if (!project) {
        console.log(`Project "${name}" not found`)
        return
      }

      await fetch(`http://localhost:3000/api/projects/${project.id}`, {
        method: 'DELETE'
      })
      console.log(`Project "${name}" removed`)
    })

  return cmd
}

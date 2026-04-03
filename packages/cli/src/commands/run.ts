import { Command } from 'commander'

export function runCommand() {
  return new Command('run')
    .description('Run a module action')
    .argument('<module>', 'Module name')
    .argument('<action>', 'Action ID')
    .option('--project <name>', 'Project to run against')
    .action(async (moduleName: string, actionId: string, opts: { project?: string }) => {
      console.log(`Running ${moduleName}/${actionId}...`)

      const res = await fetch(
        `http://localhost:3000/api/actions/${moduleName}/${actionId}/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: opts.project ?? null })
        }
      )

      if (!res.ok) {
        const err = await res.json() as { error: string }
        console.error(err.error)
        process.exit(1)
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6)) as { chunk?: string; exitCode?: number }
              if (data.chunk) process.stdout.write(data.chunk)
              if (data.exitCode !== undefined) {
                console.log(`\nExit code: ${data.exitCode}`)
                process.exit(data.exitCode)
              }
            } catch { /* not json */ }
          }
        }
      }
    })
}

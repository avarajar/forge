import { Command } from 'commander'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function doctorCommand() {
  return new Command('doctor')
    .description('Health check — verify all dependencies')
    .action(() => {
      console.log('Forge Doctor\n')
      const checks = [
        { name: 'Node.js >= 20', check: () => {
          const v = process.version.slice(1).split('.').map(Number)
          return v[0] >= 20
        }},
        { name: 'Git installed', check: () => {
          try { execSync('git --version', { stdio: 'pipe' }); return true }
          catch { return false }
        }},
        { name: 'Claude Code installed', check: () => {
          try { execSync('claude --version', { stdio: 'pipe' }); return true }
          catch { return false }
        }},
        { name: 'Forge initialized (~/.forge/)', check: () => {
          return existsSync(join(homedir(), '.forge'))
        }}
      ]

      let allGood = true
      for (const { name, check } of checks) {
        const ok = check()
        console.log(`  ${ok ? 'OK' : 'FAIL'} ${name}`)
        if (!ok) allGood = false
      }

      console.log(allGood ? '\nAll good!' : '\nSome checks failed')
    })
}

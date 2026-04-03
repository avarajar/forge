import { Command } from 'commander'

export function initCommand() {
  return new Command('init')
    .description('Initialize Forge (creates ~/.forge/)')
    .action(async () => {
      const { ensureForgeDir } = await import('@forge-dev/core')
      const { forgeDir, created } = ensureForgeDir()

      if (!created) {
        console.log('Forge already initialized at', forgeDir)
        return
      }

      console.log('Forge initialized at', forgeDir)
      console.log('   Run `forge console` to open the dashboard')
    })
}

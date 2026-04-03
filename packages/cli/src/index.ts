#!/usr/bin/env node
import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { consoleCommand } from './commands/console.js'
import { moduleCommand } from './commands/module.js'
import { projectCommand } from './commands/project.js'
import { runCommand } from './commands/run.js'
import { doctorCommand } from './commands/doctor.js'

const program = new Command()
  .name('forge')
  .description('Forge — Integral Development Platform')
  .version('0.1.0')

program.addCommand(initCommand())
program.addCommand(consoleCommand())
program.addCommand(moduleCommand())
program.addCommand(projectCommand())
program.addCommand(runCommand())
program.addCommand(doctorCommand())

program.parse()

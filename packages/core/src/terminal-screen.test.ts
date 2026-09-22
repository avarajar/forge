import { describe, it, expect, afterEach } from 'vitest'
import { TerminalScreen } from './terminal-screen.js'

describe('TerminalScreen', () => {
  let screen: TerminalScreen

  afterEach(() => screen?.dispose())

  it('keeps the letters a redraw jumps over', async () => {
    screen = new TerminalScreen()
    // Claude Code redraws a row by writing only the cells that changed
    screen.write('This rule overrides\r\n')
    screen.write('\x1b[1AThis r\x1b[8Gle')
    expect(await screen.read()).toBe('This rule overrides')
  })

  it('places words by column the way Claude Code does', async () => {
    screen = new TerminalScreen()
    screen.write('the\x1b[5Guser\x1b[10Gto\x1b[13Gconfirm')
    expect(await screen.read()).toBe('the user to confirm')
  })

  it('shows only what is left after a row is cleared', async () => {
    screen = new TerminalScreen()
    screen.write('✻ Brewing…\r\x1b[2K✻ Brewed for 3s\r\n❯ ')
    expect(await screen.read()).toBe('✻ Brewed for 3s\n❯')
  })

  it('keeps the rows that scrolled off the top', async () => {
    screen = new TerminalScreen(40, 3)
    screen.write('one\r\ntwo\r\nthree\r\nfour\r\nfive')
    expect(await screen.read()).toBe('one\ntwo\nthree\nfour\nfive')
  })

  it('uses the new width after a resize', async () => {
    screen = new TerminalScreen(10, 5)
    screen.resize(40, 5)
    screen.write('a line longer than ten columns')
    expect(await screen.read()).toBe('a line longer than ten columns')
  })
})

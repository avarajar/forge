import xterm from '@xterm/headless'

const { Terminal } = xterm

// What a terminal shows, read through a terminal emulator. Claude Code redraws a row by writing only
// the cells that changed and jumping over the rest, so text pulled out of the raw stream loses every
// letter a redraw kept; the emulator keeps them.

const SCROLLBACK = 200

export class TerminalScreen {
  private readonly term: InstanceType<typeof Terminal>

  constructor(cols = 120, rows = 40) {
    this.term = new Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true })
  }

  write(data: string): void {
    this.term.write(data)
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows)
  }

  // rows oldest first, scrollback included, without the blank rows under the last one written
  read(): Promise<string> {
    // the emulator parses writes asynchronously; an empty write calls back once everything before it is parsed
    return new Promise((resolve) => this.term.write('', () => {
      const buffer = this.term.buffer.active
      const rows: string[] = []
      for (let y = 0; y < buffer.length; y++) {
        const line = buffer.getLine(y)
        if (!line) continue
        // untrimmed, so a space at the end of a wrapped row survives the join
        const text = line.translateToString(false)
        if (line.isWrapped && rows.length) rows[rows.length - 1] += text
        else rows.push(text)
      }
      const trimmed = rows.map(r => r.trimEnd())
      while (trimmed.length && !trimmed[trimmed.length - 1]) trimmed.pop()
      resolve(trimmed.join('\n'))
    }))
  }

  dispose(): void {
    this.term.dispose()
  }
}

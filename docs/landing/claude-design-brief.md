# Brief: Forge landing page (for Claude Design)

Paste this brief into Claude Design and attach the screenshots listed under **Assets**.

---

## What we are making

A single-page marketing site for **Forge**, an open-source (MIT) web dashboard for running coding agents. It is a static page, hosted for free on GitHub Pages at `avarajar.github.io/forge`. It is in English and must work on desktop and phone widths.

The page has one job: get a developer who already uses Claude Code, Codex, Pi or OpenCode to star the repo and run Forge locally.

## The product in one paragraph

Forge is the visual dashboard for **CW (Coding Workspace)**, a CLI that starts coding agents in isolated git worktrees with the right account and the full project context. From the dashboard you paste a pull request, a Linear or Notion link, or a task name, and Forge picks review or dev, starts the agent on the right project and harness, and gives you its terminal in the browser. It shows each session's context usage, tokens and cost, and its commits, unpushed work and pull request. Everything runs on your own machine.

## Audience

- Developers who run several coding agents at once and lose track of terminals, worktrees and accounts.
- People who use more than one harness (Claude Code, Codex, Pi, OpenCode) or several accounts.
- They are comfortable in a terminal. They distrust hype, so show the real UI and the real commands.

## Tone and copy rules

- Tagline: **"Where ideas are shaped into software."**
- Direct and concrete. Name the real thing ("paste a pull request"), not the abstraction ("streamline your workflow").
- No invented numbers, testimonials, logos of companies using it, or user counts. It is a young open-source project.
- No pricing section. It is free and MIT.

## Visual direction

The landing should look like it belongs to the product. Reuse the console's design language, an Apple-style system look:

- **Type:** system font stack, `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif`; mono `ui-monospace, "SF Mono", Menlo, monospace` for commands.
- **One action color:** system blue. Other colors are functional only (see below).
- **Surfaces:** layered cards with real elevation, rounded corners (cards around 16–20px, controls around 10–12px), 1px hairline borders, translucent sticky header (`backdrop-filter` blur over `--glass`).
- **Motion:** short and spring-timed, `cubic-bezier(.32,.72,0,1)`, 180–400ms. Fade/rise on scroll at most. Respect `prefers-reduced-motion`.
- **Dark is the default**, with a light theme that follows the system setting.
- Screenshots are the hero of the page: large, framed like a macOS window, with `--shadow-l`.

### Tokens (same names and values as the console)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#161618` | `#f2f2f5` | Page background |
| `--bg-2` | `#1f1f22` | `#f8f8fa` | Alternate section background |
| `--card` | `#26262a` | `#ffffff` | Cards, code blocks |
| `--elev` | `rgba(255,255,255,.04)` | `rgba(0,0,0,.02)` | Hover wash |
| `--hair` | `rgba(255,255,255,.10)` | `rgba(0,0,0,.09)` | Borders |
| `--ink` | `#f5f5f7` | `#1d1d1f` | Primary text |
| `--ink-2` | `#a1a1a8` | `#6e6e73` | Secondary text |
| `--ink-3` | `#6e6e76` | `#8e8e93` | Tertiary text |
| `--blue` | `#0a84ff` | `#007aff` | Buttons, links |
| `--green` | `#30d158` | `#28a745` | Live indicator, success |
| `--orange` | `#ff9f0a` | `#e08600` | Dev task type |
| `--purple` | `#bf5af2` | `#8944ab` | Loop task type |
| `--glass` | `rgba(28,28,30,.72)` | `rgba(248,248,250,.78)` | Sticky header |
| `--shadow-m` | `0 6px 20px rgba(0,0,0,.42)` | `0 6px 18px rgba(0,0,0,.09)` | Cards |
| `--shadow-l` | `0 24px 60px rgba(0,0,0,.55)` | `0 24px 60px rgba(0,0,0,.14)` | Screenshot frames |
| `--term` | `#0e0e10` | `#1c1c1e` | Terminal / code blocks |

Harness colors (use for the four harness chips): Claude Code `#e08a68`, Codex `#2fbf97`, Pi `#6b9bff`, OpenCode `#e8b44a` (dark); `#c9633f`, `#0f8f6f`, `#2f6fe0`, `#c98a12` (light). Tints are `color-mix(in srgb, <color> 18%, transparent)` with the color as the text.

Task type colors: Dev = orange `D`, Review = blue `R`, Loop = purple `L`, General = green `G`, shown as small rounded letter tiles.

## Page structure

### 1. Header (sticky, translucent)
Logo wordmark "Forge" on the left. Links: Features, How it works, Get started. On the right, a "GitHub" button with the star count.

### 2. Hero
- Eyebrow: "Open source · MIT · Runs on your machine"
- Headline: **Where ideas are shaped into software.**
- Subhead: "A visual dashboard for your coding agents. Start a task from a pull request or a ticket, watch its terminal, and see what it costs, on Claude Code, Codex, Pi or OpenCode."
- Primary button: "Get started" (scrolls to Get started). Secondary button: "View on GitHub".
- A copyable command block:
  ```
  git clone https://github.com/avarajar/forge.git && cd forge && pnpm start
  ```
- Below: the `task-list.png` screenshot, large, in a window frame. Optional: a small floating card over the screenshot's corner showing a live session with a green pulsing dot and a context meter.
- A row of four harness chips: Claude Code · Codex · Pi · OpenCode.

### 3. The problem (short)
Three short lines or a small visual of scattered terminal windows: "Five agents. Five terminals. Three accounts. Which one is still running, and what did it push?" Then: "Forge puts them in one place."

### 4. Features (alternating rows, screenshot + text)
1. **Start from anything.** Paste a pull request, a Linear or Notion link, or type a name. Forge picks review or dev and starts it on the right project and harness. (`new-task.png`)
2. **The agent's terminal, in the browser.** Context used, tokens and cost from its status line, plus commits, unpushed work, the pull request and its checks. Open the worktree in VS Code, Cursor, Windsurf or Zed. (`task-detail.png`)
3. **Every harness, every account.** One card per account with each harness's status and one-click Connect. Codex logs in with a device code, no terminal. (`accounts.png`)
4. **Keyboard first.** ⌘K palette for sessions, tasks, projects and commands. `N` new task, `P` add a project, ⌘J light/dark, ⌘1–5 tabs. (`command-palette.png`; show the keys as `kbd` pills)

### 5. More features (grid of 6 small cards, icon + title + one line)
- **Multi-tab sessions:** keep several agents open; tabs stay connected while you browse.
- **Skills:** browse and edit global, account and project skills, or install from skills.sh.
- **Prototypes:** a sandbox with its own dev server; share it or turn it into a dev task.
- **Projects:** create, register, move and delete projects from the dashboard.
- **Light and dark:** system fonts, reduced-motion aware, works in narrow windows.
- **Local by default:** listens on 127.0.0.1 and only answers your own machine. Team mode adds PostgreSQL and a token.

### 6. How it works (simple diagram)
Three stacked layers connected by lines:
`Forge console (browser)` → `Forge server (your machine)` → `CW` → four harness chips.
Side note: "Forge reads `~/.cw` and `~/.claude`. CW starts each agent in its own git worktree with the right account." Link: "Learn about CW →" to `https://github.com/avarajar/cw`.

### 7. Get started (3 steps, numbered cards with code blocks)
1. **Install CW** (needs Node 20+, pnpm 11+, Python 3.9+, git, and one harness)
   ```
   git clone https://github.com/avarajar/cw.git && cd cw && ./install.sh
   cw init
   ```
2. **Add a project**
   ```
   cw open my-app
   ```
3. **Run Forge**
   ```
   git clone https://github.com/avarajar/forge.git && cd forge && pnpm start
   ```
   "Opens at http://localhost:3000. With CW installed you can also run `cw forge`."

Every code block has a copy button.

### 8. Closing CTA
"Give your agents a home." Buttons: "Star on GitHub", "Read the docs" (README).

### 9. Footer
MIT © Jose Andrade · GitHub · CW · Changelog. "Built with Forge, CW and Claude Code."

## Assets

Attach these from `docs/screenshots/` (they use demo data):

- `task-list.png` (hero), `task-list-light.png` (light theme hero variant)
- `new-task.png`, `task-detail.png`, `accounts.png`, `command-palette.png`
- `skills.png`, `prototype.png`, `mobile.png` (optional, for the grid or a phone frame)

No logo file exists yet. Propose a simple wordmark and a favicon (an anvil or spark shape in system blue works).

## Constraints

- Static HTML/CSS with minimal JS (theme, copy buttons, reveal on scroll). No framework required.
- Fast: screenshots as responsive images (`srcset`, lazy below the fold), no web fonts.
- Accessible: real contrast in both themes, alt text on screenshots, visible focus rings (`outline: 3px solid` blue at 55%).
- Layout works from 360px wide up; screenshots scale down, feature rows stack.
- Do not advertise `npx @forge-dev/platform`: the package is not published to npm yet.

## Deliverable

A high-fidelity design of the full page in dark and light, desktop and phone, exported as a handoff bundle (like `design_handoff_forge_console/`) so it can be built in `site/` in this repo.

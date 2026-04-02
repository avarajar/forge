<div align="center">

<br />

```
                                                                        
    ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
    ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
    █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  
    ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  
    ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
    ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
                                                
```

**Where ideas are shaped into software.**

[![MIT License](https://img.shields.io/badge/license-MIT-6366f1?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-10b981?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-f59e0b?style=for-the-badge)](CONTRIBUTING.md)

<br />

**Forge** is an open-source development platform that unifies the entire software lifecycle — from design to deploy — in a visual web dashboard where every action executes with a single click.

[Getting Started](#-getting-started) &bull; [Modules](#-modules) &bull; [Architecture](#-architecture) &bull; [Create a Module](#-create-a-module) &bull; [Roadmap](#-roadmap)

<br />

---

</div>

<br />

## The Problem

Your development workflow is scattered across 15 tools, 8 browser tabs, and 3 terminals. You context-switch between Linear for issues, Figma for designs, your IDE for code, Playwright for tests, Vercel for deploys, Sentry for errors, and Slack for comms. Every switch costs focus.

## The Solution

One dashboard. Every action. One click.

```
┌──────────────────────────────────────────────────────────────┐
│  🔥 Forge    [my-saas-app ▾]    🔍 search     [Jose] [⚙️]  │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                    │
│ 📋 Plan  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│
│ 🎨 Design│  │ Unit ✅  │ │ E2E ✅  │ │ Sec ⚠️  │ │Load ✅ ││
│ ⚡ Dev   │  │ 142/142  │ │ 38/38   │ │ 2 warns │ │ p95:80 ││
│ 🧪 QA    │  └─────────┘ └─────────┘ └─────────┘ └────────┘│
│ 🚀 Rel   │                                                   │
│ 📡 Mon   │  ┌────────────────────────────────────────────┐  │
│          │  │  ✓ auth.spec.ts (3 tests)          1.2s    │  │
│          │  │  ✓ payment.spec.ts (8 tests)       2.4s    │  │
│          │  │  ✓ dashboard.spec.ts (5 tests)     0.8s    │  │
│          │  │                                             │  │
│          │  │  Tests: 142 passed, 0 failed                │  │
│          │  └────────────────────────────────────────────┘  │
│          │                                                   │
│          │  ┌──────────────┐  ┌──────────────────────────┐ │
│          │  │ [▶ Run All]  │  │ [▶ E2E] [▶ Sec] [▶ Load]│ │
│          │  └──────────────┘  └──────────────────────────┘ │
└──────────┴───────────────────────────────────────────────────┘
```

<br />

## ✨ Features

<table>
<tr>
<td width="50%">

### 🔌 Module-Based Architecture
Every capability is a module. Install what you need, skip what you don't. Create your own for your stack.

### 🖱️ One Click, One Action
Every button in the dashboard triggers a real command. No configuration screens — just results.

### 🤖 AI-Native
Claude Code is the engine. Every module can invoke AI skills, MCP servers, and intelligent workflows.

</td>
<td width="50%">

### 💻 Local First, Team Ready
Works offline on your machine with SQLite. Add `--team` for shared PostgreSQL mode.

### 🔍 Stack Detection
Forge scans your project and auto-activates relevant tools. Playwright config? E2E testing enabled. Dockerfile? Deploy actions ready.

### 🌊 Streaming Output
Real-time terminal output in the browser. Watch your tests, builds, and deploys as they happen.

</td>
</tr>
</table>

<br />

## 🚀 Getting Started

```bash
# Run directly (no install needed)
npx @forge-dev/platform

# Or install globally
npm i -g @forge-dev/platform
forge console
```

That's it. Browser opens. Dashboard ready.

### First Steps

1. **Add a project** — Click `+ New Project` or run `forge project add ./my-app`
2. **Install modules** — `forge module add @forge-dev/mod-qa`
3. **Click buttons** — Every action in the dashboard executes with one click

<br />

## 🧩 Modules

Forge ships with **7 core modules** covering the full software lifecycle:

```
Planning → Design → Dev → QA → Release → Monitor
   ↑                                        │
   └──────────── feedback loop ─────────────┘
```

<br />

<table>
<tr>
<td align="center" width="14%">

**📋**
<br />
**Planning**
<br />
<sub>Linear, Notion, diagrams, ADRs</sub>

</td>
<td align="center" width="14%">

**🎨**
<br />
**Design**
<br />
<sub>Figma, Penpot, tokens, wireframes</sub>

</td>
<td align="center" width="14%">

**⚡**
<br />
**Dev**
<br />
<sub>Worktrees, sessions, multi-account</sub>

</td>
<td align="center" width="14%">

**🧪**
<br />
**QA**
<br />
<sub>Tests, security, load, visual</sub>

</td>
<td align="center" width="14%">

**🚀**
<br />
**Release**
<br />
<sub>Deploy, flags, rollback, changelog</sub>

</td>
<td align="center" width="14%">

**📡**
<br />
**Monitor**
<br />
<sub>Health, errors, uptime, costs</sub>

</td>
<td align="center" width="14%">

**🏗️**
<br />
**Scaffold**
<br />
<sub>Project wizard, templates, stack detect</sub>

</td>
</tr>
</table>

<br />

### `mod-planning` — Planning & Architecture

> Linear boards, Notion docs, Mermaid/D2 diagrams, Architecture Decision Records

| Action | What it does |
|--------|-------------|
| `Create Issue` | Creates a Linear issue with AI-generated acceptance criteria |
| `Generate Diagram` | Claude Code generates architecture diagrams in Mermaid or D2 |
| `Create ADR` | Scaffolds an Architecture Decision Record |
| `Sync Docs` | Pulls latest from Notion into the project |

### `mod-design` — Design & UI/UX

> Figma/Penpot integration, design tokens, Excalidraw wireframes, visual regression

| Action | What it does |
|--------|-------------|
| `Import from Figma` | Reads frames and components via Figma MCP |
| `Generate Component` | AI generates React/Vue/Svelte from a design |
| `Export Tokens` | Builds design tokens via Style Dictionary |
| `Visual Regression` | Catches unintended UI changes with Lost Pixel |

### `mod-dev` — Development

> Powered by [CW (Claude Workspace Manager)](https://github.com/joseandrade-monoku/cw). Worktree isolation, session persistence, multi-account.

| Action | What it does |
|--------|-------------|
| `Start Task` | Creates isolated worktree + Claude Code session |
| `Review PR` | Checks out PR in separate worktree for review |
| `Plan Task` | AI splits a large task into sub-tasks |
| `Close Task` | Cleans up worktree, archives session |

### `mod-qa` — Quality Assurance

> Unit, E2E, security, visual, load, mutation, and API testing — all from one panel

| Action | What it does |
|--------|-------------|
| `Run Unit Tests` | Auto-detects pytest/vitest and runs |
| `Run E2E` | Playwright tests with streaming output |
| `Security Scan` | Semgrep SAST scan |
| `Load Test` | k6 performance testing |
| `Full Suite` | Runs everything, shows semaphore dashboard |

### `mod-release` — Release & Deploy

> Version bump, changelog, deploy to 15+ platforms, feature flags, rollback

| Action | What it does |
|--------|-------------|
| `Prepare Release` | Bump version + generate changelog with git-cliff |
| `Deploy` | Auto-detects platform (Vercel/Railway/Fly/Docker/K8s/AWS/Azure/GCP) |
| `Toggle Flag` | Manage feature flags via Flipt |
| `Rollback` | One-click rollback to previous version |
| `Notify Team` | Post release notes to Slack |

<details>
<summary><strong>Supported deploy targets (auto-detected)</strong></summary>

| Detects | Platform | Command |
|---------|----------|---------|
| `vercel.json` | Vercel | `vercel deploy` |
| `fly.toml` | Fly.io | `fly deploy` |
| `railway.toml` | Railway | `railway up` |
| `netlify.toml` | Netlify | `netlify deploy` |
| `render.yaml` | Render | `render deploy` |
| `Dockerfile` + `azure-*` | Azure | `azd deploy` |
| `appspec.yml` | AWS | `aws deploy` |
| `app.yaml` | GCP | `gcloud app deploy` |
| `docker-compose.yml` | Docker | `docker compose up -d` |
| `k8s/` or `helm/` | Kubernetes | `kubectl apply` / `helm upgrade` |
| `sst.config.ts` | SST | `sst deploy` |
| `pulumi.yaml` | Pulumi | `pulumi up` |
| `*.tf` | Terraform | `terraform apply` |
| `Fastfile` | App Stores | `fastlane release` |

</details>

### `mod-monitor` — Monitoring & Observability

> Health checks, error tracking, uptime, AI costs, live activity feed

| Action | What it does |
|--------|-------------|
| `Check Health` | Pings configured endpoints |
| `View Errors` | Sentry error feed |
| `Cost Report` | Claude Code + cloud spend breakdown |
| `Create Incident` | Publish to status page |

### `mod-scaffold` — Project Creation Wizard

> Step-by-step project creation with integrations

| Action | What it does |
|--------|-------------|
| `New Project` | Wizard: name → stack → integrations → create |
| `Detect Stack` | Scans codebase and suggests tools |
| `Setup Integrations` | Connects Linear, Notion, GitHub, Slack |
| `Generate CLAUDE.md` | AI-generates project instructions |

<br />

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│              FORGE CONSOLE (Preact + UnoCSS)         │
│         ~80KB gzipped · dark/light themes            │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP + WebSocket + SSE
┌───────────────────────┼──────────────────────────────┐
│              FORGE SERVER (Hono · ~14KB)               │
│                                                       │
│   Module Registry · Action Runner · Claude Bridge     │
│                                                       │
│   SQLite (local) ──── or ──── PostgreSQL (team)       │
└───────────────────────┬───────────────────────────────┘
                        │
          ┌─────────────┼─────────────┐
          │             │             │
     CW (bash)    External CLIs   Claude Code
     worktrees    playwright,     skills, MCPs,
     sessions     k6, semgrep     agents
```

### Tech Stack

| Layer | Tech | Size |
|-------|------|------|
| Server | Hono | ~14KB |
| UI Framework | Preact | ~3KB |
| CSS | UnoCSS | 0KB runtime |
| Icons | Lucide | ~200B per icon |
| Charts | Chart.js | ~60KB |
| Terminal | xterm.js | ~50KB |
| Database | better-sqlite3 / PostgreSQL | — |
| CLI | Commander.js | — |
| Build | Turborepo + Vite | — |

**Total dashboard bundle: ~80KB gzipped**

<br />

## 🔧 CLI

The dashboard is the primary interface, but everything is available from the terminal too:

```bash
forge init                          # First-time setup
forge console                       # Start dashboard
forge doctor                        # Health check

forge project list                  # List projects
forge project add ./my-app          # Register project

forge module list                   # Installed modules
forge module add @forge-dev/mod-qa  # Install module

forge run qa run-e2e                # Run any action
forge run release deploy staging    # Deploy to staging

forge status                        # All projects summary
forge costs                         # AI cost report
```

<br />

## 🧑‍💻 Create a Module

Forge is designed for extensibility. Every module is an npm package with a manifest:

```bash
forge module create
# → Name, description, actions, panels
# → Generates scaffold ready to code
```

### Module Manifest (`forge-module.json`)

```json
{
  "name": "@myorg/mod-analytics",
  "displayName": "Analytics",
  "icon": "📊",
  "color": "#8b5cf6",
  "actions": [
    {
      "id": "sync",
      "label": "Sync Data",
      "icon": "🔄",
      "command": "npx mixpanel-cli pull",
      "streaming": true
    }
  ],
  "detectors": [
    {
      "tool": "mixpanel",
      "files": ["**/mixpanel.init.*"],
      "suggestion": "Mixpanel detected. Enable analytics?"
    }
  ]
}
```

### Server Side

```typescript
import { defineModule } from '@forge-dev/sdk'

export default defineModule({
  actions: {
    'sync': async (ctx) => ctx.exec('npx mixpanel-cli pull', { stream: true }),
    'report': async (ctx) => ctx.claude('Analyze this data', { skill: 'data-analyst' })
  }
})
```

### UI Side

```tsx
import { definePanel } from '@forge-dev/sdk/ui'
import { StatusCard, ActionButton } from '@forge-dev/ui'

export default definePanel({
  render({ project, actions }) {
    return (
      <div>
        <StatusCard icon="📊" label="DAU" value="1,234" status="good" />
        <ActionButton action={actions['sync']} />
      </div>
    )
  }
})
```

<br />

## 🗺️ Roadmap

| Phase | Status | What |
|-------|--------|------|
| **0: Foundation** | 🔄 In Progress | Core server, dashboard shell, module system, CLI, UI kit |
| **1: Core Modules** | ⏳ Planned | mod-dev (CW), mod-scaffold, mod-planning, mod-monitor |
| **2: Full Ecosystem** | ⏳ Planned | mod-qa, mod-design, mod-release, team mode |
| **3: Community** | ⏳ Planned | Module SDK docs, registry, template gallery |

See [Phase 0 Implementation Plan](docs/plans/2026-04-02-forge-phase0-implementation.md) for detailed tasks.

<br />

## 🤝 Contributing

Forge is open source from day one. We welcome contributions of all kinds:

- **New modules** — Build modules for your stack (Rails, Laravel, Flutter, Rust...)
- **UI components** — Improve the dashboard experience
- **Detectors** — Add stack detection rules
- **Templates** — Create project templates
- **Docs** — Help others get started
- **Bug reports** — Found something? Open an issue

```bash
git clone https://github.com/forge-dev/forge.git
cd forge
npm install
npx turbo dev
```

<br />

## 📄 License

MIT &copy; [Jose Andrade](https://github.com/joseandrade-monoku) / [Monoku](https://monoku.com)

<div align="center">
<br />

---

<br />

**Built with 🔥 by developers, for developers.**

<sub>Forge is powered by [Claude Code](https://claude.ai/code), [Hono](https://hono.dev), [Preact](https://preactjs.com), and the open-source community.</sub>

</div>

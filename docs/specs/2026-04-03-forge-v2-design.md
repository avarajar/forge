# Forge v2 — CW Visual Interface

## What Is This

Forge v2 is a visual GUI for CW (Claude Workspace Manager). It reads CW's data directly — projects, sessions, worktrees — and presents them in a browser-based interface. It does not replace the terminal; it launches tasks that run in your terminal via CW.

## Core Concept

```
Forge (browser)          CW (terminal)
─────────────────        ─────────────
See all tasks      →     Runs worktrees + Claude sessions
Create new task    →     cw work / cw create / cw review
Resume task        →     cw work (--continue)
View status        ←     Reads ~/.cw/sessions/
View diff/tests    ←     Reads git data from worktree
Design flow        →     Uses MCPs + skills via CW
```

Forge is the launcher and status viewer. CW is the engine.

## Data Source

All data comes from CW's filesystem. No separate Forge database for projects or sessions.

| Data | Source |
|------|--------|
| Projects | `~/.cw/projects.json` |
| Active sessions | `~/.cw/sessions/{project}/task-{name}/session.json` |
| Session notes | `~/.cw/sessions/{project}/task-{name}/TASK_NOTES.md` |
| Config | `~/.cw/config.yaml` |
| Accounts | `~/.cw/accounts/` directory listing |
| Git status per task | `git` commands run in the worktree path from session.json |

Forge's Hono server provides API endpoints that read this data and return JSON. The Preact frontend renders it.

## Views

### 1. Main View — Task List + Quick Launch

The home screen. Shows all active CW tasks across all projects.

**Layout:**
- Top bar: account selector (from CW config), search
- Quick launch buttons: `+ New Task`, type shortcuts (Dev, Design, Review, Plan, Create)
- Task list: active tasks sorted by last_opened, grouped by project
- Each task row: type badge (DEV/REVIEW/DESIGN/PLAN), task name, project name, time ago, "Resume" button
- Below active: collapsed "Recent (done)" section

**Data flow:**
- `GET /api/cw/spaces` → scans `~/.cw/sessions/*/task-*/session.json`, returns all sessions
- `GET /api/cw/projects` → reads `~/.cw/projects.json`

### 2. New Task — Smart Single Screen

One modal/screen that adapts based on task type. Type is pre-selected if user clicked a type shortcut button.

**Fields:**
- Type selector: Dev, Design, Review, Plan, Create (pill buttons, one selected)
- Project: dropdown populated from `~/.cw/projects.json`
- Task: text input (name or Linear/GitHub/Notion URL — CW handles URL resolution)
- Description: optional textarea
- Detected context: badges showing what Forge detected in the project (Tailwind, Vitest, Figma MCP, etc.)

**Type-specific behavior:**
- **Dev**: shows workflow options (feature, bugfix, refactor) and base branch
- **Design**: shows "What do you have?" input selector (Figma link, description, sketch, screenshot) + style guide status
- **Review**: shows PR number/URL field instead of task name
- **Plan**: shows description field prominently (for `cw plan`)
- **Create**: switches to project creation flow (see View 5)

**On "Start Task":**
- Forge calls `POST /api/cw/start` which executes the appropriate `cw` command
- CW opens a terminal session (iTerm/Terminal.app)
- Forge shows a toast "Task started" and the task appears in the main list
- Skills are auto-selected based on type + detected stack:
  - Dev + has tests → `test-driven-development`
  - Dev + frontend files → `frontend-design`
  - Design → `frontend-design`
  - Review → `receiving-code-review`

### 3. Task Detail — Tabbed View

When clicking on a task in the main list.

**Header:** Type badge, task name, project, time info, "Resume" button (big, green), "Done" button

**Tabs:**

**Status** (default)
- Branch name, worktree path
- Files changed count, commits count
- Session opens count
- Activity timeline: commits, session opens, status changes
- Data: `git log`, `git diff --stat` run in the worktree path

**Diff**
- Visual git diff of the worktree vs base branch
- File list on left, diff content on right
- Data: `git diff {base}...HEAD` run in the worktree

**Tests**
- Run tests button (auto-detects runner: vitest, pytest, playwright)
- Results display: pass/fail counts, output
- Data: runs detected test command in the worktree

**Screenshots** (Visual QA)
- Before/after screenshot comparison
- Run Playwright screenshots or Lost Pixel
- Side-by-side view with diff highlighting
- Data: `npx playwright test --update-snapshots` or similar in worktree

**Notes**
- Renders `TASK_NOTES.md` from the CW session
- Editable inline
- Data: reads/writes `~/.cw/sessions/{project}/task-{name}/TASK_NOTES.md`

### 4. Design Task Flow

When creating a task of type Design, the "What do you have?" section determines the workflow:

**Figma link provided:**
1. Forge detects if Figma MCP is connected (checks CW config/MCPs)
2. If yes: extracts frames/components via MCP, shows preview
3. User selects which frames to implement
4. Forge creates a CW task with the `frontend-design` skill, passes Figma context
5. If project has no style guide: warns + offers to create one first

**Description only:**
1. Forge creates a CW task with `frontend-design` skill
2. Claude Code generates a prototype based on description + project's existing style guide/tokens
3. User sees result in the task detail Screenshots tab

**Screenshot/image provided:**
1. Image is saved to the task's worktree
2. CW task is created with `frontend-design` skill + image as context
3. Claude Code implements the design from the image

**Style guide detection:**
- Forge checks for: `tokens/`, `src/tokens/`, `tailwind.config.*`, `components.json` (shadcn), `style-dictionary.config.*`
- If found: shows green badges (Tailwind, shadcn, tokens)
- If not found: shows warning "No style guide. Create one?" which launches a style guide setup wizard

### 5. Create Project Flow

When "Create" type is selected, the form changes to a project creation wizard:

**Fields:**
- Name: project name
- Description: what you want to build (textarea, prominent)
- Account: dropdown from CW accounts

**After description is entered, Forge suggests:**
- Stack recommendation: framework, DB, deploy target (based on AI analysis of description)
- User can adjust each suggestion or accept all
- Shows detected tools: "Will configure: Linear, GitHub, Vercel, Tailwind"

**On "Create":**
- Calls `cw create "{description}" --name {name} --account {account}`
- CW bootstraps the project
- New project appears in the task list

## API Endpoints (New)

Replace the current module-based API with CW-focused endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cw/projects` | GET | Read `~/.cw/projects.json` |
| `/api/cw/spaces` | GET | Scan all sessions, return active + recent |
| `/api/cw/sessions/:project` | GET | Sessions for a specific project |
| `/api/cw/session/:project/:task` | GET | Single session detail |
| `/api/cw/start` | POST | Execute `cw work/review/create/plan` |
| `/api/cw/done` | POST | Execute `cw work --done` |
| `/api/cw/config` | GET | Read `~/.cw/config.yaml` |
| `/api/cw/detect/:project` | GET | Detect stack, MCPs, style guide for a project |
| `/api/cw/git/diff/:project/:task` | GET | Git diff for a task's worktree |
| `/api/cw/git/log/:project/:task` | GET | Git log for a task's worktree |
| `/api/cw/git/status/:project/:task` | GET | Git status for a task's worktree |
| `/api/cw/run-tests/:project/:task` | POST | Auto-detect and run tests in worktree |
| `/api/cw/notes/:project/:task` | GET/PUT | Read/write TASK_NOTES.md |
| `/api/health` | GET | Server health |

## Frontend Components

Reuse from current Forge:
- `StatusCard`, `ActionButton`, `Badge`, `Modal`, `Tabs`, `DataList`, `EmptyState`, `Toast`, `ToggleSwitch`, `ForgeTerminal`
- UnoCSS theme (dark/light with forge CSS variables)

New components:
- `TaskRow` — task list item with type badge, project, time, resume button
- `TaskDetail` — tabbed view (Status, Diff, Tests, Screenshots, Notes)
- `NewTaskModal` — smart single screen for creating tasks
- `DiffViewer` — renders git diff with syntax highlighting
- `ScreenshotCompare` — side-by-side before/after with diff overlay
- `ProjectCreateWizard` — guided project creation with stack suggestions
- `StyleGuideSetup` — wizard for creating/importing a style guide

## What Gets Removed

- Module system (ModuleLoader, forge-module.json manifests, module panels)
- Module registry (`/api/registry/search`, panel registry in console)
- Per-module panel components (all `modules/mod-*/panels/*.tsx`)
- Module settings API
- The `modules/` directory (mod-dev, mod-qa, mod-design, etc.)
- `@forge-dev/sdk` definePanel/PanelConfig (no longer needed)

## What Gets Kept

- Hono server (rewritten routes but same framework)
- Preact + UnoCSS + Vite build
- UI component library (`@forge-dev/ui`)
- Action runner (for running tests, git commands in worktrees)
- SQLite DB (for action logs / history — optional)
- Auth middleware (for team mode)
- CLI structure (commander.js)

## Skill Auto-Selection

When Forge starts a CW task, it passes skill recommendations based on context:

| Task Type | Stack Detection | Skills Activated |
|-----------|----------------|-----------------|
| Dev | Has test config | `test-driven-development` |
| Dev | Has frontend files (.tsx, .vue, .svelte) | `frontend-design` |
| Dev | Any | `verification-before-completion` |
| Design | Any | `frontend-design` |
| Review | Any | `receiving-code-review` |
| Plan | Any | `writing-plans`, `brainstorming` |

Skills are passed as context/instructions to the CW session, not as CLI flags.

## Non-Goals

- Terminal emulator in the browser
- Replacing VS Code or any editor
- Running long CI/CD pipelines
- Managing cloud infrastructure
- Module/plugin ecosystem (removed in v2)

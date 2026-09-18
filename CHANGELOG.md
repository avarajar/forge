# Changelog

## Unreleased

### Added

- Usage limits per account: the 5 h and weekly windows for Claude Code, and whatever windows the plan carries for Codex, with the time each one resets. The Accounts screen shows every window, including the weekly one scoped to a model; the sidebar keeps a compact meter per account.
- `GET /api/cw/usage`, which reads the limits from Claude's OAuth usage endpoint and from the Codex app server. Credentials stay on the server.
- Harness selector in New Task, preselecting the project's or the account's default harness from `cw doctor --json`.
- Harness badge on task cards, done rows and the task detail bar, and a harness filter in the task list.
- Accounts screen: an account × harness matrix, Codex device login and API key import, and a terminal login for Claude Code, Pi and OpenCode.
- `GET /api/cw/harnesses` and the account login and API key endpoints.
- A task's status bar summarises its changes — uncommitted files, unpushed commits, the diff against its base branch, and its pull request with checks and review — and links to GitHub (the pull request, or the compare page for a pushed branch).
- Open in editor for a task's worktree: VS Code, Cursor, Windsurf or Zed, when Forge runs locally.
- A pull request chip on task cards; a merged pull request keeps the card's Done button visible.
- `GET /api/cw/review-state/:project/:sessionDir`, `GET /api/cw/editors` and `POST /api/cw/open-in-editor`.
- A start card on the task list: paste a pull request, a Linear or Notion link, or type a name, and Forge picks review or dev and starts it on the project you pick. With General it launches a session on an account, in a project or outside any.
- A ⌘K command palette (also `/`) for open sessions, tasks, projects and commands; `N` opens a new task, `P` adds a project and ⌘J switches appearance.
- The task detail shows context used, tokens and cost read from the harness status line, plus commits, unpushed commits and the branch.
- A sidebar with sections, projects and a card per live session; it becomes an icon rail below 900 px and an overlay below 700 px.
- The sidebar's projects can be filtered by name and are grouped by account; each group folds, lists active projects first and shows the first five until expanded.

### Changed

- The console is redesigned: system fonts, a dark and a light theme, system blue for actions, one color per task type, cards per project, and short motion that respects reduced motion.
- New Task opens as a drawer over the task list and shares the start card's input.
- Skills shows the list and the editor side by side; search falls through to skills.sh.
- Accounts shows one card per account, and removing an account moved there from the task list.
- The task list shows the most recently opened tasks first by default, with a By project view one click away.
- The type filter covers Loop and General; the account filter moved out of the task list.
- Terminal tabs stay connected while the task list is open.
- Forge removes `CW_HARNESS` from the environment of every `cw` command it runs, except a new General session.
- New sessions pass `--harness`; resumed sessions never do.
- The task list's "+ Account" button is now "Accounts"; creating an account no longer opens a terminal.
- Done asks for confirmation when a task has uncommitted changes, unpushed commits or an open pull request, or when Forge cannot read its changes.
- `POST /api/cw/done` waits for `cw --done` and returns its error; a failed close leaves the task active. Forge no longer writes `session.json` itself.
- `/api/cw/git/diff` compares against the task's base branch instead of the last five commits, and every git route runs git without a shell.

### Fixed

- Installing a skill from Explore failed with "slug is required": Forge reads the current skills.sh search response and installs into `~/.claude/skills` with `skills add <repo> --skill <name> --agent claude-code`, even when Forge runs inside a CW session.
- `POST /api/skills/install` takes `repo` and `skill` instead of `slug`, installs account and project skills with the skills CLI instead of guessing a GitHub raw URL, answers 404 for an unknown account or project, and returns the CLI's reason when it cannot install a skill.

### Security

- In local mode Forge listens on `127.0.0.1` and answers 403 to requests and terminal WebSockets from other sites or other hosts. The API no longer sends CORS headers there.
- `FORGE_HOST` sets the listen address for access from another computer, which turns the same-machine check off. Team mode keeps listening on every interface with its bearer token.

### Removed

- The Plan task type, which launched `cw work`.
- Design from New Task, the quick buttons and the filters.

### Known limits

- Browser OAuth redirects to localhost on the machine running the harness. From a remote host (with `FORGE_HOST`) only Codex's device code works.

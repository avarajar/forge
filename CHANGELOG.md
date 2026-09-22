# Changelog

## Unreleased

### Added

- Session states: Forge reads each live terminal and tells whether the agent is working, waiting for you, asking for approval, stopped on an error or exited. The sidebar card and the tab show it, sessions that need you move to the top of Live now, and the page title counts them. Claude Code has its own rules; other harnesses only report activity.
- Browser notifications when a session starts needing you (off by default, switch in the sidebar). The session on screen never notifies; clicking a notification opens its tab.
- `GET /api/cw/session-states`, which returns states only, never terminal text.
- Optional Jev classifier (TypeSafe) for screens the local rules are unsure about, and for harnesses without rules: set `FORGE_STATE_CLASSIFIER=jev` and `TYPESAFE_API_KEY` (`FORGE_JEV_MODEL` picks the model, default `jev-latest`). When on, the last 30 lines of those terminals are sent to TypeSafe; when the call fails or is unsure, the local answer stays, and an error the local rules found is never sent.
- Jev shadow mode for trying it out over days: `FORGE_JEV_SHADOW=1` asks Jev about every new screen of every terminal, Claude Code and errors included, and never applies its answer, so states and notifications stay on the local rules. The last 30 lines of all terminals leave the machine while it is on.
- `FORGE_STATE_LOG=<path>` appends one JSON line per Jev call (local answer, Jev's answer, latency, outcome and the screen Jev saw) to compare the two. The file holds terminal text and stays on this machine. `GET /api/cw/session-states` also says whether shadow mode is on.
- Skills lists Claude Code plugin skills: each installed plugin once, the accounts that have it with version and state, and its skills read-only. Plugins apply to Claude Code only.
- Propose a skill: when a plugin's repository is a registered CW project, a task in that project writes the skill following its CONTRIBUTING.md and repository skills, and opens a pull request.
- Update a plugin in one account (`claude plugin marketplace update` and `claude plugin update`), so a merged skill applies to new sessions without waiting for auto-update.
- `GET /api/skills/plugins`, `GET /api/skills/plugins/:id/skills/:name` and `POST /api/skills/plugins/:id/update`.
- Prototypes launch Liveframe: create a frame (`lf new`) or pull one (`lf pull`) into `~/liveframe/<project>/<frame>` and Forge opens an agent in it on the `monoku` CW account (`FORGE_LIVEFRAME_ACCOUNT` changes it); every local frame lists its live link, a push (`lf push`) and Open agent. Uses the `lf` CLI signed in on this machine. `/api/liveframe` (`status`, `frames`, `pull`, `frames/:project/:frame/push`).
- A general session can run in any folder under a name (`directory` and `task` on `POST /api/cw/start`).
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

- The screen sent to Jev and written to `FORGE_STATE_LOG` lost letters ("t e user to co firm"): Claude Code redraws a row by writing only the cells that changed and jumping over the rest, and the text stripped from the raw stream turned every jump into spaces. Forge now keeps each terminal's screen in a terminal emulator, at the size you resize it to, and sends that.
- A Claude Code turn that ends on a spinner verb with an accent ("Sautéed for 13s"), or whose duration a redraw left out ("Baked for  done 10:12 am"), reads as waiting, not working. Rows Claude Code redraws by moving the cursor are no longer glued into one line.
- A session whose terminal keeps asking for the cursor position (`ESC[?6n` every 200 ms) no longer stays working forever: output with nothing to show no longer counts as activity, so the screen settles and is read. A settled screen also reads correctly when the timer fires a millisecond early, instead of passing for fresh output.
- Jev no longer sees Claude Code's footer notices ("Checking for updates", "new task? /clear…") or repeated lines, which it took for progress under an idle prompt and which pushed the prompt out of the 30 lines it gets.
- Installing a skill from Explore failed with "slug is required": Forge reads the current skills.sh search response and installs into `~/.claude/skills` with `skills add <repo> --skill <name> --agent claude-code`, even when Forge runs inside a CW session.
- `POST /api/skills/install` takes `repo` and `skill` instead of `slug`, installs account and project skills with the skills CLI instead of guessing a GitHub raw URL, answers 404 for an unknown account or project, and returns the CLI's reason when it cannot install a skill.

### Security

- In local mode Forge listens on `127.0.0.1` and answers 403 to requests and terminal WebSockets from other sites or other hosts. The API no longer sends CORS headers there.
- `FORGE_HOST` sets the listen address for access from another computer, which turns the same-machine check off. Team mode keeps listening on every interface with its bearer token.

### Removed

- The Plan task type, which launched `cw work`.
- Design from New Task, the quick buttons and the filters.
- Forge's own prototype sandboxes (generate, preview, Share as PR, Graduate), the sandbox template, the `prototype` skill and `/api/prototype`. Liveframe does the prototyping now.

### Known limits

- Browser OAuth redirects to localhost on the machine running the harness. From a remote host (with `FORGE_HOST`) only Codex's device code works.

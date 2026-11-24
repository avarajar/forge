# Changelog

## Unreleased

## 0.1.37 (2026-11-24)

### Fixed

- The task list no longer holds every other request behind its rows' review states: they go three at a time (an opened task's first), so module banners, a task's MCPs and Kioku load at once instead of after 15–20 s with many tasks. New Task and a task's context panel say they are reading MCPs while they do.

## 0.1.36 (2026-11-23)

### Added

- New Task and a session's context panel list the account's claude.ai connectors (Slack, Linear, Gmail…), read from claude.ai with the account's sign-in (5 min cache). A click turns one off for the session like any other MCP; those that need a new sign-in in claude.ai say so.

## 0.1.35 (2026-11-23)

### Fixed

- MCPs and plugins are read from the CW account's own Claude config (`.claude.json`, plugins), not `~/.claude`, so the project banner and a session's context panel list the ones Claude Code really loads; a project's `.claude/settings.json` no longer shows its other keys as MCPs.

### Added

- New Task shows the MCPs and plugins Claude Code will load for the chosen account and project before the session starts.
- A click on an MCP in New Task starts the Claude Code session without its tools (`--disallowedTools`); the choice is kept when the task reopens.

## 0.1.34 (2026-11-20)

### Changed

- Visual refresh: AA text contrast, quieter task rows, depth instead of hairlines, consistent radii and titles.

### Added

- Monoku OS shows **En curso**: tickets that were yours (your turn once, a request of yours, or started with **Empezar**) and are now someone else's turn, with their box and who has the next step. They do not count as pending and do not notify; a ticket leaves the list when it closes (listo, congelado, archivado). Each reading asks Monoku OS for those tickets' ficha (up to 20).

## 0.1.33 (2026-11-20)

### Fixed

- A session a module starts (Monoku OS's **Empezar**) opens its tab right away instead of saying "That session is not in the list (yet)", which happened while CW was still creating the worktree. `GET /api/cw/session/:project/:sessionDir` now also answers for a session launched headless before CW writes its `session.json`.
- Monoku OS's **Abrir** opens the ticket's page (`/ver/<client>/<project>/<number>-<title>/`) instead of a 404. The session brief carries the same link.

## 0.1.32 (2026-11-20)

### Added

- Monoku OS module (`modules/mod-monoku-os`, not shipped in the npm package): what Monoku OS expects from you (`lo_que_me_toca`), read by a headless agent under your Monoku account, in a banner on the task list and a page of its own. **Empezar** opens a CW session already told which ticket it works on, in the CW project whose git origin is the repository Monoku OS lists for the ticket's project (it asks only when none matches, or which repo when several do, and a choice it remembers wins), **Abrir** opens the ticket page, and **Responder…** answers a question addressed to you after showing exactly what will be written. You choose when it reads: on open (default, when the last reading is older than 30 minutes), every N minutes, once a day, or only by hand. Load it with `forge module dev modules/mod-monoku-os` and turn on "Show on task list".

## 0.1.31 (2026-11-20)

### Security

- Sessions, and the headless agent Today reads with, no longer inherit `FORGE_AUTH_TOKEN`, `FORGE_DB_URL` or `TYPESAFE_API_KEY` from Forge's environment. Before, an agent running in a Forge reachable from other machines could read the token and use the whole API, other sessions' terminals included.

### Changed

- A Claude Code session started from Forge reports what it is doing through Claude Code's own hooks, so its card, the sidebar and the "needs me" notifications show working, waiting and permission as they happen instead of guessing from the screen. Forge loads its hooks with `--settings` next to each account's own (its `settings.json` and the hooks in it are not touched), and each session gets a token that only lets it report itself. The screen is still read for API and limit errors, for a turn interrupted with Esc, and for every other harness.

## 0.1.30 (2026-11-17)

### Added

- Today: the page is an inbox. A list on the left (Needs you, In progress, To do, Updates, with unread dots) and the selected item on the right: the Slack thread or the Linear description and latest comment, the failing checks for GitHub, and the same actions as before. Keys: arrows or j/k, Enter opens the link, S starts, H hides, R researches, / or Cmd+F searches. Under 900px it shows the list, then the item with a Back button.
- Today: Start the day, from the page or the banner, goes through what needs you one card at a time (S start, O open, L later, H hide) with progress kept for the day.

## 0.1.29 (2026-11-17)

### Added

- Today: Slack is read with an explicit procedure (your own user id, mentions, direct messages and replies in threads you took part in), so mentions and DMs no longer slip by.
- Today: Pending gets Slack waiting on you, the mentions, DMs and thread replies of the last 7 days that you have not answered. Each has Open in Slack, Start a task (the message becomes its description), Research (a general session, only on a click) and Hide. They never start on their own.
- Today: Slack waiting on you looks a week back on every reading, so messages older than a day stay listed until you answer; Slack links must be on slack.com, and Research marks the Slack text as untrusted.
- Today: search box (title, key, who, where) and account and source filters with counts, remembered per viewer.

### Changed

- Today: the page is two columns, News and Pending, of one-line rows that open on a click; Pending groups (CI failing, Slack waiting on you, review requests, Linear in progress, issues assigned, Linear to do) fold and remember it. The columns stack on narrow screens, and Read now is called Refresh.
- Today: the banner is one line, `N new · M pending (x CI · y Slack) · Open Today →`, plus at most three urgent rows (failing CI, Slack waiting on you, news) and a single reading or problems line; the full lists and Fold moved out of it. Accept all is now `Accept the N` in the page's News heading and covers only the news in view (account, source and search filters apply).

## 0.1.28 (2026-11-17)

### Added

- Today: a Pending section with what is open now, rebuilt on every reading: review requests asked of you, your pull requests with failing checks, issues assigned to you on GitHub, and your started and unstarted Linear issues (last 30 days). Each has Open task (when a session works on it) or Start, and Hide until it changes. The banner gets a `Pending · N` line that opens to five rows.
- Today: a first reading says that what you have open is under Pending instead of looking empty.

### Changed

- Today: the page shows News then Pending, the day picker reads `Monday 16`, and the header says `Read at 6:15 PM · changes since 1:05 PM` with the previous reading's time.
- Today: rows no longer repeat the issue key in the title or name the source as its own author.

## 0.1.27 (2026-11-17)

### Fixed

- Terminal hyperlinks (OSC 8, what Claude Code prints for URLs) open in the browser without xterm's confirm and blank window, which the desktop app refused.

## 0.1.26 (2026-11-16)

### Fixed

- Today: a reader waits for the account's claude.ai connectors (Linear, Slack) to connect before it starts, so connected accounts no longer report them as unreachable. The one retry after a failed read now waits 15 s.
- Today: only Slack and Linear can be reported as problems; a GitHub hiccup no longer shows up as a reader problem.
- Today: review requests you no longer have (reviewed, closed or reassigned) leave the digest instead of lingering as proposals.

### Changed

- Today: while a reading runs, the banner and page show "Reading monoku · meridian…" with a spinner, check or warning per account, refresh every 3 s, a disabled Refresh, and placeholder rows on a first reading.
- Today: account problems take one line each (`meridian · Slack and Linear did not respond`) with the reasons in a tooltip and a Details toggle on the page.

## 0.1.25 (2026-11-16)

### Added

- Today warns per account when Slack, Linear or the reader fails, with Retry and Reconnect (opens the account's Claude Code at /mcp).

### Fixed

- Today: review requests are the ones asked of you, not of a team you belong to.
- Today: when a reader cannot reach Slack or Linear (for example while the account's connectors are still connecting) it tries once more and then says so on the banner, instead of reporting nothing new.

## 0.1.24 (2026-11-16)

### Fixed

- Desktop app: links in a terminal open in the browser (xterm's default opened a blank window first, which the app refused), and Memory's Open viewer opens the viewer.

## 0.1.23 (2026-11-16)

### Added

- Today module (`mod-today`, bundled): a daily Linear and Slack digest read by a headless agent, shown as a banner on the task list and as the Today page, with item actions (start a task, research, open a session or page).
- Module banners: a module's `view.banner` bundle renders on the task list, served at `GET /api/modules/:id/banner.js` and switched with `PUT /api/modules/:id/banner` (on by default for bundled modules).
- Module SDK 1.1.0: `cw` and `agent` permissions, `ctx.cw.start` (with a work session's `description` and a general session's first `prompt`), `ctx.sessions.send`, `ctx.agent.run` (no built-in tools, run in an empty temporary folder), and `openSession` and `openPage` on the panel client.
- Bundled v1 modules ship in the npm package and the desktop app with their `package.json` and `dist/`.
- Today module: a Refresh button on the banner (header and folded line) reads only what is new since the last reading; days with nothing new keep a minimal line with Refresh instead of hiding the banner.
- Today module reads GitHub with `gh`: comments and reviews on your open pull requests, review requests, mentions, assigned issues and failing checks; a review request starts `cw review` on the pull request. A missing or signed out `gh` is shown as a muted note and the reading goes on. Research that comes from GitHub never starts on its own; it waits for your click.
- Today module ships off: it reads nothing, spends no usage and starts no research until you press Turn on (banner or Today page); Turn off stops it again.
- Today module reads every Claude account: one reader per account in parallel, each with that account's Linear and Slack connectors, projects and sessions; every item shows its account, tasks and research start under it, the banner filters by account and the Today page groups by account. The `account` setting becomes `accounts` (comma separated, empty reads every Claude account); research sessions per day count per account, and an account that fails becomes a note while the others are kept.
- Module SDK: `cw.start` takes `type: 'review'`, and `SessionInfo.taskUrl` is the URL a session's task came from.

### Fixed

- General sessions show in the task list and their tabs come back after a reload: `GET /api/cw/spaces` now includes the ones Forge remembers (until their tab is closed). Marking one done closes it without running `cw`.

## 0.1.22 (2026-11-13)

## 0.1.21 (2026-11-13)

### Security

- Forge reachable from other machines (`FORGE_HOST` set to a non-loopback address, or team mode) refuses to start without `FORGE_AUTH_TOKEN` of at least 16 characters. Before, `FORGE_HOST` alone left the API and the terminals open to anyone who reached the port, and team mode without a token did the same.
- The terminal WebSocket checks the token too; before, only `/api/*` did, so with `FORGE_HOST` or in team mode anyone could open a shell.
- With `FORGE_HOST`, `FORGE_AUTH_TOKEN` is now applied (it was only used in team mode).

### Added

- Remote Forge works in the browser: open `/auth?token=<FORGE_AUTH_TOKEN>` once and Forge keeps the token in an HttpOnly, SameSite=Strict cookie that the console and its terminals send. The CLI and scripts keep using `Authorization: Bearer`. On start, Forge opens this machine's browser already signed in.

## 0.1.20 (2026-11-12)

### Security

- The same-machine check accepts only Forge's own address (and the console's Vite dev server on port 5173): a page served by another program on a different `localhost` port can no longer call the API or open a terminal.
- Forge refuses to be shown inside a frame (`X-Frame-Options: DENY`, `frame-ancestors 'none'`), so another site cannot overlay the console and steer its clicks.
- A malformed WebSocket frame or an upgrade request whose target is not a URL no longer stops the server.
- Session routes and the terminal WebSocket refuse project and session names that climb out of `~/.cw/sessions` (`..`, `%2F..`). Delete project and Start task answer 400 for such names instead of removing or writing outside it.

## 0.1.19 (2026-11-05)

### Added

- A plugin's pane has Uninstall on each account's row: it asks first, then runs `claude plugin uninstall` in that account's config dir. It applies to new sessions; a plugin removed from its last account leaves the list.

## 0.1.18 (2026-10-29)

### Added

- Skills → Plugins gives every skill of a plugin a Run…, since Claude Code offers each one as `/<plugin>:<skill>`: it takes what you write after it (with the skill's `argument-hint` as the hint) and types it into a live Claude Code session of an account with the plugin. Skills marked `user-invocable: false` have none.

## 0.1.17 (2026-10-29)

### Added

- Run a plugin's slash command from Forge: Run… next to a Kioku lab's command (Memory) and next to each command in Skills → Plugins picks a live Claude Code session of an account that has the plugin and types the command, with what it takes, into its terminal.
- Skills → Plugins lists each plugin's commands (its `commands/` folder) beside its skills.

## 0.1.16 (2026-10-29)

### Added

- Memory shows the installed Kioku, the latest stable release and any newer pre-release, with date and notes. Try a version (or Update / Back to stable) after seeing what `kioku update <version> --check` says; once installed, Forge shows `was → version` and what happened to each agent plugin. Releases are read with `gh`, since monoku/kioku is private.
- Memory warns when Kioku's Claude Code plugin in an account has another major version than the tool, which makes Kioku do nothing in those sessions, and offers the release or plugin update that fixes it.
- Memory lists the labs the installed Kioku has (5.0 and later) as kioku reports them, with a switch for each; a change applies from the next session.
- Every one of these actions shows the exact command it runs, with a button to copy it.

## 0.1.15 (2026-10-28)

## 0.1.14 (2026-10-27)

### Added

- Install a module from the console: the + next to Modules in the sidebar (or "Add a module" in ⌘K) takes an npm package, a folder or a git url, shows what the module asks for, and installs exactly the version it showed. A module installed into `~/.forge/modules` has a Remove button on its page; its settings stay saved. Local mode only.
- `forge module install` says plainly when a package is not on npm.

### Fixed

- Modal and Drawer render on `document.body`, so one opened inside a blurred header (like a page's) is no longer trapped behind the page.

## 0.1.13 (2026-10-26)

### Added

- Module SDK v1 (`@forge-dev/sdk` 1.0.0): a module adds a page under Modules in the sidebar and server code (routes under `/api/modules/<id>/`, actions, jobs, event handlers) and installs into a running Forge with no rebuild. Its manifest declares the permissions Forge checks on every call (`network`, `fs:read`, `fs:write`, `shell`, `pty`, filled in from the module's settings). See `docs/module-authoring.md`.
- Actions that reach a third party or spend money ask for Forge's confirmation, which the server enforces, and run on exactly what was shown.
- Module notifications: a red count and a browser notification for what needs you, a grey count for the rest. The notification switch now reads "Notify me when a session or module needs me".
- A settings form generated from each module's schema, including lists.
- `forge module install` shows a module's permissions and asks before any of its code runs; `forge module create` scaffolds a module, `forge module dev` loads one and reloads it on change, `forge module list` shows each module's state and reason.
- A module with a bad manifest, an incompatible SDK range or a server that fails to load shows as disabled with the reason; a view that crashes shows an error card in its own area.

### Changed

- The console shares Preact and `@forge-dev/ui` with modules through an import map (`/shared/`); `@forge-dev/ui` is 1.0.0 and builds to `dist`.
- `GET /api/modules` returns each module's status instead of the install records.
- Modal and Drawer close on Escape from the moment they open.

## 0.1.12 (2026-10-26)

### Added

- Saving, deleting a reference or deleting a skill on the Skills page first copies the whole skill to `~/.forge/skill-backups/<scope>/<ref>/<skill>/<time>/`, keeping the newest 10 copies per skill. If the copy fails, nothing is changed and the page shows why.

## 0.1.11 (2026-10-26)

### Changed

- Bundles CW `4fa95d7`: `cw work` adds `~/.cw/templates/work_init.md`, when it exists, to every new task's prompt for all accounts.

## 0.1.10 (2026-10-26)

### Added

- New brain on the Memory page makes a personal, project or team brain on this machine (`kioku brain create`), with no repository.
- Give it a brain, on a project with no project or team brain, links it to an existing brain or a new one (`kioku init`), and kioku writes `kioku.yaml` in the project's repository to commit with the code.
- + Area on a brain card, and Add area in New memory when a brain has none, declare an area (`kioku namespace add`).
- Publish… on a brain that lives only on this machine gives it a repository (`kioku brain publish`): an empty one at the address given, or a private GitHub one made with `gh`. A warning says publishing may need approval and that it is the person's decision; Publish stays off until they tick that they accept it. Kioku runs publish only at a terminal, so Forge runs it in a PTY.

## 0.1.9 (2026-10-24)

### Added

- New memory on the Memory page writes a page through `kioku page save`: brain, area, type (memory, decision, playbook, instinct, rule, context), title, summary and the sections kioku requires; when the brain already has similar pages it lists them and offers Save anyway. Kioku commits it, and pushes a shared brain, with no review step.
- Remember… in a Claude Code task's Memory cell types "Remember this with kioku: …" into the session's terminal, so the agent saves the note with its kioku skill.

## 0.1.8 (2026-10-24)

### Added

- A Memory page shows the Kioku brains on this machine, grouped as personal, project and team, with their pages by kind, the projects that load them and the last two weeks of writes; picking a project shows the chain its sessions load. Open viewer starts Kioku's own viewer (`kioku web`) in a new tab; Forge keeps one running, reuses it, and stops it when Forge stops. Needs `kioku` on PATH or in `~/.local/bin`.
- Each task row shows a memory pill (a dot per brain its project loads, and their pages; hover lists them), and a task's metric strip shows the chain, each brain opening the Memory page on that project.

## 0.1.7 (2026-10-21)

### Fixed

- The sidebar shows Forge's version, read from the installed `forge-cw` package, instead of CW's, and `GET /api/health` reports that version instead of a hardcoded `0.1.0`.

## 0.1.6 (2026-10-07)

### Added

- `mod-qa` is qa-pilot's escalation inbox: the Escalamientos panel lists the open pull requests labelled `qa:needs-human` (through `gh`), shows the gates, checks and findings of the decision qa-pilot posted, this week's counts by label, and lets you approve (`qa:approved`), ask for changes (a PR comment) or open the pull request. Only decisions posted by `github-actions[bot]` count, and a decision made on an older commit cannot be approved. Needs `gh auth login`.
- Module actions take validated parameters: `params` in an action declares each name and a pattern, `POST /api/actions/:module/:action[/stream]` reads `params` from the body and answers 400 when one is missing, undeclared, not a string or does not match the whole pattern. Values reach the command only as `FORGE_PARAM_<NAME>` environment variables, never inside the command string.
- A QA view in the sidebar: pick a CW project and see mod-qa's escalation inbox for it, with each decision's gates, checks, findings and visual changes (before, after and difference, read through `gh api`, opened full size with a click). Module actions take `cwProject` to run in that project's folder.
- `forge-cw` carries mod-qa's manifest, so the QA view works without `forge module add`. The bundled copy wins over one installed in `~/.forge/modules/mod-qa`.

### Removed

- `mod-qa`'s shell actions (unit, E2E, Semgrep, k6, Lost Pixel, full suite, reports) and its Overview, Test Runner, Coverage and Reports panels. The module is now qa-pilot's escalation inbox.

## 0.1.5 (2026-09-30)

### Added

- A task started from a Linear or Notion link shows a Linear (or Notion) button next to GitHub in its header, and a link chip in the task list, done tasks included and at every width.

## 0.1.4 (2026-09-25)

### Added

- Add a plugin from Skills: pick an account, browse the plugins every known marketplace lists, and install one (`claude plugin install`). A marketplace can be added by GitHub repo, git URL or path, and an account that lacks a plugin's marketplace gets it added first. A plugin's pane can also install it in an account that does not have it. Installs go to an account only, since CW sessions do not read plugins from `~/.claude`.
- `GET /api/skills/marketplaces`, `POST /api/skills/marketplaces` and `POST /api/skills/plugins/install`.
- Clicking a task's branch in the task list copies it.

## 0.1.3 (2026-09-25)

## 0.1.2 (2026-09-23)

### Added

- Skills installed from skills.sh go to an account, a project or global, and any skill can be copied to another scope with its files (`POST /api/skills/copy`). Global skills reach CW sessions through the CW that links `~/.claude/skills` into each account at launch.
- The npm package `forge-cw` (`npm i -g forge-cw` or `npx forge-cw`) carries CW. On start Forge installs it into `~/.cw` when it is missing, updates the CW it installed when a newer Forge carries a newer one, and leaves a CW you installed yourself alone unless the bundled one has a higher version. It never edits your shell rc files and puts `~/.cw/bin` on the PATH of its own sessions. `FORGE_SKIP_CW_INSTALL=1` turns it off.
- `forge-cw` can be published: `pnpm pack` in `packages/platform` bundles the server, the console and the CW commit pinned in `cw.lock.json`. A daily workflow opens a pull request when CW's `main` moves.
- Session states: Forge reads each live terminal and tells whether the agent is working, waiting for you, asking for approval, stopped on an error or exited. The sidebar card and the tab show it, sessions that need you move to the top of Live now, and the page title counts them. Claude Code has its own rules; other harnesses only report activity.
- Browser notifications when a session starts needing you (off by default, switch in the sidebar). The session on screen never notifies; clicking a notification opens its tab.
- `GET /api/cw/session-states`, which returns states only, never terminal text.
- Optional Jev classifier (TypeSafe) for screens the local rules are unsure about, and for harnesses without rules: set `FORGE_STATE_CLASSIFIER=jev` and `TYPESAFE_API_KEY` (`FORGE_JEV_MODEL` picks the model, default `jev-latest`). When on, the last 30 lines of those terminals are sent to TypeSafe; when the call fails or is unsure, the local answer stays, and an error the local rules found is never sent.
- Jev shadow mode for trying it out over days: `FORGE_JEV_SHADOW=1` asks Jev about every new screen of every terminal, Claude Code and errors included, and never applies its answer, so states and notifications stay on the local rules. The last 30 lines of all terminals leave the machine while it is on.
- `FORGE_STATE_LOG=<path>` appends one JSON line per Jev call (local answer, Jev's answer, latency, outcome and the screen Jev saw) to compare the two. The file holds terminal text and stays on this machine. `GET /api/cw/session-states` also says whether shadow mode is on.
- Skills lists Claude Code plugin skills: each installed plugin once, the accounts that have it with version and state, and its skills read-only. Plugins apply to Claude Code only.
- Propose a skill: when a plugin's repository is a registered CW project, a task in that project writes the skill following its CONTRIBUTING.md and repository skills, and opens a pull request.
- Update a plugin in one account (`claude plugin marketplace update` and `claude plugin update`), so a merged skill applies to new sessions without waiting for auto-update.
- Skills has a Plugins tab: plugins grouped by marketplace (a hub such as `meridian-plugin-hub` lists each of its plugins), with the installed version, the number of skills and a mark when an account can move to a newer version. A plugin's pane says per account whether it is up to date or which version is available, read from the marketplace copy Claude Code keeps, and Update moves it there.
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

- Skills lists every account's and every project's skills, not only the first account's and the first project's. New skills default to the first account.
- Terminals use `node-pty` 1.2.0-beta.15, which ships ready-made binaries for Linux (glibc, x64 and arm64) as well as macOS, so Forge installs and starts on Linux without compiling anything or running install scripts.
- Forge's local database uses Node's built-in `node:sqlite` instead of `better-sqlite3`, so installing Forge compiles nothing for it. Forge needs Node 22.13 or later; existing `~/.forge/forge.db` files open as before.
- The published command is `forge` (it was `forge-platform`) and takes `--port` and `--no-open`, so `cw forge` starts it.
- Switching to a task tab puts the keyboard in its terminal, so you can type without clicking it first. Tabs in the background no longer take focus when they load.
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

- Stopping a module action, or its timeout, now ends the commands its shell started. On Linux `sh` forks instead of exec'ing, so only the shell died and the action kept running until its commands finished.
- A general session no longer ends with `Session not found` when its terminal exits or Forge restarts: Forge keeps it in `general-sessions.json` in its data dir and relaunches it with the same account, harness and folder until its tab is closed. The conversation itself does not resume.
- A terminal the server refuses stops reconnecting instead of retrying forever, and shows Restart.
- Starting Forge on a busy port no longer crashes with an `EADDRINUSE` stack trace after printing the "running" banner. If a Forge is already running there, `npx forge-cw` opens it; a process that does not answer (a Forge suspended with Ctrl+Z) or another program gets a message saying how to find it and which port to use instead.
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

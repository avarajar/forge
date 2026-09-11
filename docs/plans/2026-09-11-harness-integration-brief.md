# Forge: harness-aware sessions

You are working in the Forge repo (`~/workspace/personal/forge`). Forge is a web dashboard
over CW. CW 0.3.0 makes the same `cw work` / `review` / `plan` / `create` / `open` flow run on
four coding-agent harnesses — Claude Code, Codex CLI, Pi and OpenCode. Today Forge only
knows Claude Code. The goal of this release is to let a Forge user pick the harness for a
task, see which harness each session runs on, and connect each account to each harness,
without typing a command.

This brief is the harness half of decision 5 in
`docs/plans/2026-09-09-plugin-ecosystem-brief.md`, rewritten against what CW actually
shipped. That earlier brief was written before CW was built, and several of its
assumptions turned out to be wrong; they are corrected below. **Recommendation: ship this
brief on its own, before the plugin-ecosystem work.** It depends only on CW, not on the
module SDK, and it can land in days. If the two are kept together, this brief replaces
section 5 of the other one.

Visual reference: `docs/specs/harness-picker.html`. It was corrected on 2026-09-11 against
CW 0.3.0; what changed is listed under "Corrections to the mockup", for the record.

Follow the repo's superpowers process: brainstorm with me first, write a spec in
`docs/specs/`, then a plan in `docs/plans/`, then implement with TDD (Vitest). Keep the
existing conventions: TypeScript strict, ESM, Preact, UnoCSS, spawn with args arrays,
never break `npx @forge-dev/platform`.

**Dependency:** CW 0.3.0, pull request `avarajar/cw#27`. Start only after it is merged and
`./install.sh` has been run, so `~/.cw/bin/cw version` prints `cw 0.3.0`. Forge calls the
installed binary (`packages/core/src/cw-routes.ts:30`), so nothing changes for Forge until
then.

## Forge today keeps working without any of this

This was checked against Forge `831d4ba` and CW 0.3.0 before writing this brief:

- A task created from Forge launches byte-identically on 0.2.0 and 0.3.0 — argv, working
  directory, the full prompt, environment and the `TASK_NOTES.md` Forge pre-writes.
- Forge's `/done` and `/move-project` round-trip `session.json` and `projects.json` through
  `JSON.parse` / `JSON.stringify` of the whole object, so they preserve the new fields.
- Forge never passes `--harness`, so everything it launches stays Claude Code.

So this release is purely additive. Nothing here is needed to keep Forge running.

## What CW 0.3.0 gives you — verified against the real binary

Every shape below was produced by running CW 0.3.0, not copied from its spec.

### Commands and flags

| What | Command |
|---|---|
| Choose a harness for one task | `cw work <project> <task> --harness <h>` — also on `review`, `plan`, `create`, `open` |
| Choose a harness for `general` | `CW_HARNESS=<h> cw launch <account> …` — `launch` has **no** `--harness` flag; every other argument goes to the harness binary verbatim |
| Account × harness status | `cw doctor --json` |
| Sessions with harness, provider, model | `cw spaces --json` (tasks and reviews only — see gaps) |
| Log an account into a harness | `cw account login <account> --harness <h>` |
| Headless login (prints a URL and a code) | add `--no-browser` — **codex only** |
| Store an API key | `… --with-api-key -`, key on stdin — **codex only** |
| Create an account on a harness | `cw account add <name> --harness <h> [--provider <p>] [--model <m>]` |

Harness resolution: a session always resumes on the harness recorded in its `session.json`,
and a session with no `harness` field counts as `claude`. If `--harness` or `CW_HARNESS`
names a different one, CW refuses. For a new session, the first match wins: `--harness`,
the `CW_HARNESS` environment variable, the project's `harness` in `projects.json`, the
account's `harness` in `meta.json`, then `claude`.

### What each harness supports

Queried from each driver with `harness_supports`, not read from documentation:

| Capability | claude | codex | pi | opencode |
|---|---|---|---|---|
| `skip_permissions` | yes | — | — | — |
| `agent_teams` (`--team`) | yes | — | — | — |
| `slash_commands` (`cw loop`) | yes | — | — | — |
| `mcp` | yes | — | — | — |
| `headless_login` (`--no-browser`) | — | yes | — | — |
| `api_key_login` (`--with-api-key -`) | — | yes | — | — |
| `custom_provider` | — | yes | — | yes |
| `model_flag` | yes | yes | yes | yes |
| `resume_by_name` | yes | — | — | — |
| `continue_last` | yes | yes | — | — |

**Only Claude Code has been exercised against a real binary.** Codex, Pi and OpenCode are
tested in CW against recording fakes; Pi rests almost entirely on documentation. Forge's
harness UI will be the first time most of these run for real, so expect it to surface
driver bugs in CW — file them there, do not work around them in Forge.

### `session.json`

Three new fields. **Absent means `claude` / `native`** — every session written before 0.3.0
has none of them.

```json
{ "harness": "codex", "harness_session_id": "", "provider": "native", "model": null }
```

`cw` owns these fields. Forge must never write them.

### `cw doctor --json`

Prints one JSON object, always exits 0, nothing on stderr. It takes about 1.6 s with five
accounts. Trimmed real output:

```json
{
  "schema": 1, "cw_version": "0.3.0", "cw_home": "…", "generated": "…",
  "harnesses": [
    { "name": "claude", "installed": true,  "path": "…", "version": "…", "source": "builtin" },
    { "name": "pi",     "installed": false, "path": null, "version": null, "source": "builtin" }
  ],
  "accounts": [
    { "name": "work", "layout": "legacy", "default_harness": "claude",
      "harnesses": [
        { "harness": "claude", "status": "connected", "provider": "native",
          "provider_kind": "native", "model": null, "has_api_key": false,
          "unofficial": false, "detail": null },
        { "harness": "codex", "status": "not_logged_in", "…": "…" },
        { "harness": "pi", "status": "not_installed", "detail": "pi not found on PATH" }
      ] },
    { "name": "local", "layout": "none", "default_harness": "opencode",
      "harnesses": [
        { "harness": "opencode", "status": "local", "provider": "ollama",
          "provider_kind": "local", "model": "qwen3-coder:14b",
          "detail": { "endpoint": "http://localhost:11434", "reachable": false, "model_pulled": false } }
      ] }
  ],
  "issues":   [ { "code": "git_too_old", "message": "…" } ],
  "warnings": [ { "code": "harness_not_installed", "message": "glm — opencode not installed (install the opencode CLI first)" } ]
}
```

- `status`: `connected` | `not_logged_in` | `not_installed` | `local` | `error`
- `provider_kind`: `native` | `api` | `local`
- `layout`: `split` | `legacy` | `none`. It describes **claude's** credentials only, so do not show it as the account's layout.
- `detail`: `null`, a string, or, when `status` is `local`, an object.
- Issue codes: `git_missing`, `git_too_old`, `python`.
- Warning codes: `claude_missing`, `harness_not_installed`, `no_accounts`, `no_projects`, `no_stacks`, `no_workflows`, `not_authenticated`, `not_initialized`, `orphaned_worktrees`, `project_path_missing`, `stale_sessions`.

### `cw spaces --json`

```json
{ "schema": 1, "spaces": [
  { "project": "proj", "account": "work", "type": "task", "id": "sei-214",
    "harness": "codex", "provider": "native", "model": null, "opens": 1,
    "last_opened": "2026-09-11T18:25:59Z", "worktree": "…/proj/.tasks/sei-214",
    "resume": "cw work proj sei-214", "close": "cw work proj sei-214 --done" } ] }
```

### Refusals Forge must expect

These are real CW messages. Each one exits 1 and launches nothing.

| Situation | CW says |
|---|---|
| Resuming a session with a different `--harness` or `CW_HARNESS` | `Session was created with <a>. Refusing to resume it with <b>.` |
| `cw loop` on anything but claude | `cw loop drives Claude Code's /loop command, which <h> does not have.` |
| `--no-browser` on claude, pi or opencode | `Harness '<h>' has no headless login cw can drive, so --no-browser cannot be honoured.` |
| `--with-api-key` on claude, pi or opencode | `Harness '<h>' has no api-key import cw can drive.` |
| A non-native provider on claude or pi | refused at launch; the provider would be silently ignored |
| A harness with no driver | `Unknown harness '<h>'.` |

## Non-negotiable design decisions

1. **The New Task form gets a Harness selector below Account** (`packages/console/src/pages/NewTask.tsx`).
   - Preselect the account's `default_harness` from `cw doctor --json`.
   - Show every harness. Grey out the ones whose status is `not_installed`, with the reason inline. Leave `not_logged_in` enabled but say so, and offer to connect.
   - Gate Claude-only controls on the capability table above, **never on the harness name**: "Skip permissions" needs `skip_permissions`, agent teams need `agent_teams`.
   - Apply these rules by task type:

     | Forge type | Command |
     |---|---|
     | Dev / task | `cw work … --harness <h>` |
     | Review | `cw review … --harness <h>` |
     | Plan | `cw plan … --harness <h>` |
     | Create | `cw create … --harness <h>`, with `--team` only when the harness has `agent_teams`. Today `pty-manager.ts` always passes `--team`. |
     | Loop | claude only. Disable the other harnesses and explain why. |
     | General | `CW_HARNESS=<h> cw launch <account>`, with `--model` and `--dangerously-skip-permissions` appended **only for claude**, because `launch` forwards them to the harness binary verbatim. |

   - Send `harness` in `POST /api/cw/start` and carry it on `CWSession` (`packages/core/src/cw-types.ts`).

2. **Never pass `--harness`, or set `CW_HARNESS`, when resuming.** CW reads the harness from
   `session.json`. A different one, from either, is refused. The same one is pointless. Only
   a new session gets the flag. Forge spawns CW with its own environment, so a `CW_HARNESS`
   exported in the shell that started Forge would reach every resume: remove it from the
   environment of every command except General, which uses it to launch.

3. **The Model field changes with the harness.** CW has no model catalogue. For claude, keep
   Forge's current list. For the others, default to the account's configured `model` from
   `cw doctor --json` and allow free text. Forge owns any per-harness list of known models.

4. **An Accounts screen with an account × harness matrix** fed by `cw doctor --json`. It
   replaces `CreateAccountModal.tsx` as the entry point. Each cell shows `connected`, a
   Connect button, `local` (with Ollama reachability and pull status), `API key`, or
   `not installed`. How Connect behaves depends on the harness:
   - **codex:** run `cw account login <acct> --harness codex --no-browser` in a hidden PTY. Parse the `CW_LOGIN_URL=` and `CW_LOGIN_CODE=` lines and show an "Open login" button and a copyable device code. An API key field pipes the key to `--with-api-key -` on stdin, and Forge never persists it.
   - **claude, pi, opencode:** none has a headless login CW can drive. Run `cw account login <acct> --harness <h>` in the **visible** embedded terminal and let the user finish in the harness's own UI. That includes storing an API key for an OpenCode API provider, which `opencode auth login` handles itself.
   - While a Connect is in progress, poll `cw doctor --json` no faster than every 3 s until the cell turns `connected`. Otherwise refresh on demand.
   - Creating an account takes an optional harness, provider and model, and maps to `cw account add`.

5. **Harness badges and a filter.** `TaskCard.tsx`, `TaskDetail.tsx` and `TaskList.tsx` show a
   badge with one colour per harness (use the mockup's palette) and a harness filter next to
   the existing ones. When the provider is not `native`, the badge reads
   "OpenCode · glm-5.1". Read `harness`, `provider` and `model` from `session.json`, treating
   absent fields as `claude` and `native`. Sessions written before 0.3.0 must show as Claude Code.

6. **Surface what does not travel between harnesses.** Codex, Pi and OpenCode have no MCP, so a
   Linear or Notion ticket reaches them only when `LINEAR_API_KEY` / `NOTION_TOKEN` is set for
   CW. GitHub always works, through `gh`. If the user picks a non-MCP harness for a Linear or
   Notion task and no token is configured, say so in the form before Start.

7. **Browser OAuth has a documented limit.** It redirects to localhost on the machine running
   the harness. It works when Forge runs locally. On a remote host, only codex's device-code
   flow works, and the UI must say so.

## Corrections to `2026-09-09-plugin-ecosystem-brief.md`, section 5

- **Headless Connect is codex-only, not everything except pi.** The earlier brief assumed a
  hidden-PTY login for every harness, with a terminal revealed "for pi's provider picker".
  In fact only codex supports `--no-browser` and `--with-api-key -`. Claude, Pi and OpenCode
  all need the visible terminal.
- **"The New Task Model list comes from the account's provider"** — CW exposes only the
  account's one configured default model, not a list.
- **"Offer an API key field"** — codex only. Everywhere else the harness's own login UI takes
  the key.
- **Loop is Claude-only, and General uses an environment variable.** The earlier brief did not
  cover either.

## Corrections to the mockup (`docs/specs/harness-picker.html`) — applied 2026-09-11

- **`cw account set work --harness codex` does not exist.** CW has `add`, `list`, `remove`,
  `login` and `migrate`, and an account's default harness can only be set at creation.
  Either CW grows `account set` (see gaps) or the hint must change.
- **"Trae el ticket de Linear" is true only with `LINEAR_API_KEY`.** Codex has no MCP.
- **`codex --cd .tasks/SEI-214`** is not how CW launches codex. CW creates the worktree and
  starts codex with its working directory inside it. The flow diagram should not show a
  `--cd` flag.
- **`.reviews/pr-42`** — `cw review` uses no worktree.
- The model hint no longer lists Codex model names CW does not know; it says non-claude
  harnesses use the account's configured model or free text.
- A table row now says Loop is Claude Code only.
- Everything else matches CW 0.3.0.

## Gaps in CW that this work will hit

Record each as a CW issue rather than working around it in Forge.

1. **No `cw account set <acct> --harness <h>`.** An account's default harness is fixed at creation.
2. **`cw spaces --json` omits loop sessions.** Keep reading loop sessions from `session.json`, as Forge already does, until CW adds them.
3. **No model catalogue.** Forge owns the lists.
4. **No CW path to store an API key for Pi or OpenCode.** Only codex has `api_key_login`.
5. **`cw doctor --json` is slow**, about 1.6 s for five accounts, because it spawns about 60 `python3` processes. Poll gently.
6. **`cw account add … --harness pi`** prints a tip about "opening Claude". This is cosmetic, and Forge ignores the output.
7. **`codex resume --last` directory scoping is unverified.** Confirm it on a real install before relying on resume across tabs.

## Steps

1. **Types and reader.** Add `harness`, `harness_session_id` and `provider` to `CWSession`, defaulting to `claude` and `native` when absent. Add a typed client for `cw doctor --json`. Test with real fixtures captured from CW 0.3.0.
2. **New Task form and `POST /api/cw/start`.** Add the selector, the per-type rules, the capability gating and `buildCommand` in `pty-manager.ts`. Never pass `--harness` on resume.
3. **Badges and filter** on the task list, the cards and the detail view.
4. **Accounts screen.** The matrix, codex's headless Connect with URL and code parsing, the visible-terminal Connect for the rest, the API key over stdin for codex only, and polling.
5. **Linear and Notion notice** for non-MCP harnesses without a token.
6. **Docs.** README and CHANGELOG. The mockup is already corrected; change it only if the UI
   you build departs from it.

## Acceptance criteria

- With no harness chosen anywhere, every Forge flow behaves exactly as today, and existing sessions show as Claude Code.
- Starting a Dev task with Codex selected opens a PTY tab running codex inside the task's worktree, and `session.json` records `"harness": "codex"`.
- Reopening that task from Forge resumes codex without passing `--harness`.
- Loop offers only Claude Code. General with codex launches through `CW_HARNESS` and forwards no Claude-only flags.
- The Accounts matrix matches `cw doctor --json` for every account and harness.
- Clicking Connect on codex completes a login without the user typing any command, and the cell turns `connected`.
- Clicking Connect on claude, pi or opencode opens the visible terminal on `cw account login`.
- An account with a local Ollama provider shows `local`, with reachability and pull status, and needs no login.
- A session on an API provider shows a badge like "OpenCode · glm-5.1".
- Vitest passes. Tests use captured CW fixtures and never touch the real `~/.cw` or `~/.forge`.

## Out of scope

The module SDK and plugin ecosystem, team mode, and any CW bash work. CW gaps are filed in
the CW repo.

---

# Session prompts

Open the session with CW itself:

```
cw work forge harness-integration --account monoku
```

## Prompt 1 — Kickoff and brainstorm

```
Read docs/plans/2026-09-11-harness-integration-brief.md in full before doing anything else.
It is the brief for this release and it is not up for renegotiation on scope. Read
docs/specs/harness-picker.html too: it is the visual reference, already corrected against CW 0.3.0.

Confirm CW 0.3.0 is installed: ~/.cw/bin/cw version must print "cw 0.3.0". Run
`cw doctor --json` and `cw spaces --json` against a copy of ~/.cw, never the real one —
export a scratch CW_HOME and HOME first — and check every field name in the brief against
the real output. Read one real session.json under ~/.cw/sessions to see how old sessions
look without the new fields.

Then read NewTask.tsx, CreateAccountModal.tsx, TaskList.tsx, TaskCard.tsx, TaskDetail.tsx,
cw-types.ts, cw-reader.ts, cw-routes.ts and pty-manager.ts, and report:
1. Where the harness enters each flow, per task type.
2. How the embedded terminal is opened today, and what a hidden PTY for codex login needs.
3. The open questions you need me to answer before writing the spec. Ask them all at once,
   grouped, with your recommended answer for each.

Do not write code or the spec yet.
```

## Prompt 2 — Spec

```
Write the spec at docs/specs/2026-09-11-harness-integration.md. Cover the New Task
selector with the per-type rules and capability gating, resume without --harness, the
Accounts matrix and both Connect flows, the codex API key over stdin, the badges and
filter, the Linear and Notion notice, and the OAuth limit. Include the exact CW JSON
shapes as TypeScript types, built from fixtures captured from CW 0.3.0. Mark anything you
could not verify against a real harness binary as "verify during implementation". Stop
after the spec so I can review it.
```

## Prompt 3 — Plan

```
Spec approved. Write the plan at docs/plans/2026-09-11-harness-integration-plan.md with
superpowers:writing-plans, in the brief's step order. Each task lists its Vitest tests.
Keep tasks small enough to review in one sitting.
```

## Prompt 4 — Execution

```
Execute the plan with superpowers:executing-plans, one task at a time, TDD with Vitest,
stopping for my review after the New Task form works end to end with codex. Commit after
each task in the repo's conventional style with no Claude attribution. Respect CLAUDE.md:
Preact not React, UnoCSS only, spawn with args arrays, no secrets in config files, never
break `npx @forge-dev/platform`. Tests must not touch my real ~/.cw or ~/.forge. Export a
scratch CW_HOME and HOME before running cw — sourcing cw binds CW_HOME to the real ~/.cw.
```

## Prompt 5 — Close

```
Run superpowers:verification-before-completion. Walk the acceptance criteria one by one
with real sessions, pasting the exact commands and outputs. File every CW gap you hit as
an issue in avarajar/cw. Update README and CHANGELOG.
```

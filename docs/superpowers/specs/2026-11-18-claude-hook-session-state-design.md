# Session state from Claude Code hooks

Date: 2026-11-18
Status: approved 2026-11-18

## Intent

Forge shows whether each live session is working, waiting for the user, asking for a permission, in error or exited. Today `StateTracker` (`packages/core/src/session-state.ts`) works that out by reading the terminal screen once the output settles, with hand-written rules for Claude Code (`state-classifier-local.ts`) and an optional remote classifier (Jev). The rules guess: they lag, they misread new Claude Code layouts, and every Claude Code UI change can break them.

Claude Code emits lifecycle events through hooks (session start, prompt submitted, tool start and end, turn stopped, notifications, subagents). When Forge launches a Claude Code session, it should receive those events and take the state from them, keeping the screen reading only where hooks say nothing.

Why now: this is the base for the next step, showing the running tool and pending permission on cards, and later an approvals queue where Forge answers a permission request. That queue needs the hook to wait for Forge's answer, which is why the transport is HTTP (see Approaches).

## Goals

- Sessions of the `claude` harness launched by Forge report their state from hook events.
- The states and notifications that exist today (`/api/cw/session-states`, `useSessionStates`, browser notifications) become reliable with no change to how they look.
- The transport can carry a synchronous answer from Forge back to the hook later, without redesign.

## Non-goals

- No visual change. Showing the running tool, subagent counts, permission detail or a timeline is step 2.
- No approvals queue yet. The hook only reports; it never decides a permission in this step.
- Sessions started outside Forge (`cw work` in the user's own terminal) are out of scope. `StateTracker` only knows Forge's PTYs and that stays true.
- Other harnesses (Codex, OpenCode, Pi) keep the screen reading. ACP is a separate, later spike.
- No change to CW.

## Anti-goals (a failure even if it works)

- Touching the account's `settings.json`, or overriding the user's or plugins' hooks (the `guard-signed-commits.sh` PreToolUse hook, Kioku's).
- A hook that slows Claude Code down noticeably, prints into the conversation, or makes a session fail when Forge is gone or slow.
- An endpoint that lets anything other than the session's own hook write state, or that hands the agent a credential with more power than reporting its own session's events. The global `FORGE_AUTH_TOKEN` never goes into the agent's environment.

## What exists today (verified)

- Forge launches every session as `cw <work|review|loop|create|launch> …` inside a PTY and builds that process's environment (`buildLaunch` in `pty-manager.ts`, starting from `envWithoutHarness()`).
- CW passes its environment through to `claude`; `_harness_exec` only unsets `LINEAR_API_KEY` and `NOTION_TOKEN`.
- CW reads `CW_CLAUDE_FLAGS` from the environment and appends its words to the `claude` argv (`_harness_extra_flags` → `CW_EXTRA_FLAGS`, split on whitespace) for `work`, `review`, `loop`, `create` and `plan`. `cw launch` sets `CW_EXTRA_FLAGS=""` and forwards its own extra arguments to `claude` verbatim; Forge already appends `--model` and `--dangerously-skip-permissions` there.
- Claude Code 2.1.327 accepts `--settings <file-or-json>` to load additional settings. A test on 2026-11-18 with `CLAUDE_CONFIG_DIR` set to a CW account and `--settings` pointing at a file with SessionStart, UserPromptSubmit, PreToolUse, PostToolUse and Stop hooks fired all five, and the hook saw environment variables set on the parent process. Each event's stdin JSON carries `hook_event_name`, `session_id`, `cwd` and, for tool events, `tool_name`.
- CW has prior art: `cw arcade --setup` writes `activity-hook.py` into each account's `settings.json` and appends events to `~/.cw/activity.jsonl`. It is not enabled in the user's accounts and this design does not use it.
- Middleware: `localOriginGuard` on `*` in local mode (accepts a loopback Host with no Origin, which is what a hook's request looks like), and `bearerAuth(FORGE_AUTH_TOKEN)` on `/api/*` when Forge is reachable from other machines.
- Forge's data dir is `~/.forge` (`ensureForgeDir`), shared by the npm entry and the desktop app.

## Approaches

**A. HTTP with a per-session token (chosen).** Forge writes a settings file that registers its hooks. At launch, Forge puts the session key and a random per-session token in the PTY's environment. Each event is POSTed to Forge; the endpoint accepts it only for that session with that token. (Planned with a Node hook script; Claude Code's own `http` hooks replaced the script during implementation, see Hooks settings file.)
Trades: works the same with `FORGE_HOST`; the hook can wait for an answer from Forge, which the approvals queue will need. Costs one more route to protect and a Node start per event.

**B. `curl` inline in the hook command.** Same as A without a script. Simpler, but shell quoting in JSON is fragile and error and timeout handling is weaker.

**C. One JSONL file per session that Forge watches.** No endpoint, no token. One-way only, so the approvals queue would need a redesign.

The user picked A because it is the only one that serves the next step without being redone.

## Design

### Launch (Forge only)

When `buildLaunch` builds a session whose harness is `claude` (`session.harness ?? 'claude'`), for every session type that starts Claude Code (`work`, `review`, `loop`, `create`, `general`; not `login`):

1. Forge generates a random token for that session (at least 32 hex chars) and keeps `key → token` in memory, where `key` is the existing `project::sessionDir`.
2. Forge adds to the PTY environment:
   - `FORGE_HOOK_SESSION`: the session key, URI-encoded (it travels in a header and project names can have any letter).
   - and removes `FORGE_AUTH_TOKEN`, `FORGE_DB_URL` and `TYPESAFE_API_KEY` from every PTY environment, which until now inherited Forge's whole environment (found in the branch review).
   - `FORGE_HOOK_TOKEN`: the per-session token.
3. Forge makes Claude Code load the hooks settings file:
   - For the `cw` subcommands: append `--settings <path>` to `CW_CLAUDE_FLAGS`, keeping whatever value the user already has in their environment. CW reads `skip_permissions: true` from `~/.cw/config.yaml` only when `CW_CLAUDE_FLAGS` is empty, so when the environment has no `CW_CLAUDE_FLAGS` and that config says `true`, Forge puts `--dangerously-skip-permissions` first, as CW would have (found during implementation; the user's config has it on).
   - For `general` (`cw launch`): append `--settings <path>` to the command line, as Forge already does for `--model`.
4. A relaunch of the same key (reconnect, resume) gets a new token; the old one stops being accepted.
5. When the PTY exits or is killed, the token is dropped.

The settings file's path must contain no whitespace, because CW splits `CW_CLAUDE_FLAGS` on whitespace. `~/.forge/` satisfies that for the usual home directories; Forge refuses to inject (and falls back to screen reading for that session, with one warning in the log) if the path has whitespace.

### Hooks settings file

Refined during implementation (2026-11-18): Claude Code 2.1.327 has `http` hooks (`{"type": "http", "url", "headers", "allowedEnvVars", "timeout"}`) that POST the event JSON themselves and can return a permission decision. A test confirmed that header values interpolate `$FORGE_HOOK_TOKEN` and `$FORGE_HOOK_SESSION` from the session's environment, that the request has no `Origin` header, and that Claude Code keeps working when the server is down. So there is no hook script: no Node start per event, no Electron runtime question, nothing to package. Claude Code skips `http` hooks for `SessionStart` only, so that one event uses a `command` hook running `curl` (silent, `-m 2`, output to `/dev/null`, always exit 0, nothing when `FORGE_HOOK_TOKEN` is unset).

- Forge writes the settings file once it is listening, as `~/.forge/hooks/claude-<port>.json`, because the URL in it carries the port. Two Forges (the npm entry and the desktop app) never listen on the same port, so they never share a file (builder-check call). A session's `--settings` path is fixed at launch.
- It registers, with no matcher: `http` hooks for `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`, `Notification`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `SessionEnd`; the `curl` command hook for `SessionStart`. Each `http` hook sends `X-Forge-Hook-Token: $FORGE_HOOK_TOKEN` and `X-Forge-Hook-Session: $FORGE_HOOK_SESSION` with `allowedEnvVars` listing both, and has a 2 s timeout. These names were all found in the installed Claude Code.
- `FORGE_HOOK_URL` is not needed in the environment; the URL lives in the settings file.

### Endpoint

- `POST /api/cw/hook-events`. Body: the trimmed event. Header: `X-Forge-Hook-Token: <per-session token>`.
- It answers `204` when the session key is known and the token matches (constant-time comparison, as `auth.ts` does), `401` otherwise, `400` for a malformed body. Body size is capped (a few KB).
- It goes through `localOriginGuard` in local mode like every route. When `bearerAuth` is on (`FORGE_HOST` or team mode), this route is exempt from the global token and authenticated by the per-session token instead, so the agent never needs `FORGE_AUTH_TOKEN`. That is the only exemption and it is listed next to `/api/health` in `bearerAuth`.
- The URL is built from the address the server is actually bound to: `127.0.0.1` for all interfaces, `[::1]` for an IPv6 loopback bind, otherwise that address itself.
- The response is empty in this step. The approvals queue will later return a decision on the permission event; nothing here should prevent that (e.g. do not answer before reading the body).
- A leaked per-session token only lets its holder write state for that one session, which the agent could already influence. This is accepted.

### Payload

Forge stores and uses only: `hook_event_name`, `session_id`, `tool_name` (tool events), `notification_type` and `message` (notification event, if present), the subagent identifier (subagent events), and the receive time. Tool input and output are not sent or stored in this step; tool input will be needed for permission detail in step 2 and is added then. Nothing from the payload is ever returned by `/api/cw/session-states`, which keeps its "states only, never terminal text" rule.

### State from events

`StateTracker` gets a method that takes a hook event for a key. Mapping:

| Event | State |
|---|---|
| `SessionStart` | `waiting` (ready for input) |
| `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionDenied` | `working` |
| `StopFailure` | `error` |
| permission request (dedicated event, or `Notification` whose type says a permission is pending) | `permission` |
| `Notification` saying Claude is idle / waiting for input | `waiting` |
| `Notification` `elicitation_dialog` (an MCP server asking the user) | `permission` |
| `PreCompact` | `working` |
| `Stop` | `waiting` |
| `SessionEnd` | no state change; the PTY exit still sets `exited` |

Entries set from hooks have `source: 'hook'` and confidence 1. A `PreToolUse` or `PostToolUse` after `permission` moves the state back to `working`.

`SubagentStart` and `SubagentStop` do not change the state (the main session is still in its turn); they are accepted so step 2 can count subagents.

**Which Claude session counts (builder-check call, refined during implementation).** One Forge key can see several Claude `session_id`s: each `cw loop` run starts a new one, `/clear` starts a new one, and agent teammates (`cw create --team`) inherit the PTY environment and fire their own events. The key follows one `session_id`. A `SessionStart` with another id switches to it only when the followed session has ended (`SessionEnd`) or when its `source` is `clear` or `resume`; a teammate starting while the lead runs is ignored. Before any `SessionStart`, the first `session_id` seen is followed. Events of other sessions are accepted (204) and ignored for state.

**Hook-driven, on and off (builder-check call).** A key becomes hook-driven on its first followed event. `SessionEnd` of the followed session turns hook-driven off, and the key goes back to today's screen reading until the next `SessionStart`. This covers CW still running in the PTY after `claude` exits (CW's own prompts, `cw loop` sleeping between runs).

Precedence while a key is hook-driven:

- Hook events decide `working`, `waiting` and `permission`, and the remote classifier (Jev) is not asked.
- The screen may still make two transitions that Claude Code has no hook for (builder-check call):
  - `working` or `permission` → `waiting` when the output has settled and the local rules say `waiting` with confidence at or above the local trust level (an interrupted turn, or a permission refused with Esc, fires no `Stop`).
  - `permission` → `working` on the existing output-burst rule (2 s of continuous output: a permission was granted and a long tool is running, and `PostToolUse` only comes at its end).
  
  No other screen-driven change applies: a redraw or the user typing must not turn `waiting` or `permission` into anything else.
- The screen classifier may still set `error`, because API and usage-limit errors are exact screen markers and Claude Code may not emit a hook for them. A hook event after an `error` replaces it.
- The PTY exit still sets `exited`.

Sessions that are not hook-driven (other harnesses, a Claude Code session where injection was refused or the hook never fired, or after `SessionEnd`) behave exactly as today.

### Visible effect

None beyond correctness: the same states, now from hooks. `/api/cw/session-states` keeps its shape; `source` may now be `'hook'`. The console needs no change.

## Constraints

- No change to CW and no write to any account's `settings.json`.
- Every new route sits behind the existing guards as described above; the global token never reaches an agent.
- TypeScript strict, ESM, spawn with args arrays (no shell string concatenation for anything Forge itself spawns; the existing `buildLaunch` quoting rules apply to what it adds).
- Vitest tests, and a `CHANGELOG.md` entry under Unreleased.
- `npx forge-cw` keeps working with zero config: the settings file is created and found automatically.

## Testing

- `buildLaunch`: claude sessions get the three variables and `--settings` (in `CW_CLAUDE_FLAGS` for `cw` subcommands, appended to the existing value; on the command line for `general`); other harnesses and `login` get neither; a path with whitespace is refused.
- Endpoint: 204 with the right token, 401 with a wrong or missing token or an unknown key, 401 with the token of another session, 400 for a bad body, exempt from `bearerAuth` but not from the per-session check, token invalid after relaunch and after exit.
- `StateTracker`: the mapping table; following the latest `SessionStart`'s `session_id` and ignoring others (a teammate's `Stop` does not flip the lead); `SessionEnd` returning the key to screen reading; the two allowed screen transitions (settled `waiting` after `working`, burst `working` after `permission`) and no others (a redraw does not override `waiting` or `permission`); screen `error` still applies and a hook after it replaces it; a key with no hooks behaves as today.
- Settings file: written under `hooks/claude-<port>.json` with the URL for that port and host, `http` hooks with both headers and `allowedEnvVars`, the `curl` command hook for `SessionStart`.
- `skip_permissions`: with the config set and no `CW_CLAUDE_FLAGS` in the environment, `--dangerously-skip-permissions` comes before `--settings`; with `CW_CLAUDE_FLAGS` set, it is kept and `--settings` appended.
- One manual end-to-end check through Forge on a real Claude Code session: start a task, see `working` while it runs, `permission` on a prompt, `waiting` after the turn; and confirm the account's own PreToolUse hook (`guard-signed-commits.sh`) still runs alongside Forge's.

## Left to the builder

- File and module names, where the token map lives (PTY manager or a small module of its own).
- Whether an empty `204` to `PermissionRequest` leaves Claude Code's own prompt in place (expected; checked in the end-to-end run).

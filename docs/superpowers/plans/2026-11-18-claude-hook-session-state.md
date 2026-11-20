# Session state from Claude Code hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude Code sessions launched by Forge report their state through hook events instead of screen reading.

**Architecture:** Once listening, Forge writes `~/.forge/hooks/claude-<port>.json` with `http` hooks (and a `curl` command hook for `SessionStart`) pointing at `POST /api/cw/hook-events`. `buildLaunch` adds `--settings` and a per-session token to claude launches. The endpoint checks the token and feeds `StateTracker.hookEvent`, which follows the latest `SessionStart` and takes precedence over the screen while hook-driven.

**Tech Stack:** TypeScript strict, Hono, Vitest, node-pty.

**Spec:** `docs/superpowers/specs/2026-11-18-claude-hook-session-state-design.md`

## Global Constraints

- No change to CW; never write an account's `settings.json`.
- `FORGE_AUTH_TOKEN` never goes into a PTY environment.
- Hook headers: `X-Forge-Hook-Token`, `X-Forge-Hook-Session`; env vars `FORGE_HOOK_TOKEN`, `FORGE_HOOK_SESSION`.
- Settings path must have no whitespace, else no injection for that launch (one warning).
- `/api/cw/session-states` never returns payload text.

## Review Focus

- User's `~/.cw/config.yaml` has `skip_permissions: true` and no `CW_CLAUDE_FLAGS`: sessions must still skip permissions (test in Task 2).
- A relaunch of the same key: the old token is refused (test in Task 1).
- Agent teammate or second Claude session under the same key: its `Stop` must not flip the lead to waiting (test in Task 3).
- Redraw or typing while `permission`/`waiting`: state holds (test in Task 3).
- Remote mode with `FORGE_AUTH_TOKEN`: hook route works with only the per-session token, other routes still need the global one (test in Task 4).

---

### Task 1: `claude-hooks.ts` — tokens, settings file, CW config

**Files:** Create `packages/core/src/claude-hooks.ts`, `packages/core/src/claude-hooks.test.ts`

**Interfaces — Produces:**
- `class ClaudeHooks { constructor(opts: { dir: string; cwHome: string }); listen(port: number, host?: string): string | null /* writes settings, returns path */; launch(key: string): { settingsPath: string; token: string; skipPermissionsDefault: boolean } | null; verify(key: string, token: string | undefined): boolean; revoke(key: string): void; get enabled(): boolean }`
- `hookUrl(port: number, host?: string): string` — loopback unless host is a specific non-loopback, non-wildcard address.
- `hookSettings(url: string): object`
- `HOOK_EVENTS_HTTP: readonly string[]`

- [ ] Tests: settings JSON (http hooks with both headers + allowedEnvVars, `curl` command for SessionStart containing the URL, no matcher); `hookUrl` for `undefined`, `127.0.0.1`, `0.0.0.0`, `::`, `192.168.1.5`; `launch` before `listen` → null; path with whitespace → null; new token per `launch`, old one refused; `verify` constant-time and false after `revoke`; `skipPermissionsDefault` read from `config.yaml` (`^skip_permissions:\s*(true|false)`).
- [ ] Implement, run `pnpm --filter @forge-dev/core exec vitest run src/claude-hooks.test.ts`, commit.

### Task 2: `buildLaunch` and `PTYManager`

**Files:** Modify `packages/core/src/pty-manager.ts`, `packages/core/src/pty-launch.test.ts`, `packages/core/src/pty-manager.test.ts` if needed

**Interfaces — Consumes:** `ClaudeHooks.launch/revoke`. **Produces:** `buildLaunch(session, isNew, hook?: { settingsPath: string; token: string; key: string; skipPermissionsDefault: boolean })`; `new PTYManager(states, hooks?: ClaudeHooks | null)`.

- [ ] Tests: claude `work` gets `FORGE_HOOK_TOKEN`, `FORGE_HOOK_SESSION`, `CW_CLAUDE_FLAGS='--settings <p>'`; existing `CW_CLAUDE_FLAGS` kept with `--settings` appended; empty env + `skipPermissionsDefault` → `--dangerously-skip-permissions --settings <p>`; `general` claude appends `--settings '<p>'` to command; codex and `login` get nothing.
- [ ] Implement; PTYManager calls `hooks.launch(key)` only for claude non-login sessions, revokes on exit and kill. Run tests, commit.

### Task 3: `StateTracker.hookEvent`

**Files:** Modify `packages/core/src/session-state.ts`, `packages/core/src/session-state.test.ts`

**Interfaces — Produces:** `hookEvent(key: string, event: { name: string; sessionId?: string; notificationType?: string }): void`

- [ ] Tests: mapping table from the spec (`StopFailure` → `error`, `PermissionRequest` and `Notification`/`permission_prompt` → `permission`, `idle_prompt` and `Stop` → `waiting`, tool/prompt events → `working`, subagent events no change); source `hook`, confidence 1; other `session_id` ignored after a `SessionStart`; `SessionEnd` returns to screen rules; while hook-driven a burst does not change `waiting`, does change `permission` → `working`; settled confident screen `waiting` after `working` applies; screen `error` applies; Jev not called while hook-driven.
- [ ] Implement, run tests, commit.

### Task 4: Endpoint, auth exemption, listen wiring, docs

**Files:** Modify `packages/core/src/server.ts`, `packages/core/src/auth.ts`, `packages/core/src/start.ts`, tests in `packages/core/src/server.test.ts` (or `hook-events.test.ts`), `CHANGELOG.md`, `CLAUDE.md`

- [ ] Tests: 204 right token; 401 wrong/missing/other session's token/unknown key; 400 bad body; 413-or-400 over 16 KB; with `authToken` set, the route needs no bearer but `/api/cw/spaces` still does.
- [ ] Implement `POST /api/cw/hook-events`; `bearerAuth` exempts exactly that path; server returns `listening(port, host)`; `start.ts` calls it after listen. Run `pnpm test` and `pnpm build`, commit.
- [ ] End-to-end: run Forge from the build, start a Claude Code task, check `/api/cw/session-states` shows `source: 'hook'` through working → permission → waiting, and the account's PreToolUse hook still runs.

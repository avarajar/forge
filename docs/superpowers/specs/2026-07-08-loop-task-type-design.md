# Design: Loop Task Type (CW + Forge)

**Date:** 2026-07-08

## Summary

Add a first-class **Loop** session type: a long-lived Claude session that runs a prompt (or slash command) repeatedly — either on a fixed interval or self-paced via Claude Code's `/loop` skill. CW gets a native `cw loop` subcommand (source of truth, CLI-usable, resumable); Forge gets a Loop task type that launches and monitors it through the existing PTY/tab infrastructure.

This spec covers changes in **two repos**:

- CW (bash script): `/Users/joselito/Workspace/personal/cw/cw`
- Forge (this repo): `packages/core`, `packages/console`

Implementation order: CW first (works standalone from the CLI), then Forge on top.

## Intended use cases (informs UI copy)

- **Watching / polling** — babysit PRs, watch a deploy, monitor error logs.
- **Recurring maintenance** — run tests every 30m and fix breakage, triage new issues hourly.
- **Iterate-until-done (goal mode)** — `/loop` with no interval: Claude self-paces until the objective is met (e.g. "keep fixing failing tests until green").

Not for one-off tasks (use Dev), work requiring per-step human review, or schedules that must survive the machine being off (cloud routines — out of scope).

## Part 1 — CW: `cmd_loop`

New subcommand modeled directly on `cmd_review` (persistent session, **no worktree**, runs in the project path).

### CLI

```
cw loop <project> "<prompt>" [--every <interval>] [--name <slug>] [--account X] [--model Y]
cw loop <project> --list
cw loop <project> <slug> --done
```

- `--every` — interval like `30s`, `5m`, `2h` (validated `^[0-9]+[smh]$`). Omitted → self-paced (`/loop` dynamic mode).
- `--name` — explicit session slug. Default: slugified first ~4 words of the prompt (lowercase, hyphens, `[a-z0-9-]` only, max 30 chars).
- `--list` reuses `_spaces_list "$project" "loop"`.

### Session layout

- Dir: `~/.cw/sessions/<project>/loop-<slug>/`
- `session.json`: same shape as review sessions with `type: "loop"` plus two new fields:
  - `loop_prompt` — the user's prompt
  - `loop_interval` — interval string, or empty for self-paced
- `LOOP_NOTES.md`: header (project/created), `## Objective` (the prompt), `## Iteration Log`, `## Notes` — following the `REVIEW_NOTES.md` pattern.

### Launch behavior

- New session: `cd` to project path, then run Claude with initial prompt `/loop <interval> <prompt>` (or `/loop <prompt>` when self-paced), using the review pattern:
  - `CW_PROJECT`, `CW_TASK=loop-<slug>`, `CW_TASK_TYPE=loop`, `CW_ACCOUNT` env vars
  - `CLAUDE_CONFIG_DIR="$acct_dir" claude $CW_CLAUDE_FLAGS "${model_args[@]}" --name "$account/$project/loop-<slug>" "<init prompt>"`
- Existing active session: resume with `--resume <name> || --continue || --name` fallback chain (same as review), with a short re-entry prompt: "Resume the loop defined in LOOP_NOTES.md — re-invoke /loop with the same objective."
- Existing session with `status: done`: reset and start fresh (same as review).
- `--done`: mark `session.json` status `done` + append to sessions log (same as review).
- Model default: `_model_for_type loop` falls back like other types; account skill symlinks reused from the review code path (extract to a helper only if trivial — otherwise duplicate the 10-line block, consistent with the script's existing style).

### Prompt escaping

The prompt is user text passed through bash → python (session.json) → claude argv. Write it to a file (`loop_prompt.txt` in the session dir) and use `"$(cat ...)"` for the claude invocation — same trick `cmd_review` uses for `recheck_prompt`. For `session.json`, pass values to python via environment variables (not string interpolation) to avoid quote-injection breakage.

## Part 2 — Forge core

### Types (`packages/core/src` session type)

- Add `'loop'` to the `CWSession` type union.
- Add optional fields `loop_prompt?: string`, `loop_interval?: string`.
- `cw-reader.ts` needs no logic change (it parses `session.json` generically) — verify loop sessions created from the CLI appear in `/api/cw/spaces`.

### `cw-routes.ts` — `POST /start` with `type: 'loop'`

- Requires: `project`, `loopPrompt` (non-empty after trim). Optional: `loopInterval`, `account`, `model`, `skipPermissions`, `name`.
- Validate `loopInterval` against `^\d+[smh]$` → 400 on mismatch. Empty/absent = self-paced.
- Compute slug (same algorithm as CW: first words of prompt, or explicit `name`), check `~/.cw/sessions/<project>/loop-<slug>/session.json` for an active duplicate → 409 (same as task flow).
- Create pending session: `type: 'loop'`, `sessionDir: loop-<slug>`, `worktree` = project path, `loop_prompt`, `loop_interval`.
- No notes pre-write (CW creates `LOOP_NOTES.md` itself).

### `pty-manager.ts` — `buildCommand()`

New branch for `type === 'loop'`:

```
cw [--skip-permissions] loop <project> '<prompt>' [--every <interval>] [--name <slug>] [--account X] [--model Y]
```

Prompt single-quoted with `'\''` escaping (same as the `create` branch). Slug passed explicitly via `--name` so Forge's `sessionDir` and CW's dir always agree.

### Stop / done

Existing done flow (`POST /api/cw/done`) already writes `session.json` status and spawns `cw --done`; extend its type dispatch so loop sessions call `cw loop <project> <slug> --done`. Killing the tab/PTY stops the running loop; the session stays resumable until marked done.

## Part 3 — Forge console

### `config/types.ts`

- `TYPE_STYLES['loop']`: label `LOOP`, rose palette (`#e11d48`, `bg-rose-500`, rose tint vars — add `--forge-tint-rose-*` CSS vars where the other tints are defined).
- `QUICK_TYPES`: add `{ key: 'loop', label: 'Loop', style: TYPE_STYLES['loop'] }` after Plan.
- `sessionLabel`: loop sessions → `Loop: <slug>`.

### `NewTask.tsx`

When type is Loop:

- **Prompt** textarea (required) with rotating placeholder examples: "Babysit my open PRs — check for new review comments and address them", "Run the test suite every 30m and fix what breaks", "Work through the TODO backlog one item at a time".
- **Interval** text input (optional), placeholder "auto — Claude decides the pace", inline validation `\d+[smh]`.
- Project selector required; task-name field hidden (slug is derived); description field hidden (the prompt IS the content).
- Submit posts `{ type: 'loop', project, loopPrompt, loopInterval, account, model, skipPermissions }`.

### `TaskCard.tsx`

- Type badge via existing `TypeBadge` (picks up `TYPE_STYLES['loop']` automatically).
- Show interval chip: `⟳ 30m` or `⟳ auto`, sourced from `loop_interval`.

### `TaskDetail.tsx`

No changes — terminal + existing controls cover it. Loop sessions have no git stats worth showing (no worktree); verify the git panel already degrades gracefully for sessions without a worktree (general sessions set the same precedent).

## Error handling

- Empty prompt → 400 "Loop prompt is required".
- Bad interval → 400 "Interval must be like 30s, 5m, 2h".
- Duplicate active loop slug → 409 with the existing "pick a different name" message.
- CW side: missing project → existing `_get_project` error; bad `--every` → usage error.

## Testing

**Forge (Vitest):**

- `buildCommand` loop branch: with/without interval, model, account, skip-permissions; prompt quote-escaping.
- `POST /start` type loop: happy path, empty prompt 400, bad interval 400, duplicate 409, slug derivation.
- Reader: a fixture `session.json` with `type: "loop"` appears in spaces with `loop_prompt`/`loop_interval` intact.

**CW (manual, no test suite exists):**

- `cw loop <project> "test prompt" --every 5m` creates session dir, notes, launches claude with the `/loop` init prompt.
- Re-run resumes; `--done` closes; `--list` shows it; prompt with single quotes/backticks survives.

**End-to-end (manual):** create a loop from Forge UI → tab opens → terminal shows `/loop` running → close tab → reopen resumes → mark done → appears in done list.

## Out of scope

- Cloud scheduled routines (no local state/API).
- Parsing session transcripts for next-run/iteration metadata.
- Notifications when a loop iteration finds something (future work).

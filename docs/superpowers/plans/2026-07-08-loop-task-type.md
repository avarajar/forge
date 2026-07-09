# Loop Task Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class Loop session type — `cw loop` in the CW bash CLI, plus a Loop task type in Forge that launches/monitors it via the existing PTY/tab infrastructure.

**Architecture:** CW gets a `cmd_loop` subcommand modeled on `cmd_review` (persistent session, no worktree, runs in project path, resumable). It launches Claude with a `/loop <interval> <prompt>` initial prompt. Forge adds `type: 'loop'` end to end: `/start` route → pending session → `buildCommand()` emits `cw loop ...` → console UI (type pill, form fields, badge chip).

**Tech Stack:** Bash (CW script), Hono + TypeScript strict + Vitest (Forge core), Preact + UnoCSS (Forge console).

**Spec:** `docs/superpowers/specs/2026-07-08-loop-task-type-design.md`

## Global Constraints

- Two repos: CW = `/Users/joselito/Workspace/personal/cw` (bash, no test suite — manual verification). Forge = `/Users/joselito/workspace/personal/forge` (Vitest, TDD).
- TypeScript strict, ESM only, Preact (`preact/hooks`), UnoCSS utility classes.
- Commit messages: `feat(scope):` / `fix(scope):` style. **Never add Claude/Anthropic attribution or Co-Authored-By trailers.**
- Interval format everywhere: `^[0-9]+[smh]$` (e.g. `30s`, `5m`, `2h`). Empty/absent = self-paced.
- Slug format: lowercase, `[a-z0-9-]`, max 30 chars, no leading/trailing hyphen. Session dir is always `loop-<slug>`.
- `session.json` new fields (written by CW, read by Forge): `loop_prompt` (string), `loop_interval` (string, may be empty).
- Run Forge tests from repo root: `pnpm test` (or scoped: `pnpm --filter @forge-dev/core test`).

---

### Task 1: CW — `cmd_loop` subcommand

**Files:**
- Modify: `/Users/joselito/Workspace/personal/cw/cw`
  - New function `cmd_loop` (insert after `cmd_review`, which ends around line ~1300 — search for the next `# ═══` banner after `cmd_review`)
  - Dispatch table (~line 4488): add `loop)` entry
  - Help text (~line 4364): add `loop` lines under COMMANDS

**Interfaces:**
- Consumes: existing helpers `_get_project`, `_get_field`, `_default_account`, `_ensure_statusline`, `_model_for_type`, `_use_platform_default_model`, `_spaces_list`, `_set_tab_title`, `_log`, `_dim`, `_err`; globals `$CW_HOME`, `$CW_ACCOUNTS_DIR`, `$CW_SESSIONS_LOG`, `$CW_CLAUDE_FLAGS`.
- Produces: CLI `cw loop <project> "<prompt>" [--every <interval>] [--name <slug>] [--account X] [--model Y]`, `cw loop <project> --list`, `cw loop <project> <slug> --done`. Session dir `~/.cw/sessions/<project>/loop-<slug>/` containing `session.json` (with `type: "loop"`, `task: <slug>`, `loop_prompt`, `loop_interval`), `LOOP_NOTES.md`, `loop_prompt.txt`.

- [ ] **Step 1: Add `cmd_loop` to the script**

Insert after the end of `cmd_review` (before the next section banner):

```bash
# ════════════════════════════════════════════════════════════════════════════
# LOOP — recurring/self-paced Claude session via /loop (no worktree)
# ════════════════════════════════════════════════════════════════════════════
cmd_loop() {
    local name="" prompt="" slug="" interval="" done_flag=false list_flag=false account_override="" model_override=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --every|-e)   interval="$2"; shift 2 ;;
            --name)       slug="$2"; shift 2 ;;
            --done)       done_flag=true; shift ;;
            --list)       list_flag=true; shift ;;
            --account|-a) account_override="$2"; shift 2 ;;
            --model|-m)   model_override="$2"; shift 2 ;;
            -*)           shift ;;
            *)
                if [[ -z "$name" ]]; then
                    name="$1"
                elif [[ -z "$prompt" ]]; then
                    prompt="$1"
                fi
                shift ;;
        esac
    done

    # ── List active loops ────────────────────────────────────────────────
    if $list_flag; then
        _spaces_list "$name" "loop"
        return
    fi

    [[ -z "$name" ]] && { _err "Usage: cw loop <project> \"<prompt>\" [--every 30m]"; return 1; }

    local pj; pj=$(_get_project "$name") || { _err "'$name' not found."; return 1; }
    local path; path=$(_get_field "$pj" path "")
    local account; account=${account_override:-$(_get_field "$pj" account "$(_default_account)")}
    local acct_dir="$CW_ACCOUNTS_DIR/$account"
    _ensure_statusline "$acct_dir"

    # ── Done: close loop session (second positional = slug) ─────────────
    if $done_flag; then
        slug="${slug:-$prompt}"
        [[ -z "$slug" ]] && { _err "Usage: cw loop $name <slug> --done"; return 1; }
        local session_dir="$CW_HOME/sessions/$name/loop-$slug"
        _log "Closing loop: ${C}$name${NC} ${Y}$slug${NC}"
        if [[ -f "$session_dir/session.json" ]]; then
            CW_META_FILE="$session_dir/session.json" python3 - <<'PYEOF'
import json, os
from datetime import datetime, timezone
p = os.environ['CW_META_FILE']
with open(p) as f: meta = json.load(f)
meta['status'] = 'done'
meta['closed'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
with open(p, 'w') as f: json.dump(meta, f, indent=2)
PYEOF
        fi
        _log "${G}Loop $slug closed${NC}"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) DONE $name loop=$slug" >> "$CW_SESSIONS_LOG"
        return
    fi

    [[ -z "$prompt" ]] && { _err "Missing prompt. Usage: cw loop $name \"run tests and fix breakage\" --every 30m"; return 1; }

    # ── Validate interval ────────────────────────────────────────────────
    if [[ -n "$interval" ]] && [[ ! "$interval" =~ ^[0-9]+[smh]$ ]]; then
        _err "Invalid interval '$interval'. Use forms like 30s, 5m, 2h."
        return 1
    fi

    # ── Derive slug from prompt when not given ──────────────────────────
    if [[ -z "$slug" ]]; then
        slug=$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | cut -c1-30)
        slug="${slug#-}"; slug="${slug%-}"
    fi
    [[ -z "$slug" ]] && { _err "Could not derive a session name from the prompt. Pass --name <slug>."; return 1; }

    local sessions_dir="$CW_HOME/sessions/$name"
    local session_dir="$sessions_dir/loop-$slug"
    local session_meta="$session_dir/session.json"
    local notes_file="$session_dir/LOOP_NOTES.md"

    mkdir -p "$session_dir"

    local is_new=true
    [[ -f "$session_meta" ]] && is_new=false

    # If session exists but is done, reset it for a fresh start
    if ! $is_new; then
        local session_status
        session_status=$(python3 -c "import json; print(json.load(open('$session_meta')).get('status',''))" 2>/dev/null)
        if [[ "$session_status" == "done" ]]; then
            _log "Previous loop ${Y}$slug${NC} was closed — starting fresh"
            rm -f "$session_meta"
            is_new=true
        fi
    fi

    local model="${model_override:-$(_model_for_type loop)}"
    if [[ -z "$model_override" ]] && ! $is_new && [[ -f "$session_meta" ]]; then
        local stored_model
        stored_model=$(python3 -c "import json; print(json.load(open('$session_meta')).get('model',''))" 2>/dev/null)
        [[ -n "$stored_model" ]] && model="$stored_model"
    fi
    local model_args=()
    if [[ -n "$model" ]]; then
        model_args=("--model" "$model")
    else
        _use_platform_default_model "$acct_dir"
    fi

    if $is_new; then
        _log "New loop: ${C}$name${NC} ${Y}$slug${NC} (${interval:-self-paced})"
        _dim "  Model: ${model:-claude default}"

        # Save session metadata (env vars → python, no quote injection)
        CW_L_PROJECT="$name" CW_L_SLUG="$slug" CW_L_ACCOUNT="$account" CW_L_MODEL="$model" \
        CW_L_PROMPT="$prompt" CW_L_INTERVAL="$interval" CW_L_NOTES="$notes_file" CW_L_META="$session_meta" \
        python3 - <<'PYEOF'
import json, os
from datetime import datetime, timezone
now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
meta = {
    'project': os.environ['CW_L_PROJECT'],
    'task': os.environ['CW_L_SLUG'],
    'type': 'loop',
    'account': os.environ['CW_L_ACCOUNT'],
    'model': os.environ['CW_L_MODEL'],
    'loop_prompt': os.environ['CW_L_PROMPT'],
    'loop_interval': os.environ['CW_L_INTERVAL'],
    'notes': os.environ['CW_L_NOTES'],
    'status': 'active',
    'created': now,
    'last_opened': now,
    'opens': 1
}
with open(os.environ['CW_L_META'], 'w') as f:
    json.dump(meta, f, indent=2)
PYEOF
        _log "Session created: ${C}$session_dir${NC}"

        # ── Account skills: symlink into ~/.claude/skills/ for discovery ──
        local acct_skills_dir="$acct_dir/skills"
        if [[ -d "$acct_skills_dir" ]]; then
            for skill_dir in "$acct_skills_dir"/*/; do
                [[ -d "$skill_dir" ]] || continue
                local skill_name
                skill_name=$(basename "$skill_dir")
                # Skip already-prefixed entries to prevent recursive prefix accumulation
                case "$skill_name" in acct--*) continue ;; esac
                local target="$HOME/.claude/skills/acct--${account}--${skill_name}"
                [[ -e "$target" ]] || ln -sf "$skill_dir" "$target"
            done
        fi

        # Loop notes
        {
            echo "# Loop: $slug"
            echo "**Project:** $name"
            echo "**Interval:** ${interval:-self-paced}"
            echo "**Created:** $(date +%Y-%m-%d)"
            echo ""
            echo "## Objective"
            echo "$prompt"
            echo ""
            echo "## Iteration Log"
            echo "<!-- Claude appends notable outcomes per iteration -->"
            echo ""
            echo "## Notes"
            echo "<!-- Findings, decisions, references -->"
        } > "$notes_file"
    else
        _log "Resuming loop: ${C}$name${NC} ${Y}$slug${NC}"
        _dim "  Model: ${model:-claude default}"
        CW_L_META="$session_meta" CW_L_MODEL="$model_override" python3 - <<'PYEOF'
import json, os
from datetime import datetime, timezone
p = os.environ['CW_L_META']
with open(p) as f: meta = json.load(f)
meta['last_opened'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
meta['opens'] = meta.get('opens', 0) + 1
if os.environ.get('CW_L_MODEL'):
    meta['model'] = os.environ['CW_L_MODEL']
with open(p, 'w') as f: json.dump(meta, f, indent=2)
PYEOF
    fi

    # ── Run Claude ────────────────────────────────────────────────────
    cd "$path"
    _set_tab_title "Loop:$slug - $name"
    local session_name="$account/$name/loop-$slug"

    if $is_new; then
        # Initial prompt: invoke the /loop skill with interval + objective
        local init_prompt
        if [[ -n "$interval" ]]; then
            init_prompt="/loop $interval $prompt"
        else
            init_prompt="/loop $prompt"
        fi
        printf '%s' "$init_prompt" > "$session_dir/loop_prompt.txt"
        CW_PROJECT="$name" CW_TASK="loop-$slug" CW_TASK_TYPE="loop" CW_ACCOUNT="$account" \
        CLAUDE_CONFIG_DIR="$acct_dir" claude $CW_CLAUDE_FLAGS "${model_args[@]}" --name "$session_name" "$(cat "$session_dir/loop_prompt.txt")"
    else
        local resume_prompt="Resume the loop for this session: read $notes_file for the objective and interval, then re-invoke /loop with that same objective (and interval, if any)."
        CW_PROJECT="$name" CW_TASK="loop-$slug" CW_TASK_TYPE="loop" CW_ACCOUNT="$account" \
        CLAUDE_CONFIG_DIR="$acct_dir" claude $CW_CLAUDE_FLAGS "${model_args[@]}" --resume "$session_name" "$resume_prompt" \
            || CLAUDE_CONFIG_DIR="$acct_dir" claude $CW_CLAUDE_FLAGS "${model_args[@]}" --continue "$resume_prompt" \
            || CLAUDE_CONFIG_DIR="$acct_dir" claude $CW_CLAUDE_FLAGS "${model_args[@]}" --name "$session_name" "$resume_prompt"
    fi
}
```

- [ ] **Step 2: Register in dispatch table**

In the `case "$cmd" in` block (~line 4488), after `review)      cmd_review "$@" ;;` add:

```bash
        loop)       cmd_loop "$@" ;;
```

- [ ] **Step 3: Add help text**

In the COMMANDS help section (~line 4364), after the `review <project> <url>` line add:

```
  loop <project> "<prompt>"           Recurring/self-paced Claude loop (no worktree)
    --every, -e <interval>            Fixed interval (30s, 5m, 2h); omit = self-paced
    --name <slug>                     Explicit session name (default: derived from prompt)
```

- [ ] **Step 4: Syntax-check the script**

Run: `bash -n /Users/joselito/Workspace/personal/cw/cw`
Expected: no output (exit 0).

- [ ] **Step 5: Manual verification (no test suite in CW)**

Run each and check the described result. Use a real registered project (see `cw project --list` or `~/.cw/projects.json`); `<proj>` below.

1. `cw loop` → usage error.
2. `cw loop <proj> "watch the test suite" --every 99x` → "Invalid interval" error.
3. `cw loop <proj> "Run pnpm test every so often and fix breakage" --every 30m` → logs "New loop", creates `~/.cw/sessions/<proj>/loop-<slug>/` where `<slug>` is the first 30 chars of the hyphenated prompt (`run-pnpm-test-every-so-often-a`), with `session.json` (`type: "loop"`, `loop_prompt`, `loop_interval: "30m"`), `LOOP_NOTES.md`, `loop_prompt.txt` containing `/loop 30m Run pnpm test...`; Claude opens with the /loop prompt. Exit Claude immediately.
4. Re-run the same command → logs "Resuming loop", `opens` incremented in `session.json`. Exit Claude.
5. `cw loop <proj> --list` → shows the loop session.
6. `cw loop <proj> <slug-from-step-3> --done` → `session.json` status `done`, line appended to `~/.cw/sessions.log`.
7. Prompt with single quotes survives: `cw loop <proj> "check the 'auth' module" --name quote-test` → `session.json` `loop_prompt` is exactly `check the 'auth' module`. Exit Claude, then `cw loop <proj> quote-test --done`.

- [ ] **Step 6: Commit (CW repo)**

```bash
cd /Users/joselito/Workspace/personal/cw
git add cw
git commit -m "feat: add cw loop command — recurring/self-paced Claude sessions"
```

---

### Task 2: Forge core — `CWSession` loop type + reader passthrough

**Files:**
- Modify: `packages/core/src/cw-types.ts:15` (type union), add optional fields
- Test: `packages/core/src/cw-reader.test.ts`

**Interfaces:**
- Produces: `CWSession.type` union includes `'loop'`; optional `loop_prompt?: string`, `loop_interval?: string`. All later tasks rely on these exact names.

- [ ] **Step 1: Write the failing test**

In `packages/core/src/cw-reader.test.ts`, inside the existing `describe` that sets up the fixture CW home (`TEST_CW`), add to the `beforeAll` fixture setup:

```ts
mkdirSync(join(TEST_CW, 'sessions/testproj/loop-watch-tests'), { recursive: true })
writeFileSync(join(TEST_CW, 'sessions/testproj/loop-watch-tests/session.json'), JSON.stringify({
  project: 'testproj', task: 'watch-tests', type: 'loop', account: 'default',
  loop_prompt: 'run tests and fix breakage', loop_interval: '30m',
  worktree: '', notes: '', status: 'active',
  created: '2026-07-01T10:00:00Z', last_opened: '2026-07-02T15:00:00Z', opens: 3
}))
```

And add the test:

```ts
it('includes loop sessions with loop_prompt and loop_interval', () => {
  const sessions = reader.getSessions()
  const loop = sessions.find(s => s.type === 'loop' && s.project === 'testproj')
  expect(loop).toBeDefined()
  expect(loop?.loop_prompt).toBe('run tests and fix breakage')
  expect(loop?.loop_interval).toBe('30m')
})
```

Adapt names to the file's actual reader variable and session-listing method (check how existing tests call it — e.g. `reader.getSessions()` or similar; use the same).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @forge-dev/core test -- cw-reader`
Expected: FAIL — TypeScript error `'"loop"' is not assignable` in the fixture and/or `loop_prompt` not on type. (If the reader passes fields through generically, the only failure is the type error — that still counts; fix in Step 3.)

- [ ] **Step 3: Extend the types**

In `packages/core/src/cw-types.ts` change the `CWSession` interface:

```ts
  type: 'task' | 'review' | 'general' | 'create' | 'loop'
```

and after `source_url?: string` add:

```ts
  loop_prompt?: string
  loop_interval?: string
```

If the reader constructs sessions field-by-field instead of spreading the JSON, add `loop_prompt` and `loop_interval` passthrough there too (`packages/core/src/cw-reader.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @forge-dev/core test -- cw-reader`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cw-types.ts packages/core/src/cw-reader.ts packages/core/src/cw-reader.test.ts
git commit -m "feat(core): add loop session type with loop_prompt/loop_interval"
```

---

### Task 3: Forge core — `buildCommand()` for loop sessions

**Files:**
- Modify: `packages/core/src/pty-manager.ts:53-87` (`buildCommand`)
- Test: `packages/core/src/pty-manager.test.ts`

**Interfaces:**
- Consumes: `CWSession` with `type: 'loop'`, `loop_prompt`, `loop_interval`, `sessionDir: 'loop-<slug>'` (Task 2).
- Produces: shell command `cw [--skip-permissions] loop <project> '<prompt>' --name <slug> [--every <interval>] [--account X] [--model Y]`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/pty-manager.test.ts` (uses the existing `makeSession` helper):

```ts
it('builds correct command for loop sessions with interval', () => {
  const session = makeSession({
    type: 'loop', task: 'watch-tests', sessionDir: 'loop-watch-tests',
    loop_prompt: 'run tests and fix breakage', loop_interval: '30m',
    account: 'work', model: 'sonnet', worktree: '/tmp/testproj',
  })
  const ptySession = manager.getOrCreate('testproj', 'loop-watch-tests', session)
  expect(ptySession.command).toContain("cw loop testproj 'run tests and fix breakage'")
  expect(ptySession.command).toContain('--name watch-tests')
  expect(ptySession.command).toContain('--every 30m')
  expect(ptySession.command).toContain('--account work')
  expect(ptySession.command).toContain('--model sonnet')
})

it('builds loop command without --every when self-paced', () => {
  const session = makeSession({
    type: 'loop', task: 'triage', sessionDir: 'loop-triage',
    loop_prompt: 'triage new issues', loop_interval: '', account: '',
  })
  const ptySession = manager.getOrCreate('testproj', 'loop-triage', session)
  expect(ptySession.command).toContain("cw loop testproj 'triage new issues' --name triage")
  expect(ptySession.command).not.toContain('--every')
  expect(ptySession.command).not.toContain('--account')
})

it('escapes single quotes in loop prompts', () => {
  const session = makeSession({
    type: 'loop', task: 'quotes', sessionDir: 'loop-quotes',
    loop_prompt: "check the 'auth' module",
  })
  const ptySession = manager.getOrCreate('testproj', 'loop-quotes', session)
  expect(ptySession.command).toContain("'check the '\\''auth'\\'' module'")
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @forge-dev/core test -- pty-manager`
Expected: the three new tests FAIL (command falls through to the `cw work` branch).

- [ ] **Step 3: Implement the loop branch**

In `packages/core/src/pty-manager.ts` `buildCommand()`, after the `if (session.type === 'review')` block (line ~78), add:

```ts
    if (session.type === 'loop') {
      const prompt = session.loop_prompt ?? ''
      const quotedPrompt = `'${prompt.replace(/'/g, "'\\''")}'`
      const slug = session.sessionDir?.replace(/^loop-/, '') ?? session.task ?? ''
      let cmd = `${prefix} loop ${session.project} ${quotedPrompt} --name ${slug}`
      if (session.loop_interval) cmd += ` --every ${session.loop_interval}`
      if (session.account) cmd += ` --account ${session.account}`
      if (session.model) cmd += ` --model ${session.model}`
      return cmd
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @forge-dev/core test -- pty-manager`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/pty-manager.ts packages/core/src/pty-manager.test.ts
git commit -m "feat(core): build cw loop command for loop sessions"
```

---

### Task 4: Forge core — `POST /start` and `POST /done` for loops

**Files:**
- Modify: `packages/core/src/cw-routes.ts` (`/start` at line ~166, `/done` at line ~344)
- Test: `packages/core/src/cw-routes.test.ts`

**Interfaces:**
- Consumes: `CWSession` loop fields (Task 2).
- Produces: `POST /api/cw/start` accepts `{ type: 'loop', project, loopPrompt, loopInterval?, name?, account?, model?, skipPermissions? }` → `{ ok: true, session }` with `session.type === 'loop'`, `session.sessionDir === 'loop-<slug>'`. `POST /api/cw/done` for loops spawns `cw loop <project> <task> --done`. The console (Task 6) posts exactly this body shape.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/src/cw-routes.test.ts`:

```ts
it('POST /api/cw/start with type=loop returns loop session', async () => {
  const res = await app.request('/api/cw/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'loop', project: 'testproj',
      loopPrompt: 'Run the Test suite & fix breakage!', loopInterval: '30m',
      account: 'default',
    }),
  })
  expect(res.status).toBe(200)
  const body = await res.json() as { ok: boolean; session: Record<string, unknown> }
  expect(body.ok).toBe(true)
  expect(body.session.type).toBe('loop')
  expect(body.session.loop_prompt).toBe('Run the Test suite & fix breakage!')
  expect(body.session.loop_interval).toBe('30m')
  // slug: lowercased, non-alphanumerics collapsed to hyphens, sliced to 30 chars, hyphens trimmed
  expect(body.session.sessionDir).toBe('loop-run-the-test-suite-fix-breakag')
  expect(body.session.task).toBe('run-the-test-suite-fix-breakag')
  expect(body.session.worktree).toBe('/tmp/testproj')
})

it('POST /api/cw/start type=loop uses explicit name as slug', async () => {
  const res = await app.request('/api/cw/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: 'babysit PRs', name: 'pr-babysitter' }),
  })
  const body = await res.json() as { session: Record<string, unknown> }
  expect(body.session.sessionDir).toBe('loop-pr-babysitter')
  expect(body.session.loop_interval).toBe('')
})

it('POST /api/cw/start type=loop rejects empty prompt', async () => {
  const res = await app.request('/api/cw/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: '   ' }),
  })
  expect(res.status).toBe(400)
})

it('POST /api/cw/start type=loop rejects bad interval', async () => {
  const res = await app.request('/api/cw/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: 'x y z', loopInterval: '99x' }),
  })
  expect(res.status).toBe(400)
})

it('POST /api/cw/start type=loop rejects duplicate active loop', async () => {
  mkdirSync(join(TEST_CW, 'sessions/testproj/loop-dupe'), { recursive: true })
  writeFileSync(join(TEST_CW, 'sessions/testproj/loop-dupe/session.json'), JSON.stringify({
    project: 'testproj', task: 'dupe', type: 'loop', account: 'default',
    worktree: '', notes: '', status: 'active',
    created: '2026-07-01T00:00:00Z', last_opened: '2026-07-01T00:00:00Z', opens: 1,
  }))
  const res = await app.request('/api/cw/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'loop', project: 'testproj', loopPrompt: 'whatever', name: 'dupe' }),
  })
  expect(res.status).toBe(409)
})
```

Note on the slug expectation in the first test: `'Run the Test suite & fix breakage!'` → lowercase → collapse runs of non-`[a-z0-9]` to `-` → `run-the-test-suite-fix-breakage-` → `slice(0, 30)` = `run-the-test-suite-fix-breakag` → trim leading/trailing hyphens (no-op here). The rule: ≤30 chars, no leading/trailing hyphen.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @forge-dev/core test -- cw-routes`
Expected: new tests FAIL (loop requests fall through to "Project and task are required" or task flow).

- [ ] **Step 3: Implement the `/start` loop branch**

In `packages/core/src/cw-routes.ts`:

1. Extend the request-body type of `/start` (line ~167):

```ts
    const { type, project, task, description, workflow, account, directory, skipPermissions, model, loopPrompt, loopInterval, name } = await c.req.json<{
      type: string; project?: string; task?: string; description?: string; workflow?: string; account?: string; directory?: string; skipPermissions?: boolean; model?: string; loopPrompt?: string; loopInterval?: string; name?: string
    }>()
```

2. After the `type === 'create'` block (line ~218), add:

```ts
    if (type === 'loop') {
      if (!project) return c.json({ ok: false, error: 'Project is required' }, 400)
      const prompt = (loopPrompt ?? '').trim()
      if (!prompt) return c.json({ ok: false, error: 'Loop prompt is required' }, 400)
      const interval = (loopInterval ?? '').trim()
      if (interval && !/^\d+[smh]$/.test(interval)) {
        return c.json({ ok: false, error: 'Interval must be like 30s, 5m, 2h' }, 400)
      }
      const slug = (name?.trim() || prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30))
        .replace(/^-+|-+$/g, '')
      if (!slug) return c.json({ ok: false, error: 'Could not derive a name from the prompt' }, 400)

      const sessionDirName = `loop-${slug}`
      const loopSessionFile = join(reader.cwHome, 'sessions', project, sessionDirName, 'session.json')
      if (existsSync(loopSessionFile)) {
        try {
          const meta = JSON.parse(readFileSync(loopSessionFile, 'utf-8'))
          if (meta.status === 'active') {
            return c.json({ ok: false, error: `Loop "${slug}" already exists for ${project}. Pick a different name or open the existing session.` }, 409)
          }
        } catch {}
      }

      const projectPath = reader.getProjects()[project]?.path ?? ''
      const sessionData: CWSession = {
        project,
        task: slug,
        type: 'loop',
        account: account ?? '',
        model: model || undefined,
        loop_prompt: prompt,
        loop_interval: interval,
        workflow: '',
        worktree: projectPath,
        notes: '',
        status: 'active',
        created: new Date().toISOString(),
        last_opened: new Date().toISOString(),
        opens: 0,
        sessionDir: sessionDirName,
        skipPermissions: skipPermissions ?? false,
      }
      pendingSessions.set(`${project}::${sessionDirName}`, sessionData)
      return c.json({ ok: true, session: sessionData })
    }
```

3. In `/done` (line ~349 and ~364), make both the session-dir default and the spawned command loop-aware:

```ts
    const sessionDirName = sessionDir ?? (type === 'review' ? `review-pr-${task}` : type === 'loop' ? `loop-${task}` : `task-${task}`)
```

```ts
    const args = type === 'review'
      ? ['review', project, task, '--done']
      : type === 'loop'
        ? ['loop', project, task, '--done']
        : ['work', project, task, '--done']
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @forge-dev/core test -- cw-routes`
Expected: PASS (all). If the slug assertion mismatches by trailing-hyphen handling, align test to the implemented trim-after-slice order per the note in Step 1.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cw-routes.ts packages/core/src/cw-routes.test.ts
git commit -m "feat(core): start/done endpoints for loop sessions"
```

---

### Task 5: Console — loop type styles, label, and tint vars

**Files:**
- Modify: `packages/console/src/config/types.ts`
- Modify: `packages/console/src/styles/theme.css` (both `:root` blocks with `--forge-tint-*`, lines ~19-30 and ~44-55)

**Interfaces:**
- Consumes: `CWSession` with `type: 'loop'`, `task` = slug (Tasks 2/4).
- Produces: `TYPE_STYLES['loop']`, `QUICK_TYPES` entry `{ key: 'loop' }`, `sessionLabel` handles loops, CSS vars `--forge-tint-rose-bg` / `--forge-tint-rose-border`. TaskCard/TaskList pick these up via existing `getTypeStyle`/`TypeBadge`.

- [ ] **Step 1: Add rose tint CSS vars**

In `packages/console/src/styles/theme.css`, in the first tint block (after `--forge-tint-emerald-border`, line ~28):

```css
  --forge-tint-rose-bg: rgba(225,29,72,0.12);
  --forge-tint-rose-border: rgba(225,29,72,0.25);
```

In the second (dark) tint block (after its `--forge-tint-emerald-border`, line ~53):

```css
  --forge-tint-rose-bg: rgba(225,29,72,0.12);
  --forge-tint-rose-border: rgba(225,29,72,0.3);
```

- [ ] **Step 2: Add loop entry to TYPE_STYLES, QUICK_TYPES, sessionLabel**

In `packages/console/src/config/types.ts`, after the `general` entry in `TYPE_STYLES`:

```ts
  loop: {
    label: 'LOOP',
    color: '#e11d48',
    bg: 'rgba(225,29,72,0.10)',
    border: 'rgba(225,29,72,0.25)',
    dotClass: 'bg-rose-500',
    bgVar: 'var(--forge-tint-rose-bg)',
    borderVar: 'var(--forge-tint-rose-border)',
  },
```

In `QUICK_TYPES`, after the Plan entry:

```ts
  { key: 'loop',    label: 'Loop',    style: TYPE_STYLES['loop'] },
```

In `sessionLabel`, add a branch before the fallback:

```ts
  : s.type === 'loop' ? `Loop: ${s.task ?? 'loop'}`
```

- [ ] **Step 3: Build to verify**

Run: `pnpm --filter @forge-dev/console build` (or `pnpm build` from root)
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add packages/console/src/config/types.ts packages/console/src/styles/theme.css
git commit -m "feat(console): loop type styles and session label"
```

---

### Task 6: Console — NewTask loop form

**Files:**
- Modify: `packages/console/src/pages/NewTask.tsx`

**Interfaces:**
- Consumes: `POST /api/cw/start` loop body shape from Task 4: `{ type: 'loop', project, loopPrompt, loopInterval?, account?, model?, skipPermissions? }`.
- Produces: UI flow to create loops.

- [ ] **Step 1: Add Loop to the TYPES array**

In `NewTask.tsx` line ~17:

```ts
const TYPES = [
  { id: 'dev', label: 'Dev', color: '#f59e0b' },
  { id: 'design', label: 'Design', color: '#8b5cf6' },
  { id: 'review', label: 'Review', color: '#6366f1' },
  { id: 'plan', label: 'Plan', color: '#3b82f6' },
  { id: 'loop', label: 'Loop', color: '#e11d48' },
  { id: 'general', label: 'General', color: '#059669' },
]
```

- [ ] **Step 2: Add loop state and validity**

Next to the existing state hooks (line ~39):

```ts
  const [loopPrompt, setLoopPrompt] = useState('')
  const [loopInterval, setLoopInterval] = useState('')
```

Next to `isGeneral`/`isReview` (line ~48):

```ts
  const isLoop = type === 'loop'
  const loopIntervalValid = !loopInterval.trim() || /^\d+[smh]$/.test(loopInterval.trim())
```

- [ ] **Step 3: Branch the submit payload**

In `handleStart` (line ~100), change the guard and body:

```ts
    if (!isGeneral && !isLoop && !task.trim()) return
    if (isLoop && (!loopPrompt.trim() || !loopIntervalValid)) return
```

In the body construction, replace the `if (!isGeneral) { ... }` block with:

```ts
      if (isLoop) {
        body.project = project
        body.loopPrompt = loopPrompt.trim()
        body.loopInterval = loopInterval.trim() || undefined
      } else if (!isGeneral) {
        body.project = project
        body.task = task.trim()
        body.description = description.trim() || undefined
        body.workflow = workflow || undefined
      } else if (project) {
        body.project = project
      }
```

And the success toast: `showToast(isGeneral ? 'Session started' : isLoop ? 'Loop started' : 'Task started', 'success')`.

- [ ] **Step 4: Render loop fields, hide task/description for loops**

Change the task-name conditional (line ~217) from `{!isGeneral && (` to `{!isGeneral && !isLoop && (`, and the description conditional (line ~233) likewise to `{!isGeneral && !isLoop && (`.

After the description block, add:

```tsx
        {/* Loop prompt + interval */}
        {isLoop && (
          <>
            <div class="mb-4">
              <label class="block text-sm font-medium mb-1">Loop prompt</label>
              <textarea
                value={loopPrompt}
                onInput={(e) => setLoopPrompt((e.target as HTMLTextAreaElement).value)}
                placeholder={'e.g. "Babysit my open PRs — check for new review comments and address them", "Run the test suite and fix what breaks", "Work through the TODO backlog one item at a time"'}
                rows={3}
                class="w-full px-3 py-2 rounded-lg bg-forge-surface border border-forge-border text-forge-text text-sm focus:border-forge-accent focus:outline-none resize-none"
              />
            </div>
            <div class="mb-4">
              <label class="block text-sm font-medium mb-1">
                Interval <span class="font-normal text-forge-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={loopInterval}
                onInput={(e) => setLoopInterval((e.target as HTMLInputElement).value)}
                placeholder="auto — Claude decides the pace"
                class={`w-full px-3 py-2 rounded-lg bg-forge-surface border text-forge-text text-sm focus:outline-none ${
                  loopIntervalValid ? 'border-forge-border focus:border-forge-accent' : 'border-red-500'
                }`}
              />
              {!loopIntervalValid && (
                <div class="text-xs text-red-500 mt-1">Use forms like 30s, 5m, 2h — or leave empty for self-paced</div>
              )}
            </div>
          </>
        )}
```

- [ ] **Step 5: Update button and footer copy**

`ActionButton` (line ~323):

```tsx
        <ActionButton
          label={starting ? 'Starting...' : isGeneral ? 'Launch Session ▶' : isLoop ? 'Start Loop ▶' : 'Start Task ▶'}
          variant="primary"
          loading={starting}
          disabled={(!isGeneral && !isLoop && !task.trim()) || (isLoop && (!loopPrompt.trim() || !loopIntervalValid))}
          onClick={handleStart}
        />
```

Footer hint: extend the ternary with a loop case before the task fallback:

```tsx
          {isGeneral
            ? project
              ? `Opens Claude in "${project}" for account "${selectedAccount || accountList[0] || 'default'}"`
              : `Opens Claude for account "${selectedAccount || accountList[0] || 'default'}"`
            : isLoop
              ? `Runs a recurring Claude loop in "${project}" — ${loopInterval.trim() ? `every ${loopInterval.trim()}` : 'self-paced'}`
              : `Opens a CW session in your terminal for ${project}`
          }
```

Also update the heading (line ~154): `{isGeneral ? 'New Session' : isLoop ? 'New Loop' : 'New Task'}`.

- [ ] **Step 6: Build to verify**

Run: `pnpm --filter @forge-dev/console build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add packages/console/src/pages/NewTask.tsx
git commit -m "feat(console): loop creation form in NewTask"
```

---

### Task 7: Console — interval chip on TaskCard

**Files:**
- Modify: `packages/console/src/components/TaskCard.tsx`

**Interfaces:**
- Consumes: `session.loop_interval` (Task 2), `TYPE_STYLES['loop']` via existing `TypeBadge`.
- Produces: `⟳ 30m` / `⟳ auto` chip on loop task cards.

- [ ] **Step 1: Add the chip component and render it**

In `TaskCard.tsx`, after the `ProjectPill` component definition, add:

```tsx
export const LoopIntervalChip: FunctionComponent<{ interval?: string }> = ({ interval }) => (
  <span
    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
    style={{ color: '#e11d48', backgroundColor: 'var(--forge-tint-rose-bg)', border: '1px solid var(--forge-tint-rose-border)' }}
  >
    ⟳ {interval || 'auto'}
  </span>
)
```

In `TaskCard`, in the row with `ProjectPill` (line ~93), after `<ProjectPill name={session.project} />`:

```tsx
          {session.type === 'loop' && <LoopIntervalChip interval={session.loop_interval} />}
```

Same addition in `DoneTaskRow` after its `ProjectPill` (line ~167).

- [ ] **Step 2: Build to verify**

Run: `pnpm --filter @forge-dev/console build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add packages/console/src/components/TaskCard.tsx
git commit -m "feat(console): loop interval chip on task cards"
```

---

### Task 8: Full verification — test suite + end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run the full Forge suite**

Run from repo root: `pnpm test`
Expected: all packages pass (previously 137 tests + the new ones).

- [ ] **Step 2: Build everything**

Run: `pnpm build`
Expected: success.

- [ ] **Step 3: End-to-end manual check**

1. Start Forge (`pnpm start` or `pnpm dev`), open the dashboard.
2. New Task → Loop pill visible with rose styling → select it: prompt textarea + interval field shown; task/description hidden; project required.
3. Create a loop with prompt "say the current time, that's the whole iteration" and interval `1m` on a small test project → tab opens → terminal shows `cw loop ...` running and Claude starting with the `/loop 1m ...` prompt.
4. Task list shows the card with `LOOP` badge and `⟳ 1m` chip.
5. Close the tab, reopen from the list → CW logs "Resuming loop".
6. Open the loop's TaskDetail view → renders fine; the git stats panel degrades gracefully (loop sessions have no worktree, same as general sessions).
7. Mark done from the card → disappears from active, shows in done list; `~/.cw/sessions/<proj>/loop-.../session.json` has `status: "done"`.
8. Bad interval `99x` in the form → inline validation error, button disabled.

- [ ] **Step 4: Final commit if anything was touched during verification**

```bash
git status  # commit any fixups with fix(scope): messages
```

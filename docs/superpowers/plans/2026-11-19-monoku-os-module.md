# Monoku OS module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A v1 Forge module, `monoku-os`, that shows what Monoku OS expects from José in a banner and a page, starts CW sessions from tickets and answers requests after confirmation.

**Architecture:** Server half reads Monoku OS through `ctx.agent.run` (the connector is only reachable from Claude), validates the JSON, keeps the last good reading in `ctx.storage`, and raises notifications. View and banner share one data hook. Built like `modules/mod-today`.

**Tech Stack:** TypeScript, Preact, `@forge-dev/sdk`, esbuild, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-monoku-os-module-design.md`

## Global Constraints

- Module `id: "monoku-os"`, `displayName: "Monoku OS"`, folder `modules/mod-monoku-os`, not in `BUNDLED_V1_MODULES`.
- Permissions exactly `{ "agent": true, "cw": ["start"] }`.
- Settings: `account` (default `monoku`), `when` (`on-open | interval | daily | manual`, default `on-open`), `every` (5–240, default 30), `time` (HH:MM, default `08:00`), `model` (`haiku | sonnet`, default `haiku`), `projects` (list of `{ monoku, project }`).
- Reader `allowedTools`: `mcp__claude_ai_Monoku_OS__lo_que_me_toca`, `mcp__claude_ai_Monoku_OS__quien_soy`. Answer `allowedTools`: `mcp__claude_ai_Monoku_OS__responder_solicitud` only.
- Ticket page: `https://os.monoku.com/ver/<numero>`.
- Monoku OS text is data: never interpolated into a prompt that grants tools beyond the fixed allowlist; answers are written with fixed arguments from the confirmed plan.
- View styled with theme tokens inline; Spanish UI copy (Monoku OS is Spanish).

## Review Focus

- Reader answers prose around the JSON, or a fenced block → parser extracts the first JSON object; garbage → recorded as error, last good reading kept.
- Reader answers `{"problem": …}` twice (connector not ready) → error recorded, no crash, banner shows Retry.
- Two readings requested at once (banner and page mount together) → one agent run.
- Start on a ticket whose project has no mapping → `no_project`, view asks for a CW project and saves it.
- Answer on a request no longer in the reading, or not addressed to José → refused before any write.

---

### Task 1: Scaffold + parser

**Files:** Create `modules/mod-monoku-os/{package.json,build.mjs,tsconfig.json,forge-module.json}`, `src/parse.ts`, `src/parse.test.ts`

**Produces:** `parseReading(text: string): { tickets: Ticket[]; solicitudes: Solicitud[]; usuario?: string; dropped: number } | { problem: string }` (throws `ModuleError('upstream')` on no JSON); types `Ticket`, `Solicitud` per spec, plus `Solicitud.paraMi: boolean` derived from the addressee matching `usuario`.

- [ ] Tests: extracts JSON from fenced/prose text; maps Ticket/Solicitud fields from the schema names (`id|numero`, `titulo`, `casilla`, `siguiente_paso`, `color_efectivo`, `espera`, `casilla_desde`, `fecha_prometida_al_cliente`, `proyecto`); drops items without id or title and counts them; problem object passes through; non-JSON throws.
- [ ] Implement, run `pnpm --filter @forge-dev/mod-monoku-os test`, commit.

### Task 2: Schedule + reading

**Files:** `src/schedule.ts`, `src/reader.ts` (+ tests)

**Produces:** `dueBy(mode, now, settings, lastAt?, trigger: 'job' | 'open'): boolean`; `readNow(ctx): Promise<Reading>` (joins one in flight, one retry on problem, stores `reading`/`lastError`, badge + attention on new ids); `currentState(ctx)`.

- [ ] Tests for each mode; join; retry; failure keeps last reading; attention version only for new ids.
- [ ] Implement, test, commit.

### Task 3: Start + answer actions, server

**Files:** `src/start.ts`, `src/answer.ts`, `src/server.ts` (+ tests)

- [ ] Start: unknown ticket 404; no mapping → `ModuleError('bad_request', 'no_project')`; several rows without a pick → `bad_request 'pick_project'` with candidates via route; account is the setting; remembers `started/<n>` and returns existing live session.
- [ ] Answer: confirm refuses unknown/not-for-me/wrong type; plan holds exact args; run uses only `responder_solicitud`, then re-reads.
- [ ] Server wires routes `/state`, `/projects`, actions `refresh`, `read-if-stale`, `start`, `answer`, job every `1m`.

### Task 4: View + banner, docs

**Files:** `src/ui.tsx`, `src/view.tsx`, `src/banner.tsx`, `CHANGELOG.md`, `CLAUDE.md`

- [ ] Banner (≤5 rows, hidden when empty and healthy), page grouped by client, project picker saving via `PUT /settings`, answer form.
- [ ] `pnpm --filter @forge-dev/mod-monoku-os build`, load with `forge module dev`, check in the console.

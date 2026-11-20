# Monoku OS module — design

Date: 2026-11-19
Status: draft, awaiting approval

## Intent

Forge is already where José follows everything Claude Code does: sessions, reviews, usage, memory. His pending work
in Monoku OS (Monoku's work system: clients, tickets, requests) lives in another tab. The module puts "what is mine to
do in Monoku OS" inside Forge, next to the sessions, and turns a ticket into a CW session in one click.

Success: opening Forge shows what Monoku OS expects from him without opening os.monoku.com, and starting work on a
ticket takes one click instead of copying a ticket number into a new session.

## Goals

- Show the open tickets whose next step is his and the open requests addressed to him or carried by him
  (`lo_que_me_toca`), refreshed on their own.
- A banner on the task list with those items, one line each, plus a page with the detail.
- **Start**: open a CW session for a ticket, already told which ticket it works on.
- **Open**: the ticket's page on os.monoku.com.
- **Answer** an open request from Forge, after a confirmation that shows exactly what will be written.
- A red count and a browser notification when a new item lands.

## Non-goals (this version)

- Approving, signing, requesting changes, deciding findings, raising or lowering the color. Approving means reading
  the report first (`aprobar` takes `reporte_visto` and `definicion_vista`), and signing and lowering the color need
  the person to sign in again with Google, which an agent cannot do. Those stay on the ticket page, one click away.
- Client boards (`tablero`), capturing new tickets, writing definitions.
- Agent-role tools (`arrancar_vuelta`, `cerrar_vuelta`, `hallazgo`, …). A session started from a ticket may use them,
  as any Claude Code session with the connector can; the module does not.
- Team mode.

## Anti-goals

- Writing anything in Monoku OS the person did not see and confirm in Forge's dialog.
- Showing stale data as if it were current: the page always says when it was last read, and a failed reading says so.
- Becoming a noticeable cost: a reading is a headless agent run, so it must stay cheap (see Constraints).

## Constraints

- Monoku OS is a claude.ai connector (`mcp__claude_ai_Monoku_OS__*`), not a local MCP and, as far as we know, not an
  HTTP API Forge can call. The only way in from Forge's server is `ctx.agent.run`: a headless `claude -p` under a CW
  account whose Claude login has the connector (`agent-runner.ts`, used today by mod-today).
- Each reading costs one model run: seconds of latency and some tokens. Default model `haiku`, default interval
  20 minutes.
- What Monoku OS answers is data, never instructions: ticket titles and request text come from other people and
  clients. The reader returns JSON only, the server validates it, and nothing it says decides which tool runs.
- Writes through the agent are tied to one tool with fixed arguments: the confirmed plan holds the exact arguments,
  the prompt names the single tool, `allowedTools` contains only that tool.
- Writes go with an empty `testigo`, so Monoku OS records them under José's name, marked as written by his agent.
  That is what the connector's instructions prescribe from a conversation.
- SDK v1 module rules: permissions in the manifest, no cross-module imports, view styled with theme tokens and
  `@forge-dev/ui`, no secrets in settings.

## Approaches

Three ways were considered:

- **A. Own page + banner on the task list** (chosen). A v1 module with a page for detail and actions and a banner
  for the at-a-glance list. Uses the banner mechanism that already exists; no change to Forge's core.
- B. Monoku OS tickets as rows mixed with sessions in the task list. Most "one place", but it needs core console
  changes for rows that are not sessions, and it mixes work in progress with work not started.
- C. Monoku OS as one more source in Today. Cheapest, but once a day and without actions, so it does not let him
  manage anything from Forge.

José picked A, named "Monoku OS".

## Design

### Package

`modules/mod-monoku-os`, a v1 module (`id: "monoku-os"`, `displayName: "Monoku OS"`), built like mod-today
(`build.mjs`, `dist/server.js`, `dist/view.js`, `dist/banner.js`, Vitest tests next to the sources).

It is **not** added to `BUNDLED_V1_MODULES`: it is specific to Monoku and Forge is published as `forge-cw`. It loads
with `forge module dev modules/mod-monoku-os` or from `~/.forge/modules`. So its banner is off until "Show on task
list" is turned on once in its settings. *(Claude's call: Forge is published as `forge-cw` for anyone; this module is Monoku-only.)*

### Manifest

```jsonc
{
  "id": "monoku-os",
  "displayName": "Monoku OS",
  "description": "What Monoku OS expects from you, read by a headless agent",
  "server": "./dist/server.js",
  "view": { "entry": "./dist/view.js", "title": "Monoku OS", "banner": "./dist/banner.js" },
  "permissions": { "agent": true, "cw": ["start"], "shell": ["git"] },
  "settings": { "schema": {
    "account":  { "type": "string", "label": "CW account", "help": "The account whose Claude has the Monoku OS connector", "default": "monoku" },
    "when":     { "type": "enum", "label": "When to read", "values": ["on-open", "interval", "daily", "manual"], "default": "on-open" },
    "every":    { "type": "number", "label": "Minutes (on open: max age; interval: period)", "min": 5, "max": 240, "default": 30 },
    "time":     { "type": "string", "label": "Daily at (HH:MM)", "pattern": "^([01]\\d|2[0-3]):[0-5]\\d$", "default": "08:00" },
    "model":    { "type": "enum", "label": "Reader model", "values": ["haiku", "sonnet"], "default": "haiku" },
    "projects": { "type": "list", "label": "Projects", "help": "Which CW project each Monoku OS project opens in",
      "item": {
        "monoku":  { "type": "string", "required": true, "label": "Monoku OS project (cliente/proyecto)" },
        "project": { "type": "string", "required": true, "format": "cw-project", "label": "CW project" }
      } }   // one Monoku OS project may appear in several rows: one per repo
  } }
}
```

### Reading

José chooses when it reads, in the module's settings (`when`):

- **on-open** (default): reads when the banner or the page is shown and the last reading is older than `every`
  minutes (30). The view calls a `read-if-stale` action on mount; the server decides. Nothing runs while Forge is not
  being looked at, so cost follows use.
- **interval**: a job reads every `every` minutes, whether or not the console is open.
- **daily**: a job reads once a day at `time` (or at the first tick after it, as mod-today's `shouldRead` does).
- **manual**: only Read now.

Read now works in every mode. A job ticks every minute and does nothing unless the mode asks for it. One reading at a
time; a request while one runs joins it. *(The default and the four modes are Claude's call from José's "que lo
pueda escoger en Forge".)*

The reading is one `ctx.agent.run`:

- `account`: the `account` setting; `model`: the `model` setting.
- `allowedTools`: `lo_que_me_toca` and `quien_soy`.
- Prompt: call `lo_que_me_toca` and print its result as JSON, nothing else. If the tool is missing or fails, print
  `{"problem": "<what happened>"}`.

As with mod-today, one retry after a short wait when the answer is a problem, because claude.ai connectors can still
be connecting when a headless run starts.

The server parses and validates the JSON into:

```ts
interface Ticket {
  numero: number; titulo: string; cliente: string; proyecto: string   // proyecto as "cliente/proyecto"
  casilla: string; siguientePaso: string; color?: 'verde' | 'ambar' | 'rojo'
  espera?: string; desde?: string; fechaPrometida?: string
}
interface Solicitud {
  id: number; ticket: number; tipo: string; queSePide: string
  autor: string; destinatario: string; bloquea: boolean; venceEn?: string
}
```

The real shape of `lo_que_me_toca` was not seen yet (it answered empty lists on 2026-11-19). The fields above are
taken from the Ticket and Solicitud tables in `esquema`. The builder writes the parser against a captured real answer
before finishing, keeps unknown fields out, and drops (and counts) items without `numero`/`id` and a title or text.

Stored in `ctx.storage`: `reading` = `{ at, tickets, solicitudes }` for the last good reading, plus `lastError`
= `{ at, message }`. A failed reading keeps the last good one and records the error; the view shows both.

### Notifications

After each good reading:
- `notify.badge('pending', tickets + solicitudes)`.
- In on-open and manual modes the browser notification only fires for what a reading finds; it never reads to notify.
- `notify.attention` keyed `new`, with `version` = the sorted ids of items not present in the previous reading, so
  only new items alert. No new items: nothing is raised.
- A blocking request (`bloquea`) or one past `venceEn` gets the red style in the view, but no extra notification.

### Banner (task list)

```
Monoku OS · 3 pendientes                              hace 12 min  ↻
● #42  Login con Google      ACME · te toca: aprobar el trabajo   [Empezar] [Abrir]
● #57  Exportar CSV          Beta · te toca: construir            [Empezar] [Abrir]
○ Solicitud #12 (#57) "¿El CSV incluye los borrados?" · Ana       [Responder…]
```

At most 5 lines, then "+N más" opening the page (`forge.openPage()`). Hidden when there is nothing pending and the
last reading succeeded. A failed reading shows one muted line with the error and Retry.

### Page

Same items with more room: tickets grouped by client, each with its box (`casilla`), color, what it waits on, since
when, and the promised date; requests with the full text, who asked, whether it blocks, when it is due. Header:
last read, Read now, settings. Empty state: "Nada te toca en Monoku OS".

### Actions

| id | effect | does |
|---|---|---|
| `refresh` | local | reads now |
| `read-if-stale` | local | reads only in on-open mode and when the last reading is older than `every` |
| `start` | local | starts a CW session for a ticket |
| `answer` | external | answers a request in Monoku OS |

**Open** is a plain link to `https://os.monoku.com/ver/<numero>` (the ticket page the connector names). The builder
checks the exact path once against a real ticket.

**Start** (`{ numero }`): looks the ticket up in the stored reading (unknown → 404), finds its CW project in the
`projects` setting by `proyecto` (several rows: the view asks which repo first and sends `{ numero, project }`), and calls `ctx.cw.start({ type: 'work', project, account, task, description })`:
- `account`: always the module's `account` setting, even when the CW project is registered under another account,
  because the session needs the Monoku OS connector. José confirmed his client repos work under that account.
- `task`: `#<numero> <titulo>`.
- `description`: tells the session it works ticket `<numero>` of Monoku OS, to read the ticket (`ticket`) and the
  project's context (`contexto_del_proyecto`) with the connector before anything else, and the next step Monoku OS
  shows. The session runs under the same account, so it has the connector itself; Forge does not fetch the ticket.
- No mapping for the ticket's project: the action answers `400 { code: 'no_project' }` and the view asks for a CW
  project (the project picker), saves the mapping through `PUT /api/modules/monoku-os/settings` from the view (a
module server cannot write its own settings), then starts.
- The session is remembered per ticket (`started/<numero>`); a second Start on a ticket with a live session opens
  that session (`forge.openSession`) instead of a new one.

Follow mod-today's `startPending`/`workInput` for how the brief reaches the session.

**Answer** (`{ solicitud, respuesta }`): `confirm` shows the request, the ticket, and the exact text, with the
button "Responder en Monoku OS"; the plan holds `{ solicitud_id, respuesta_textual }`. `run` makes one agent run with
`allowedTools` = `responder_solicitud` only, a prompt that gives the exact arguments (`testigo: ""`, `respuesta_de`
and `que_se_decidio` left empty for Monoku OS to deduce) and asks for the tool's answer as JSON. Success re-reads.
A tool error is shown as is; nothing is retried, since a write may have landed.

Requests whose type needs a decision (`desacuerdo`, `elegir`, `que_hacer_con_el_ticket`, …) carry fields this form
does not ask for; for those the view shows Abrir instead of Responder. Only `pregunta` and `revision_pedida` get
Responder in this version, and only when José is the addressee (`destinatario`). A request he carries for a third
party shows Abrir: an empty `respuesta_de` could be read as `quien_la_llevaba_al_vencer` and close it as expired.
To tell the cases apart the reader also calls `quien_soy` (added to its `allowedTools`) and returns his `usuario`. *(Claude's call, to keep the first form honest about what it writes.)*

## Projects from the repository (added during implementation)

The reader also calls `clientes`, which lists each Monoku OS project with its GitHub `repositorio`. Each ticket gets
that repository (`owner/name`) when its project matches one unambiguously. Start looks for a CW project in this
order: rows in the `projects` setting, then the CW projects whose `git remote get-url origin` is that repository
(read with `ctx.shell.exec`, so the module also asks for `shell: ["git"]`, kept 10 minutes). Only when neither gives
an answer does the view ask.

## Left to the builder

- File layout inside the module, test structure, the view's exact look within the theme tokens.
- Prompt wording, the retry wait, and the parser, once a real `lo_que_me_toca` answer is captured.
- Whether Read now while a reading runs shows progress or just waits.
- CHANGELOG (Unreleased) and a line in CLAUDE.md's module list.

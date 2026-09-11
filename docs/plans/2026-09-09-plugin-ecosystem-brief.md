# Forge next release: a real plugin ecosystem for agent tooling

You are working in the Forge repo (`~/workspace/personal/forge`). Forge is a web dashboard
over CW. Today it has a "module system" that is compile-time only: every module is
imported by hand in `packages/console/src/panels/registry.ts`, added as a dependency of
the console, and rebuilt with it. Actions are raw shell strings in `forge-module.json`.
Five of the seven modules are near-empty shells (all modules together are about 1,300
lines). The goal of this release is to turn the module SDK into something a third party
can build against and install without touching the Forge source. That is the
differentiator: Conductor, Crystal and Vibe Kanban manage sessions; none of them is
extensible.

Follow the repo's superpowers process: brainstorm with me first, write a spec in
`docs/specs/`, then a plan in `docs/plans/`, then implement with TDD (Vitest). Keep the
existing conventions: TypeScript strict, ESM, Preact, UnoCSS.

## Non-negotiable design decisions

1. **Modules load at runtime.** The server discovers modules from `~/.forge/modules/`
   and from `node_modules/@forge-dev/mod-*` and any package whose `package.json` has a
   `forge` field. The console fetches the module list from the server and loads each
   module's prebuilt ESM panel bundle with dynamic `import()`. Preact, `preact/hooks`,
   `@preact/signals` and `@forge-dev/ui` are shared through an import map so bundles
   stay small and share one Preact instance. Delete the hand-written registry.
2. **`forge module` CLI.** `forge module install <npm-name|path|git-url>`,
   `forge module remove`, `forge module list`, `forge module dev <path>` (watch and
   hot-reload), `forge module create <name>` (scaffold). Install must work on a
   production Forge with no rebuild.
3. **SDK v1 is a contract, not a helper.** `@forge-dev/sdk` exports and documents:
   - `definePanel` (exists), `defineAction` (typed handler, not a shell string; shell is
     one of the available executors), `defineDetector`, `defineRoute` (server-side
     handler mounted under `/api/modules/<id>/`), `onEvent` (subscribe to core events:
     session started, session ended, task marked done, project registered, harness
     changed).
   - A typed `forge` client passed to handlers: sessions, projects, accounts, git info,
     PTY spawn, key-value storage scoped to the module, and a `notify` API.
   - A manifest schema (`forge-module.schema.json`) validated at load time with clear
     errors. Manifest declares `permissions`: `shell`, `fs:read`, `fs:write`, `network`,
     `pty`. The server refuses undeclared capabilities.
   - Semver the SDK. Modules declare `forge.sdk: "^1.0.0"`; incompatible ones are listed
     as disabled with a reason, never crash the dashboard.
4. **One real third-party module, outside the monorepo, published to npm.** Pick one
   with clear value and build it end to end as proof: a Linear module that shows the
   ticket for the current session and lets you move its state, or a cost module that
   aggregates token spend per session and project from the harness transcripts. It must
   be developed with `forge module dev`, installed with `forge module install`, and never
   be imported from Forge source.
5. **Harness-aware, end to end.** CW is becoming harness-agnostic in its own release
   (session.json gains a `harness` field, accounts hold one credential dir per harness,
   `cw account login <acct> --harness <h>` and `cw doctor --json` exist). Forge must:
   - **New Task form:** add a Harness selector below Account (Claude Code, Codex, Pi,
     OpenCode). Preselect the account's default. Disable options that are not installed
     or not logged in for that account, with the reason inline. The Model list changes per
     harness. "Skip permissions" and other Claude-only controls show only for Claude Code.
     Send `harness` in `POST /api/cw/start`; the PTY runs `cw work ... --harness <h>`.
   - **Accounts screen:** replace the current create-account modal flow with an
     account x harness matrix fed by `cw doctor --json`: connected / Connect / not
     installed. "Connect" runs `cw account login <acct> --harness <h> --no-browser` in a
     hidden PTY, parses `CW_LOGIN_URL=` and `CW_LOGIN_CODE=` lines, and shows an "Open
     login" button and a copyable device code. If the harness needs an interactive menu
     (pi's provider picker), reveal the embedded terminal for that step only. Offer an API
     key field that is piped to stdin and never persisted by Forge. Poll doctor until the
     cell flips to connected.
   - **Task list and detail:** harness badge with one color per harness on TaskCard and
     TaskDetail, and a harness filter next to the existing account/project/type filters.
     When the account carries a provider/model (GLM, Ollama, OpenRouter), the badge reads
     "OpenCode · GLM 5.1" and the Accounts matrix shows "local" or "API key" instead of
     the Connect button. The New Task Model list comes from the account's provider.
   - **SDK:** include `harness` in session objects and event payloads.
   - **Known limit, document it:** browser OAuth redirects to localhost on the machine
     running the harness. Works when Forge runs locally; in team mode on a remote host,
     fall back to device-code flows and say so in the UI.
   Visual reference for the form and list: `docs/specs/harness-picker.html` (copy the
   mockup the maintainer provides into the repo before starting).
6. **Stop shipping empty modules.** Keep `mod-dev` and `mod-scaffold` as built-ins. Move
   `mod-design`, `mod-qa`, `mod-release`, `mod-monitor`, `mod-planning` out of the default
   install into `examples/` with an honest "starter" label, or delete them. The README
   must not claim seven modules.

## Steps

1. **Spec the SDK surface first.** Write `docs/specs/<date>-module-sdk-v1.md` with the
   full TypeScript API, manifest schema, permission model, event list, loading sequence,
   and failure modes (bad manifest, missing SDK version, panel throws at render, handler
   throws, module removed while a panel is open). Get my sign-off before code.
2. **Runtime loader on the server.** Discovery, manifest validation, permission gating,
   route mounting, event bus. Tests with fixture modules under `packages/core/test/fixtures/`.
3. **Runtime loader on the console.** Import map, dynamic panel loading, error boundary
   per panel so one broken module never blanks the dashboard, disabled-module list in the
   UI with the reason.
4. **Migrate `mod-dev` and `mod-scaffold`** onto SDK v1 as proof the contract is
   sufficient. Delete `registry.ts`. Console must have zero imports from `modules/`.
5. **CLI** (`packages/cli`): install, remove, list, dev, create. `create` scaffolds a
   module that passes its own tests and renders a panel on first run.
6. **Third-party module** in a new repo (`~/workspace/personal/forge-mod-<name>`),
   published to npm under `@forge-dev/`. Record a short demo of install to render.
7. **Docs.** Rewrite `docs/module-authoring.md` against SDK v1. Add `docs/sdk-reference.md`
   generated from the types. Update README, roadmap, CHANGELOG. Bump SDK to 1.0.0.

## Acceptance criteria

- Fresh clone, `pnpm start`, then `forge module install @forge-dev/mod-<name>` renders
  the new panel after a page refresh with no rebuild and no source edit.
- A module with an invalid manifest or an undeclared permission shows as disabled with a
  reason and everything else keeps working.
- A panel that throws during render shows an error card in its own slot only.
- `forge module dev ./my-mod` hot-reloads panel changes without restarting the server.
- `packages/console` has no import from `modules/*`.
- Vitest suite passes; new tests cover discovery, validation, permission gating, events,
  and the CLI.
- Session cards show the harness field when present, and the list can be filtered by it.
- From the Accounts screen, clicking Connect on Codex for an account completes a login
  without the user typing any command; the cell flips to connected when done.
- Starting a task with Codex selected opens a PTY tab running codex inside the worktree.

## Out of scope

Team mode / PostgreSQL changes, a module marketplace UI, authentication changes, and any
CW bash work (separate brief).

---

# Session prompts

How to run this brief with an agent, one prompt per phase. Start only after the CW
release has landed: Forge depends on `harness`, `provider` and `model` in session.json
and on `cw doctor --json`. Open the session with CW itself:

```
cw work forge plugin-ecosystem --account monoku
```

(If the repo is not registered: `cw project register ~/workspace/personal/forge --account monoku`.)

## Prompt 1 — Kickoff and brainstorm

```
Read docs/plans/2026-09-09-plugin-ecosystem-brief.md in full before doing anything else.
It is the brief for the next release and it is not up for renegotiation on scope.
Open docs/specs/harness-picker.html in a browser or read its HTML: it is the visual
reference for the New Task form, the task list badges and the accounts matrix.

CW already shipped its harness-agnostic release. Before assuming anything about it, run
`cw doctor --json`, `cw spaces --json` if it exists, and read one real session.json under
~/.cw/sessions to confirm the exact field names for harness, provider and model. Read
CW's docs/harness-drivers.md and docs/specs/2026-09-09-harness-agnostic.md in
~/workspace/personal/cw for the login line format (CW_LOGIN_URL / CW_LOGIN_CODE).

Then read the monorepo and report:
1. How modules are wired today: registry.ts, console package.json dependencies, the
   forge-module.json manifests, what the SDK exports, how actions execute in runner.ts.
2. Which of the seven modules have real code and which are shells, with line counts.
3. How the console is bundled (Vite config) and what it would take to load a module's
   panel bundle at runtime with a shared Preact instance via an import map.
4. The open questions you need me to answer before writing the SDK spec. Ask them all
   at once, grouped, with your recommended answer for each. Include your recommendation
   for which third-party module to build as proof (Linear ticket panel vs per-session
   cost panel) with one paragraph of reasoning.

Do not write code or the spec yet.
```

## Prompt 2 — Spec (after answering its questions)

```
Write the spec at docs/specs/2026-09-09-module-sdk-v1.md. It must contain the full
TypeScript surface of @forge-dev/sdk v1 (definePanel, defineAction, defineDetector,
defineRoute, onEvent, the forge client passed to handlers, the event list with payload
types including harness/provider/model), the forge-module.json JSON schema with the
permissions model, the discovery order (~/.forge/modules, node_modules/@forge-dev/mod-*,
any package with a "forge" field), the runtime loading sequence on server and console,
the import-map strategy for shared Preact, the semver compatibility rule and how an
incompatible module is shown as disabled, and every failure mode with its user-visible
behavior: bad manifest, undeclared permission, panel throws at render, route handler
throws, module removed while a panel tab is open.

Add a second section for the harness work: the New Task form changes (Harness selector,
per-harness Model list, Claude-only controls hidden otherwise, `harness` in POST
/api/cw/start), the Accounts screen as an account x harness matrix fed by `cw doctor
--json` with Connect / connected / local / API key / not installed states, the hidden-PTY
login flow parsing CW_LOGIN_URL and CW_LOGIN_CODE, when the embedded terminal is revealed,
the API-key-on-stdin path that never persists the key, the harness badge and filter, and
the documented limit that browser OAuth only works when Forge runs on the same machine.

Mark anything you could not verify against the real CW output as "verify during
implementation". Stop after the spec so I can review it.
```

## Prompt 3 — Plan (after approving the spec)

```
Spec approved. Write the implementation plan at
docs/plans/2026-09-09-plugin-ecosystem-plan.md using superpowers:writing-plans.
Order: (1) runtime loader on the server with fixture modules and tests; (2) runtime
loader on the console with import map, per-panel error boundary, disabled-module list;
(3) migrate mod-dev and mod-scaffold to SDK v1 and delete registry.ts, console must end
with zero imports from modules/*; (4) move mod-design, mod-qa, mod-release, mod-monitor,
mod-planning to examples/ with a starter label, fix README claims; (5) forge module CLI:
install, remove, list, dev, create; (6) harness work in the console: New Task selector,
badges and filter, Accounts matrix and Connect flow; (7) third-party module in a new repo
~/workspace/personal/forge-mod-<name>, developed with `forge module dev`, published to
npm, installed with `forge module install`; (8) docs: rewrite module-authoring.md,
generate sdk-reference.md from the types, README, CHANGELOG, SDK 1.0.0.
Each task lists its Vitest tests. Keep tasks small enough to review in one sitting.
```

## Prompt 4 — Execution (after approving the plan)

```
Execute the plan with superpowers:executing-plans, one task at a time, TDD with Vitest,
stopping for my review after task 3 (registry.ts deleted, both built-ins on SDK v1) and
after task 6 (harness UI). Commit after each task with the repo's conventional style
(feat(scope):, refactor:, test:, docs:) and no Claude attribution. Respect CLAUDE.md:
Preact not React, UnoCSS only, spawn with args arrays never string concatenation, no
secrets in config files, never break `npx @forge-dev/platform`. Tests must not touch
my real ~/.cw or ~/.forge; use temporary dirs. For the npm publish in task 7, prepare
everything and stop before running `npm publish` so I run it myself.
```

## Prompt 5 — Close (when everything passes)

```
Run superpowers:verification-before-completion. Then walk the acceptance criteria in
the brief one by one against a fresh clone: `pnpm start`, `forge module install
@forge-dev/mod-<name>` with no rebuild, a deliberately broken manifest showing as
disabled, a panel that throws showing an error card only in its slot, `forge module dev`
hot-reloading, zero imports from modules/* in packages/console, harness badges on real
sessions, and a Connect click on the Accounts screen completing a login without me
typing a command. Paste the exact commands and outputs. Then update README, roadmap and
CHANGELOG and bump the SDK to 1.0.0.
```

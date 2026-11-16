# Task 11: Every connected account

## Implemented
- run.ts: `readAccounts(ctx)` (setting `accounts`, comma separated, only existing Claude accounts, else all); `reread` runs one reader per account with `Promise.all`, each with its account's projects and sessions (items without an account on a project/session go to every reader); failed account -> note `<account>: <error>`, all failed -> reading fails (`a: x; b: y`, a single account keeps the plain message).
- digest.ts: `Item.account`, `itemId(source, link, account?)` (account only for linear/slack), `Digest.autoStarted: number | Record<string, number>`, `startedBy`, `countStart`; parser takes `account`.
- maxAuto per account; a capped account's research waits, others go on. Old numeric `autoStarted` still read (counts for whichever account asks, then becomes a record).
- start/research pass the item's `account` to `ctx.cw.start`; a GitHub item with no account uses the picked project's account.
- accept-all takes optional `account`.
- UI: account chip per row (color from a stable hash over --blue/--purple/--orange/--green/--teal), banner filter chips `All n · monoku n` (localStorage in try/catch), Accept all on visible, page grouped account -> kind (`byAccount` in ops.ts).
- forge-module.json: `accounts` replaces `account`. CHANGELOG and CLAUDE.md updated.

## GitHub mapping
ctx gives no git remote for a project (ProjectInfo = name, path, account), so repo -> project mapping is not possible. GitHub is fetched once and passed only to the first account's reader; each GitHub item takes the account of the project the reader picked (ProjectInfo.account), else of its target session's project, else none.
Projects come from `ProjectInfo.account`, sessions from `SessionInfo.account`.

## TDD
RED: `npx vitest run modules/mod-today` -> 15 failed | 84 passed (new "every account" tests, readAccounts/account missing).
GREEN: `pnpm test` -> mod-today 6 files, 104 passed; `pnpm build` 8/8 successful.

## Browser
Scratch HOME (:3921), digest seeded into module_kv with sqlite (monoku + meridian items). task-11-banner.png is the Today page grouped by account with chips. The task list banner does not render in the scratch HOME (no CW projects), so the banner filter chips were not seen. The red "Last reading failed: no CW account to read with" is the job running with no accounts in the scratch HOME (no reader ran).

## Concerns
- Banner filter not seen in a browser.
- Existing start tests now expect `account: 'monoku'` in `cw.start` input.

## Fix round 1
- perform refuses a project owned by another account than the item's (`project belongs to another account`); the `/projects` route also returns `owners`; the picker uses `projectsFor` (item's account + unowned; all when the item has no account).
- When reader 0 fails and GitHub events were fetched, note `GitHub: not read`.
- Tests: `start refuses a project from another account`, `notes that GitHub was skipped...`, picker filtering in rows.test.ts, server `/projects` owners.
- `pnpm --filter @forge-dev/mod-today test` -> 107 passed; `pnpm build` 8/8.

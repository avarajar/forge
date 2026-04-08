# Design: Optional Project Selector for General Sessions

**Date:** 2026-04-08

## Summary

General sessions currently open Claude for a given account with no project context. This adds an optional project selector so the user can open a general Claude session inside a specific project's directory — without creating worktrees, branches, or any session structure beyond what already exists.

## Scope

Two files change: `NewTask.tsx` (frontend) and `cw-routes.ts` (backend). No new types, no new routes, no PTY changes.

## Frontend — `packages/console/src/pages/NewTask.tsx`

Show the project selector for `type === 'general'`, making it optional. Add a blank/empty option at the top so the user can choose "no project" (account-only behavior). The task name, description, and workflow fields stay hidden for general sessions regardless of project selection.

No changes to the model selector or skip-permissions toggle.

## Backend — `packages/core/src/cw-routes.ts`

In the `type === 'general'` block:

- Accept `project` from the request body (already destructured, currently ignored for general).
- If `project` is provided: look up its path via `reader.getProjects()[project]?.path`. Set `worktree` to that path in `sessionData`. Store the session under the real project name instead of `'__general'`, and key `pendingSessions` with `${project}::${sessionDirName}`.
- If no `project`: existing behavior unchanged (`project: '__general'`, `worktree: ''`).

The CW command stays `cw launch <account>` in both cases. The PTY manager already uses `worktree` as cwd when it's set.

## What does NOT change

- No git worktrees, no branches, no `cw work` commands.
- The CW command is always `cw launch <account>`.
- Task/description fields remain hidden for general sessions.
- Existing account-only general sessions are unaffected.

## Testing

- Existing general session tests pass unchanged.
- Manual: start a general session without project → opens as before.
- Manual: start a general session with project → Claude opens in the project directory.

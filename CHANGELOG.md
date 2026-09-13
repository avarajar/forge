# Changelog

## Unreleased

### Added

- Harness selector in New Task, preselecting the project's or the account's default harness from `cw doctor --json`.
- Harness badge on task cards, done rows and the task detail bar, and a harness filter in the task list.
- Accounts screen: an account × harness matrix, Codex device login and API key import, and a terminal login for Claude Code, Pi and OpenCode.
- `GET /api/cw/harnesses` and the account login and API key endpoints.

### Changed

- Forge removes `CW_HARNESS` from the environment of every `cw` command it runs, except a new General session.
- New sessions pass `--harness`; resumed sessions never do.
- The task list's "+ Account" button is now "Accounts"; creating an account no longer opens a terminal.

### Removed

- The Plan task type, which launched `cw work`.
- Design from New Task, the quick buttons and the filters.

### Known limits

- Browser OAuth redirects to localhost on the machine running the harness. From a remote host only Codex's device code works.

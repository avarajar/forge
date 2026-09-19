# Design: Plugin Skills in Forge

**Date:** 2026-09-18

## Summary

The Skills page only lists skills that live in `<configDir>/skills/*/SKILL.md`. Skills that come from Claude Code plugins (monoku-skills, superpowers, frontend-design…) are invisible, even though every Claude Code session of that account loads them.

This design adds three things:

1. **Plugin skills, read-only.** A Plugins group on the Skills page shows every installed plugin once, which accounts have it, at what version, and the skills it ships.
2. **Propose a skill.** When a plugin's repository is registered as a CW project, a button starts a `cw work` session in that repository that adds the skill following the repository's own contribution rules and opens a pull request.
3. **Update.** A per-account button forces a marketplace refresh and plugin update, so a merged skill reaches that account without waiting for the next auto-update.

Plugins apply to Claude Code only. Codex, Pi and OpenCode sessions do not load them, and the UI says so.

## Background

Each CW account has its own Claude config directory (`~/.cw/accounts/<account>`), and the global one is `~/.claude`. Inside each:

```
plugins/installed_plugins.json    # { version: 2, plugins: { "<name>@<marketplace>": [{ scope, installPath, version, gitCommitSha, installedAt, lastUpdated }] } }
plugins/known_marketplaces.json   # { "<marketplace>": { source: { source: "github", repo: "owner/repo" } | { source: "git", url }, installLocation, autoUpdate } }
plugins/cache/<marketplace>/<plugin>/<version>/   # installPath
settings.json                     # enabledPlugins: { "<name>@<marketplace>": true|false }
```

A plugin's manifest is `<installPath>/.claude-plugin/plugin.json`. monoku-skills nests skills one level deeper than Claude Code scans (`skills/<area>/<name>`), so it lists them explicitly in a `"skills"` array of paths. Skills under `skills/in-progress/` are not in that array and are not installed.

The monoku-skills marketplace has `autoUpdate: true`, so Claude Code refreshes it at start. The Update button exists to apply a change immediately (right after a merge), not because updates are otherwise missing.

## Approach

Forge reads the plugin files directly and uses the `claude plugin` CLI only for writes. Reading through the CLI (`claude plugin list`, `details`) would spawn one process per account on every load and depend on human-oriented output. Reading files is fast, deterministic and testable with fixtures; writing through the CLI keeps Forge out of Claude Code's internal state transitions.

## Core

### `packages/core/src/plugins.ts`

Pure reading, no routes and no process spawning except the injected git remote lookup.

```ts
interface PluginInstall {
  scope: 'global' | 'account'
  scopeRef: string          // 'global' or the account name
  version: string
  enabled: boolean          // settings.json enabledPlugins; missing key counts as enabled
  installPath: string
  lastUpdated?: string
}

interface PluginSkill {
  name: string              // frontmatter name, falling back to the directory name
  description: string
  path: string              // absolute directory of the skill
}

interface PluginEntry {
  id: string                // "monoku-skills@monoku-skills"
  name: string
  marketplace: string
  description: string
  repo?: string             // normalized "owner/repo"
  installs: PluginInstall[]
  skills: PluginSkill[]
  project?: string          // registered CW project whose origin matches repo
  contributing: boolean     // project has CONTRIBUTING.md
  projectSkills: string[]   // skill names in <project>/.claude/skills
}
```

Rules:

- **Config dirs scanned:** global plus every CW account, resolved with the existing `CWReader.getSkillConfigDir`. Entries are grouped by `id`, so a plugin installed in two accounts appears once with two installs.
- **Skills:** taken from the most recently updated install. If `plugin.json` has a `"skills"` array, each entry is resolved against `installPath` and must contain `SKILL.md`. Otherwise `skills/*/SKILL.md` is scanned. Unreadable or missing skills are skipped.
- **Repo:** `plugin.json` `repository` first, then the marketplace source (`github` → `repo`; `git`/`url` → parsed), taking the first candidate that normalizes — so a plugin's own repository wins over a multi-plugin marketplace's source. Normalization accepts `owner/repo`, `git@github.com:owner/repo(.git)` and `https://github.com/owner/repo(.git)`, and lowercases the result for comparison.
- **Project match:** `git remote get-url origin` for each registered project, normalized the same way. Remotes are cached per project path for the lifetime of the reader; a project without a remote or a failing command never matches.
- **Missing files:** a config dir without `plugins/` contributes nothing; malformed JSON is treated as empty rather than failing the whole list.
- **Security:** only paths derived from `installed_plugins.json` are read, and each skill path must resolve inside its `installPath`.

### Routes (`packages/core/src/skill-routes.ts`)

- `GET /api/skills/plugins` → `PluginEntry[]`.
- `GET /api/skills/plugins/:id/skills/:name` → `{ name, description, content }` of that skill's `SKILL.md`, from the install the list used. 404 when the plugin or skill is unknown.
- `POST /api/skills/plugins/:id/update` with `{ scope, scopeRef }`:
  1. 404 unless the scope exists and the plugin is installed there.
  2. 409 if an update is already running for that config dir (in-memory lock keyed by config dir).
  3. With `CLAUDE_CONFIG_DIR` set to the account's config dir and `envWithoutHarness()`, run `claude plugin marketplace update <marketplace>`, then `claude plugin update <id>`, through the injected `runnerFor` (spawn with an args array, same timeout as `/install`).
  4. Non-zero exit → 500 `{ error }` with trimmed output, reusing `installFailure()`. This covers missing git access to a private repository, an old CLI without `plugin`, and a CLI asking to accept a marketplace-declared command. Forge never passes `--accept-command`.
  5. Success → re-read `installed_plugins.json` and return `{ ok: true, version }`.

## Console

### Skills page (`pages/Skills.tsx`)

- **Rail:** a PLUGINS group under the installed skills. One row per plugin: `i-lucide-package` icon, name, skill count. The search box filters plugin skills too; a plugin row stays visible when any of its skills matches, showing the match count.
- **Pane:** a new variant `{ kind: 'plugin'; id: string; skill?: string }`.
  - Header: name, `repo` linking to GitHub, description, and a "Claude Code only" tag.
  - Accounts: one row per install (version, enabled/disabled, **Update**). Accounts without the plugin are listed dimmed as "not installed" with no action.
  - Skills: the plugin's skills; selecting one shows its `SKILL.md` read-only, with the note "Comes from the plugin. To change it, propose the change in the repository."
  - **Propose a skill** when `project` is set; otherwise the hint "Register `<repo>` as a CW project to propose skills."
- Update: the button shows a busy state while running; on success a toast reads "`<name>` `<version>` · applies to new sessions", and the plugin list reloads; on failure the error toast carries the server message.
- Styling uses `theme.css` tokens and existing `ActionButton`; no new `@forge-dev/ui` components.

### Propose a skill

A form replaces the pane, following the existing create form:

- **What the skill does and when to use it** (required textarea).
- **Area**, shown only when the plugin's skill paths have more than one parent folder under `skills/` (for monoku-skills: engineering, documentation, productivity).
- **Account**, defaulting to the first account with the plugin installed.

Submitting calls the existing `POST /api/cw/start` with a task session in the matched project. The task text is built by a helper in `config/` so it stays testable and out of the component:

```
Add a new skill to this repository and open a pull request.
The skill: <text>
Area: <area>
Follow CONTRIBUTING.md.                       (when contributing is true)
Use this repository's own skills: /new-skill, /ship   (the names in projectSkills, when any)
```

The prompt names whatever the repository provides, so nothing is specific to monoku. The session opens in a tab like any task; branch naming, version bump and review follow the repository's rules. Whether to open an issue first (monoku's CONTRIBUTING step 1) is left to the session and the user.

## Out of scope

Installing or uninstalling plugins, adding marketplaces, enabling or disabling plugins, running plugin skills from Forge, "update available" indicators, and updating every account at once.

## Testing

- `plugins.test.ts` with fixture config dirs:
  - the same plugin in two accounts groups into one entry with two installs;
  - `"skills"` array resolution, the `skills/*` fallback, and `in-progress` skills excluded because they are not listed;
  - `enabledPlugins` false, true and missing;
  - repo normalization for SSH, HTTPS, `.git` and `owner/repo`;
  - project match against fixture repositories from `test-git.ts`, and no match without a remote;
  - `contributing` and `projectSkills` detection;
  - malformed JSON and skill paths escaping `installPath` are ignored.
- Route tests with a fake runner: list, read (200 and 404), update arguments and env (`CLAUDE_CONFIG_DIR`, no `CW_HARNESS`), 404 for an unknown install, 409 for a concurrent update, 500 with the CLI message.

## Docs

- `CHANGELOG.md` (Unreleased): plugin skills on the Skills page, Propose a skill, per-account plugin update.
- `CLAUDE.md`: `plugins.ts` under Key Files and the three endpoints under `/api/skills`.

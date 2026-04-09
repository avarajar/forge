# Design: Skills Management from Forge

**Date:** 2026-04-09

## Summary

Add the ability to browse, create, edit, and delete Claude Code skills from Forge. Skills can be scoped to global, per-account, or per-project. New skills can be discovered from online sources (skills.sh, GitHub) and customized by Claude Code via the skill-creator skill, or edited manually through a built-in editor.

## Storage Layout

```
~/.claude/skills/{name}/SKILL.md                     # Global
~/.cw/accounts/{acct}/skills/{name}/SKILL.md          # Per-account
{project}/.claude/skills/{name}/SKILL.md              # Per-project (committed to repo)
```

Each skill is a directory containing `SKILL.md` (YAML frontmatter + markdown body) and an optional `references/` subdirectory with additional markdown files.

### Account-level symlinks (CW responsibility)

On `cw work` / `cw review` session start, CW symlinks account skills into `~/.claude/skills/` so Claude Code discovers them:

```
~/.claude/skills/acct--{account}--{name} → ~/.cw/accounts/{account}/skills/{name}
```

The `acct--` prefix avoids collisions with global skills and makes cleanup deterministic.

## API Endpoints — `packages/core/src/cw-routes.ts`

### List all skills

`GET /api/cw/skills?account=X&project=Y`

Returns a flat array of skills across all scopes. Each entry:

```ts
interface SkillEntry {
  name: string           // frontmatter name
  dirName: string        // directory basename
  scope: 'global' | 'account' | 'project'
  scopeRef: string       // account name or project name (empty for global)
  description: string    // from frontmatter
  domain?: string        // from metadata
  triggers?: string      // from metadata
  hasReferences: boolean // whether references/ dir exists with files
}
```

Resolution order: global → account (if `account` param given) → project (if `project` param given).

### Get skill content

`GET /api/cw/skills/:scope/:name` (global)
`GET /api/cw/skills/account/:account/:name`
`GET /api/cw/skills/project/:project/:name`

Returns:

```ts
interface SkillDetail {
  name: string
  scope: 'global' | 'account' | 'project'
  scopeRef: string
  frontmatter: Record<string, unknown>  // parsed YAML
  body: string                           // markdown content after frontmatter
  references: { name: string; content: string }[]
}
```

### Create skill

`POST /api/cw/skills`

Body: `{ scope, scopeRef?, name, content }` where `content` is the full SKILL.md text. Creates `{targetDir}/{name}/SKILL.md`.

### Update skill

`PUT /api/cw/skills/:scope/:name` (and account/project variants)

Body: `{ content }` — overwrites SKILL.md.

### Update reference file

`PUT /api/cw/skills/:scope/:name/references/:filename`

Body: `{ content }` — creates or overwrites a reference file.

### Delete reference file

`DELETE /api/cw/skills/:scope/:name/references/:filename`

### Delete skill

`DELETE /api/cw/skills/:scope/:name` (and variants)

Removes the entire skill directory.

## Skill Reader — `packages/core/src/cw-reader.ts`

Add methods to `CWReader`:

- `getSkills(account?: string, project?: string): SkillEntry[]` — scans all scope directories, parses frontmatter for metadata
- `getSkill(scope, scopeRef, name): SkillDetail` — reads and parses a single skill
- `getSkillDir(scope, scopeRef, name): string` — resolves the filesystem path for a skill

The reader resolves paths:
- global: `~/.claude/skills/{name}`
- account: `~/.cw/accounts/{account}/skills/{name}`
- project: `reader.getProjects()[project].path + '/.claude/skills/' + name`

## Frontend — `packages/console/`

### New page: `pages/Skills.tsx`

Accessible from a "Skills" entry in the sidebar/nav or as a quick-type tab (like "New Task" today).

**Skill list view:**
- Cards grouped by scope (Global / Account / Project) with collapsible sections
- Each card shows: name, description (truncated), domain badge, scope badge
- Filter bar: scope dropdown, text search
- Top actions: "New Skill" button, "Explore" button

**Skill editor view** (clicking a card or creating new):

```
┌──────────────────────────────────────────────┐
│ ← Skills    {name}    [{scope}]    [Save]    │
├──────────────────┬───────────────────────────┤
│ Metadata         │                           │
│  Name: [...]     │   Editor (SKILL.md body   │
│  Description:[.] │   or selected reference)  │
│  Triggers: [...] │                           │
│  Domain: [...]   │   Plain textarea with     │
│  Tools: [...]    │   monospace font.         │
│──────────────────│                           │
│ Files            │                           │
│  ● SKILL.md      │                           │
│  + Add reference │                           │
│  ▸ checklist.md  │                           │
│  ▸ patterns.md   │                           │
└──────────────────┴───────────────────────────┘
```

Left sidebar: metadata form fields (editable) + file list (SKILL.md + references). Clicking a file switches the right-side editor. Metadata changes are serialized back into YAML frontmatter on save.

### "Create with AI" flow

"New Skill" → scope picker → description textarea → "Create with AI" button.

Spawns a CW session (same as creating a task) with an init_prompt:

```
Use the skill-creator skill to create a new Claude Code skill.

The user wants: {description}
Target scope: {scope} ({scopeRef})
Save location: {targetDir}

Before creating from scratch, search for existing similar skills:
1. Search skills.sh for related skills
2. Search GitHub for claude-code skill repos
3. Present what you find — let the user pick a base or start fresh

Then use skill-creator to build/customize the skill. Save the result to {targetDir}/{name}/SKILL.md.
```

This opens as a terminal tab — the user interacts with Claude to refine the skill. When done, Forge's skill list auto-refreshes (the files are on disk).

### "Explore" flow

"Explore" button opens a search panel:
- Search input that queries skills.sh and GitHub via the backend
- Results shown as cards with name, description, source badge
- "Install" button → scope picker → downloads to target directory
- "Install & Customize" → downloads, then spawns "Create with AI" session with the imported skill as base

### Explore API

`GET /api/cw/skills/explore?q=django`

Backend proxies to `https://skills.sh/api/search?q={query}` (confirmed JSON API) and normalizes the response:

```ts
interface ExploreResult {
  name: string
  slug: string           // e.g. "vintasoftware/django-ai-plugins@django-expert"
  installs: number
  source: 'skills.sh'
  url: string            // e.g. "https://skills.sh/vintasoftware/django-ai-plugins/django-expert"
  repo: string           // e.g. "vintasoftware/django-ai-plugins"
}
```

### Install API

`POST /api/cw/skills/install`

Body: `{ slug, scope, scopeRef? }` — runs `npx skills add {slug} --global --yes` (for global scope) or downloads the skill content from the GitHub repo and saves it to the target scope directory. The `skills` CLI only supports global and project-level installs, so for account-level scope Forge fetches the raw SKILL.md from GitHub and writes it to `~/.cw/accounts/{account}/skills/{name}/`.

## CW Changes — `cw-repo/cw`

In the `cw work` and `cw review` functions, after session setup and before spawning Claude:

```bash
# Symlink account skills into ~/.claude/skills/ for discovery
local acct_skills="$acct_dir/skills"
if [[ -d "$acct_skills" ]]; then
    for skill_dir in "$acct_skills"/*/; do
        [[ -d "$skill_dir" ]] || continue
        local skill_name=$(basename "$skill_dir")
        local target="$HOME/.claude/skills/acct--${account}--${skill_name}"
        [[ -e "$target" ]] || ln -sf "$skill_dir" "$target"
    done
fi
```

Cleanup is not strictly necessary (symlinks to non-existent dirs are harmless), but optionally on `cw work --done`:

```bash
# Remove account skill symlinks
for link in "$HOME/.claude/skills"/acct--*; do
    [[ -L "$link" ]] && rm -f "$link"
done
```

## Component Placement

- `pages/Skills.tsx` — main skills page (list + editor)
- `components/SkillCard.tsx` — skill card for list view
- `components/SkillEditor.tsx` — editor panel (metadata + file editor)
- `components/SkillExplorer.tsx` — explore/search panel
- API routes added to `cw-routes.ts` (skill CRUD) or a new `skill-routes.ts` if it grows large

## Testing

- Unit tests for skill reader methods (getSkills, getSkill) with test fixtures
- Unit tests for skill CRUD API endpoints
- Unit tests for frontmatter parsing/serialization
- Manual: create skill via editor, verify file on disk
- Manual: create skill via AI, verify Claude session spawns with correct prompt
- Manual: explore and install a skill from skills.sh
- Manual: account skill symlink appears in `~/.claude/skills/` during session

## What stays out of scope

- No skill versioning beyond what git provides for project-level skills
- No skill sharing/publishing from Forge (use skills.sh or GitHub directly)
- No skill dependency management (related-skills metadata is informational only)
- No live preview of skill behavior from Forge

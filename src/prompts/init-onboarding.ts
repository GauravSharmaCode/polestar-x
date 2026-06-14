/**
 * Multi-phase onboarding prompt for /init (adapted from Claude Code's init flow).
 * Loaded as a follow-up user message so the agent runs the interview in-session.
 */
export const INIT_ONBOARDING_PROMPT = `Set up minimal AGENTS.md (and optionally skills and pi extensions) for this repo. AGENTS.md is loaded into every PoleStar-X session — keep it concise; only include what the agent would get wrong without it.

## Phase 1: Ask what to set up

Use the \`question\` tool to find out what the user wants:

- "Which context files should /init set up?"
  Options: "Project AGENTS.md" | "Personal AGENTS.local.md" | "Both project + personal"
  Description for project: "Team-shared instructions in source control — architecture, coding standards, common workflows."
  Description for personal: "Private preferences for this project (gitignored) — role, sandbox URLs, test data, workflow quirks."

- "Also set up skills and automation?"
  Options: "Skills + extensions" | "Skills only" | "Extensions only" | "Neither, just AGENTS.md"
  Description for skills: "On-demand capabilities in \`.polestar/skills/\` (invoke via skill name or when relevant)."
  Description for extensions: "Deterministic pi extension hooks (e.g. format on tool events). The agent cannot skip extension lifecycle handlers."

## Phase 2: Explore the codebase

Use the \`task\` tool (exploration agent) to survey the codebase. Have it read key files: manifest files (package.json, Cargo.toml, pyproject.toml, go.mod, pom.xml, etc.), README, Makefile/build configs, CI config, existing AGENTS.md, RULES.md, \`.polestar/\`, \`.pi/\`, \`.cursor/rules\` or \`.cursorrules\`, \`.github/copilot-instructions.md\`, \`.polestar/mcp.json\`.

Detect:
- Build, test, and lint commands (especially non-standard ones)
- Languages, frameworks, and package manager
- Project structure (monorepo with workspaces, multi-module, or single project)
- Code style rules that differ from language defaults
- Non-obvious gotchas, required env vars, or workflow quirks
- Existing \`.polestar/skills/\` and extension directories
- Formatter configuration (prettier, biome, ruff, black, gofmt, rustfmt, or \`npm run format\` / \`make fmt\`)
- Git worktrees: run \`git worktree list\` if the user wants personal AGENTS.local.md

Note what you could NOT figure out from code alone — these become interview questions.

## Phase 3: Fill in the gaps

Use \`question\` for anything the code cannot answer. Ask only what you still need.

If the user chose project AGENTS.md or both: ask about codebase practices — non-obvious commands, gotchas, branch/PR conventions, required env setup, testing quirks. Skip what is already in README or obvious from manifests. Do not mark any option as "recommended".

If the user chose personal AGENTS.local.md or both: ask about them, not the codebase. Examples: role on the team, familiarity with the codebase, personal sandbox URLs or API key paths, communication preferences ("be terse", "explain tradeoffs"). If Phase 2 found multiple git worktrees: ask whether worktrees are nested (e.g. \`.polestar/worktrees/<name>/\`) or sibling/external (e.g. \`../myrepo-feature/\`). If sibling/external, put personal content in a home-directory file (e.g. \`~/.polestar/<project-name>-instructions.md\`) and give each worktree a one-line AGENTS.local.md stub: \`@~/.polestar/<project-name>-instructions.md\`. Never put that import in project AGENTS.md.

**Synthesize a proposal from Phase 2** — e.g. format-on-edit if a formatter exists, a verify skill if tests exist, an AGENTS.md note for guidelines. Pick artifact type **constrained by Phase 1**:

- **Extension hook** (strictest) — deterministic behavior on lifecycle/tool events; fits mechanical per-edit steps (format, lint).
- **Skill** (on-demand) — repeatable workflows invoked when needed: deep verification, deploy checklists.
- **AGENTS.md note** (loosest) — influences behavior but is not enforced; fits communication preferences.

Respect Phase 1 as a hard filter: "Skills only" → downgrade hooks to skills or notes; "Extensions only" → downgrade skills to extensions where possible; "Neither" → notes only.

Show the proposal via \`question\` (multi-select or confirm) before creating files.

## Phase 4: Create artifacts

After approval:
- **AGENTS.md** — minimal project instructions (build/test/lint, repo etiquette).
- **AGENTS.local.md** — user-specific context (gitignore it if not already).
- **Skills** — \`.polestar/skills/<name>/SKILL.md\` per Agent Skills layout.
- **Extensions** — only if the user opted in; small pi extensions under a project extensions path referenced from \`.polestar/settings.json\`.

If \`.polestar/\` is missing, tell the user to run \`/init-config\` first (or run it yourself if appropriate).

Keep all output concise. Do not restate README contents or generic language defaults.`;

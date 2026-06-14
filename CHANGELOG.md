# Changelog

All notable changes to PoleStar-X will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-14

Standalone, sovereign release. PoleStar-X is now a single published package built
on the pinned pi SDK, with its own identity rather than a full fork of pi-mono.

### Changed

- **Standalone repo**: flattened the pi-mono monorepo to a single package at the
  repo root. Removed the forked `packages/agent`, `packages/ai`,
  `packages/coding-agent`, `packages/tui`, and `packages/harness`; the published
  package consumes the npm-released `@earendil-works/pi-*` instead.
- **Pinned pi**: all `@earendil-works/pi-*` exact-pinned to `0.79.3` (no `^`/`~`).
- **Sovereign identity**: the CLI now runs as PoleStar-X, not pi — its own
  version, `~/.polestar/agent` user config directory, and startup changelog. A
  one-time migration copies an existing `~/.pi/agent` to `~/.polestar/agent` so
  upgrading users keep their auth, sessions, and settings.

### Added

- `--init-config` flag to scaffold the project-local `.polestar/` directory
  without booting the interactive UI (headless/scriptable).
- Install smoke test (`scripts/smoke.sh`): packs the tarball, installs it
  globally, and verifies boot, dependency resolution, a live provider round-trip,
  sovereign version, and config scaffolding.
- Pi upgrade probe (`scripts/check-pi-upgrade.mjs`): tests a pi version bump in
  an isolated worktree without committing.
- Release pipeline (`scripts/release.mjs`): enforced clean → build → test →
  import-check → smoke → publish → post-publish registry smoke.

### Fixed

- Removed the dead `POLESTAR_APP_PACKAGE_DIR` environment variable (no-op against
  released pi). Version string in the header now comes from `package.json` instead
  of a hardcoded literal.
- **Upstream update notifier suppressed**: pi's startup version check queries its
  own server and compares against our version, so it fired an "Update Available"
  box on every launch — advertising pi's version, telling users to `polestar
  update`, and linking pi's changelog. Bootstrap now sets `PI_SKIP_VERSION_CHECK`
  (before pi evaluates, so it survives pi upgrades) to disable it.
- **apply_patch path traversal**: patch hunk paths are now resolved against the
  workspace and rejected if they escape it, instead of being written anywhere
  `path.resolve` lands.
- **plan_exit mode toggle**: replaced the fragile `(ctx as any)._pi` lookup with a
  `createPlanExitTool(pi)` closure that captures the extension API directly, so the
  Think→Write transition no longer throws "Extension API reference not found".

## [0.1.1] - 2026-06-14

### Fixed

- Declare all direct runtime imports in `package.json` so global installs resolve modules such as `typebox`, `glob`, `@earendil-works/pi-ai`, and `@earendil-works/pi-agent-core`.
- Add a publish-time check that fails if built `dist/` imports any package not listed in dependencies.

## [0.1.0] - 2026-06-04

First public npm release (`@gauravsharmacode/polestar-x`).

### Added

- **Model Router**: Automatic task classification and model selection (privacy-local, architecture, exploration, fallback chains).
- **Self-Healing Retry**: Failure classification and automatic follow-up retries (up to 3 attempts).
- **Think/Write/Spec/Plan Modes**: Read-only planning, spec/plan restricted writes, and full write mode.
- **Cross-Session Memory**: pi-memory integration (`memory_search`, logging tools, `/remember`, `/recall`).
- **MCP Bridge**: Stdio MCP servers from `.polestar/mcp.json` with `/mcp` status.
- **Tools**: `glob`, `webfetch`, `websearch`, `apply_patch`, `todowrite`, `question`, `manage_rule`, `manage_skill`, `task`.
- **Commands**: `/init`, `/init-config`, `/tools`, `/hooks`, `/spec`, `/draft`, `/plan`.
- **Model Routing**: Version sorting, provider interleaving, mode-aware routing for think/plan.
- **Sub-Agent Config**: Default `research.md` in `.polestar/agents/` via `/init-config`.
- **UI**: Lightweight Markdown rendering for `websearch` and `memory_search` results.
- **Branding**: Custom PoleStar-X header and status indicators.

### Fixed

- Interactive `/exit` slash command quits the TUI (alias for `/quit`; requires `@earendil-works/pi-coding-agent` >= 0.78.1).

### Dependencies

- `@earendil-works/pi-coding-agent`: ^0.78.0
- `@earendil-works/pi-tui`: ^0.78.0
- `@gauravsharmacode/pi-memory`: 1.0.0
- `htmlparser2`: 9.1.0
- `turndown`: 7.2.0

[0.1.0]: https://github.com/GauravSharmaCode/polestar-x/releases/tag/v0.1.0

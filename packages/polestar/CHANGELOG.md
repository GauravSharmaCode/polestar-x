# Changelog

All notable changes to PoleStar-X will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

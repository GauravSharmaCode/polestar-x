# Changelog

All notable changes to PoleStar-X will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-01

### Added

- **Model Router**: Automatic task classification and model selection
  - Privacy-local routing: sensitive prompts (secrets, PII, tokens) route to local models (Ollama) or block if unavailable
  - Architecture tasks route to capable models (Opus, GPT-4) with thinking enabled
  - Exploration tasks route to fast models (Haiku, Flash) for efficiency
  - Fallback chain support for provider failures

- **Self-Healing Retry**: Automatic retry with diagnosis for failed operations
  - Classifies failures: `code_test`, `provider`, `infra`, `unsafe`, `unknown`
  - Automatic follow-up retries for code/test failures (up to 3 attempts)
  - Provider failure retry with model fallback chain
  - Defers to coding-agent's built-in retry for transient provider faults (429, 503, overloaded)

- **Think/Write Modes**: Toggle between read-only planning and full execution
  - `/think` or `/plan`: Restricts to read-only tools for planning
  - `/write`: Restores full tool suite for implementation
  - `plan_exit` tool for explicit mode transitions

- **Cross-Session Memory**: Integration with pi-memory for persistent learning
  - `memory_search` tool: Query prior work and decisions
  - `memory_log_learning` tool: Log learnings with tags
  - `memory_log_ticket` tool: Log resolved tickets with resolution notes
  - `/remember` and `/recall` commands
  - Automatic memory context injection before agent start

- **MCP Bridge**: Model Context Protocol server support
  - Stdio server connections from `.polestar/mcp.json`
  - `/mcp` command shows server status (running/offline)
  - Structured error tracking for connection failures

- **New Tools**:
  - `glob`: Find files matching glob patterns
  - `webfetch`: Fetch web pages and convert to markdown/text/html
  - `websearch`: DuckDuckGo search (no API key required)
  - `apply_patch`: Apply unified diff patches
  - `todowrite`: Persist session todos to `.polestar/todos.md`
  - `question`: Multi-question interactive prompts
  - `manage_rule`: Append rules to project/global RULES.md
  - `manage_skill`: Scaffold new SKILL.md files
  - `task`: Delegate to specialized subagents

- **Commands**:
  - `/init`: Project documentation onboarding
  - `/init-config`: Bootstrap `.polestar/` config directory
  - `/tools`: List registered tools and active status
  - `/hooks`: List active extension lifecycle hooks

- **Branding**: Custom PoleStar-X header and status indicators

### Dependencies

- `@earendil-works/pi-coding-agent`: ^0.78.0
- `@earendil-works/pi-tui`: ^0.78.0
- `@gauravsharmacode/pi-memory`: 1.0.0
- `htmlparser2`: 9.1.0
- `turndown`: 7.2.0

[0.1.0]: https://github.com/GauravSharmaCode/polestar-x/releases/tag/v0.1.0

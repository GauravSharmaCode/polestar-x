# PoleStar-X Getting Started Guide

Welcome to **PoleStar-X** — a sovereign, self-configuring fork of pi with smart model routing, first-class memory integration, and extensible tools.

---

## Installation

```bash
# Global install (recommended)
npm install -g @gauravsharmacode/polestar-x

# Or run without installing
npx @gauravsharmacode/polestar-x
```

Then start the agent:

```bash
polestar
```

### Install from source (development)

```bash
npm install --ignore-scripts
npm run build
npx polestar
```

## Quick Start: 5-Minute Setup

### 1. Initialize Your Workspace

On your first run, PoleStar-X will bootstrap a `.polestar/` configuration directory. To manually initialize:

```
/init-config
```

This creates:
- `.polestar/settings.json` — Global agent preferences
- `.polestar/mcp.json` — Model Context Protocol (MCP) server definitions
- `.polestar/skills/` — Directory for custom SKILL.md documents
- `.polestar/todos.md` — Task tracking

### 2. Understanding Task Routing

PoleStar-X **automatically classifies your prompts** and routes them to the most appropriate model:

| Task Class | Trigger Keywords | Default Model | Purpose |
|---|---|---|---|
| **architecture** | "design", "migrate", "implement feature", multi-line prompts | Opus/GPT-4 | Complex system design, refactoring, feature implementation |
| **code_edit** | Single-line implementation requests | Sonnet/Claude 3.5 | Bug fixes, code modifications, focused changes |
| **exploration** | "grep", "find all", "search the repo" | Haiku/Flash | Codebase scanning, analysis, discovery |
| **background** | "typo", "lint", "format", "minor" | Haiku/Flash | Low-priority maintenance, style cleanup |
| **privacy_local** | ".env", "password", "token", "secret" | Local only (Ollama) | Sensitive data handling — **blocked if no local model available** |

**Example:**
```
/prompt "Fix these bugs:\n\n1. Null check in parser\n2. Memory leak in...
```
→ Classified as **architecture**, routed to Opus

```
/prompt "Typo in the README"
```
→ Classified as **background**, routed to Haiku (cheap & fast)

### 3. Core Commands

#### Memory & Learning

```
/remember I learned X about the codebase
```
Manually log a learning note to cross-session memory.

```
/recall recent work with memory
```
Search and retrieve past notes.

#### Modes

```
/think
```
Switch to **Think mode** (read-only planning). The agent will not execute commands, only propose solutions.

```
/write
```
Switch back to **Write mode** (default implementation).

#### Tools & Configuration

```
/tools
```
List all active tools (built-in, PoleStar custom, and MCP-connected).

```
/hooks
```
Inspect active lifecycle hooks and listeners.

```
/mcp
```
Show MCP server status and diagnostics.

---

## Advanced: Custom MCP Servers

PoleStar-X integrates **Model Context Protocol** servers for extended capabilities.

### Add an MCP Server

Edit `.polestar/mcp.json`:

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/path/to/weather-mcp-server.js"],
      "env": { "API_KEY": "your-key" }
    },
    "database": {
      "command": "python",
      "args": ["db_mcp.py"],
      "env": { "DATABASE_URL": "..." }
    }
  }
}
```

On the next session start, PoleStar-X will:
1. Launch the MCP stdio processes
2. Discover available tools
3. Register them as `mcp__serverName__toolName`
4. Report any connection failures with structured error messages

### Error Reporting

If an MCP server fails to connect, you'll see:
```
⚠ 1 MCP server(s) failed to connect:
  • weather: Connection failed: ENOENT: no such file or directory
```

---

## Privacy & Local Models

For sensitive workflows (reading `.env` files, processing credentials), PoleStar-X enforces **local-only execution**:

```
/prompt "read my .env and explain the setup"
```

If no local model is configured, this **blocks the request** rather than falling back to a cloud model:

```
Error: Security Block: This task involves sensitive/privacy data, but no local 
model (Ollama/local) is available to handle it safely.
```

### Set Up a Local Model

1. Install [Ollama](https://ollama.ai)
2. Pull a model: `ollama pull mistral`
3. Start the server: `ollama serve`
4. PoleStar-X will auto-detect it and use it for privacy-sensitive tasks

---

## Extended Features

### Custom Skills

PoleStar-X can load custom **SKILL.md** documents from `.polestar/skills/`:

```bash
/manage_skill myskill "My custom skill" "## Instructions\n..."
```

This scaffolds a new skill in `.polestar/skills/myskill/SKILL.md`, which PoleStar-X will load at session start and make available to the agent.

### Rules & Conventions

Edit `.polestar/rules.md` to define project-specific coding rules. Use:

```
/manage_rule "Never use var, only const or let"
```

### Task Tracking

Todos are stored in `.polestar/todos.md` as JSON. Update via:

```
/todowrite
```

---

## Troubleshooting

### Model Defaulting to Haiku

**Problem:** Your prompts are routing to haiku even though they're architecture tasks.

**Solution:** Check your prompt classification:
- Multi-line prompts default to **architecture**
- Add explicit keywords: "design", "implement", "migrate", "refactor"
- Use `/think` mode to debug without executing

### MCP Server Not Connecting

**Problem:** MCP server appears offline in `/mcp` command.

**Solution:**
1. Verify the command and args in `.polestar/mcp.json`
2. Check that the server is runnable: `node /path/to/server.js`
3. Look for error messages in the warning notification
4. Restart the session: press `Ctrl+C` and run `npx polestar` again

### Memory Search Timeout

**Problem:** `/recall` returns "No matches" even though you've logged notes.

**Solution:**
- Ensure the `pi-memory` CLI is installed and in PATH
- Increase the timeout in `.polestar/settings.json`: `{ "memory": { "timeout": 5000 } }`
- Check your memory store: `pi-memory get MEMORY.md`

---

## Configuration Reference

### `.polestar/settings.json`

```json
{
  "version": 1,
  "memory": {
    "enabled": true,
    "timeout": 1500
  },
  "router": {
    "auto": true,
    "preferLocal": false
  },
  "mcp": {
    "autoStart": true
  }
}
```

### Model Preferences

To override model selection, set environment variables:

```bash
export POLESTAR_DEFAULT_MODEL=claude-3-5-opus
export POLESTAR_FAST_MODEL=claude-3-5-haiku
export POLESTAR_LOCAL_MODEL=ollama/mistral
```

---

## Next Steps

- **Learn more:** See `implementation_plan.md` for the PoleStar-X vision
- **Compare to pi:** See `CONTRIBUTING.md` for the development ruleset
- **Extend:** Add custom skills in `.polestar/skills/`
- **Integrate:** Connect MCP servers in `.polestar/mcp.json`

---

**Happy coding with PoleStar-X!**

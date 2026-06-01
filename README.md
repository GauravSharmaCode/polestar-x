# PoleStar-X

```
██████╗  ██████╗ ██╗     ███████╗███████╗████████╗ █████╗ ██████╗      ██╗  ██╗
██╔══██╗██╔═══██╗██║     ██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔══██╗     ╚██╗██╔╝
██████╔╝██║   ██║██║     █████╗  ███████╗   ██║   ███████║██████╔╝█████╗╚███╔╝ 
██╔═══╝ ██║   ██║██║     ██╔══╝  ╚════██║   ██║   ██╔══██║██╔══██╗╚════╝██╔██╗ 
██║     ╚██████╔╝███████╗███████╗███████║   ██║   ██║  ██║██║  ██║     ██╔╝ ██╗
╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝     ╚═╝  ╚═╝
```

**Sovereign fork of pi** — a self-configuring coding agent you own outright.

PoleStar-X is an opinionated, batteries-included middle ground between rigid enterprise tools and barebones pi. It configures itself, sits between your intent and execution, and ensures you remain in control of your agentic workflows.

---

### Alternate Branding

**Compact:**
```
  ___  ___  _    ___ ___ _____ _   ___   __  __
 | _ \/ _ \| |  | __/ __|_   _/_\ | _ \__\ \/ /
 |  _/ (_) | |__| _|\__ \ | |/ _ \|   /___>  <
 |_|  \___/|____|___|___/ |_/_/ \_\_|_\  /_/\_\
```

**Tiny:**
```
  _   _      _  __ ___      _        
 |_) / \ |  |_ (_   |  /\  |_) __ \/
 |   \_/ |_ |_ __)  | /--\ | \    /\
```

---

## Quick Start

```bash
npm install --ignore-scripts
npm run build
npm run polestar
```

For a full interactive session:
```bash
./pi-test.sh
```

---

## Features & Product Differentiators

### 1. Smart Model Router
Kills "provider hell." PoleStar-X automatically classifies tasks and routes them to the most appropriate model based on difficulty, cost, and privacy sensitivity. Local models (Ollama/local) are automatically used for privacy-sensitive tasks.

### 2. Self-Configuration Engine
The agent extends itself. PoleStar-X can scaffold new skills, manage its own rules (`AGENTS.md`), and enable/disable its own tools within the same session.

### 3. First-Class pi-memory
Integrated cross-session work-journal and semantic retrieval. The agent remembers what you did, how you did it, and your preferred conventions across projects.

### 4. Self-Healing Dev/Test Loop
On lint, type, or test failure, PoleStar-X diagnoses the root cause and retries the implementation rather than blindly pivoting.

---

## Custom Tool Suite

| Tool | Description |
| --- | --- |
| `glob` | Optimized file discovery with gitignore support |
| `todowrite` | Structured task tracking and visualization |
| `apply_patch` | Surgical code edits via unified diff format |
| `webfetch` | Direct content retrieval from URLs |
| `websearch` | Grounded search for up-to-date documentation |
| `question` | Targeted clarification and choice gathering |
| `manage_rule` | Dynamic agent rule management |
| `task` | Multi-agent orchestration and background tasks |
| `memory_search` | Semantic search through historical work |
| `manage_skill` | Scaffold and load new SKILL.md documents |

---

## Interactive Commands

| Command | Role |
| --- | --- |
| `/think` | Switch to read-only planning mode |
| `/write` | Switch to implementation mode (default) |
| `/tools` | List all active and registered tools |
| `/hooks` | Inspect active lifecycle listeners |
| `/mcp` | Manage and monitor running MCP servers |
| `/remember` | Manually log a learning to long-term memory |
| `/recall` | Search history for specific context |
| `/init` | Bootstrap the `.polestar` configuration directory |

---

## Development & CI/CD

### CI Pipeline
Ensures code quality and structural integrity on every push and PR to `main`.
- **Lint & Check**: Biome-driven formatting and type-checking.
- **Build & Test**: Full workspace build and regression suite.

### CD / Release Pipeline
Automated versioning and binary distribution.
- **Release**: Triggered via `workflow_dispatch` to bump versions, update changelogs, and tag.
- **Build Binaries**: Triggered on tags to build multi-platform binaries and publish to npm.

### Branch Protection
The `main` branch is protected. All changes must go through PRs with mandatory reviews from Code Owners.

---

## Attribution & Licensing

PoleStar-X preserves the MIT license and original copyright of **pi** (Mario Zechner). We also adopt and improve patterns from **Claude Code**, **gemini-cli**, and **OpenCode**.

See [NOTICE.md](NOTICE.md) for the full Attribution Ledger.

---

## License

MIT

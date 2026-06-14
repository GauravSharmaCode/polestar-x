#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "@earendil-works/pi-coding-agent";
import { polestarCoreExtension } from "./extension/polestar-core.ts";

// Point pi at polestar's package root so it reads polestar's CHANGELOG.md
// instead of pi's own. Pi's theme files are copied into dist/ at build time.
process.env.PI_PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
process.title = "polestar";

// --init-config: scaffold .polestar/ without booting the full TUI.
// pi doesn't dispatch slash-commands in headless -p mode, so this runs
// before main() and exits. The /init-config command in polestar-core.ts
// handles the interactive case; both paths stay in sync.
const initConfigIdx = process.argv.indexOf("--init-config");
if (initConfigIdx !== -1) {
	const cwd = process.cwd();
	const dir = join(cwd, ".polestar");
	mkdirSync(dir, { recursive: true });
	mkdirSync(join(dir, "agents"), { recursive: true });
	mkdirSync(join(dir, "skills"), { recursive: true });

	const settingsPath = join(dir, "settings.json");
	if (!existsSync(settingsPath)) {
		writeFileSync(
			settingsPath,
			JSON.stringify({ version: 1, memory: { enabled: true }, router: { auto: true } }, null, 2),
			"utf-8",
		);
	}

	const mcpPath = join(dir, "mcp.json");
	if (!existsSync(mcpPath)) {
		writeFileSync(
			mcpPath,
			JSON.stringify({ mcpServers: {} }, null, 2),
			"utf-8",
		);
	}

	const todosPath = join(dir, "todos.md");
	if (!existsSync(todosPath)) {
		writeFileSync(todosPath, `# PoleStar-X Todos\n\n\`\`\`json\n[\n]\n\`\`\`\n`, "utf-8");
	}

	const researchAgentPath = join(dir, "agents", "research.md");
	if (!existsSync(researchAgentPath)) {
		writeFileSync(
			researchAgentPath,
			`---\nname: research\ndescription: Subagent specialized for codebase exploration and reading\nmodel: gemini-2.5-flash\ntools: read, glob, grep, memory_search\n---\n\nYou are a specialized research agent. Your goal is to explore the codebase and answer questions quickly and accurately.\nUse your read, glob, and grep tools to find the answers. Provide concise summaries.`,
			"utf-8",
		);
	}

	console.log(`Initialized ${dir}`);
	process.exit(0);
}

await main(process.argv.slice(2), {
	extensionFactories: [polestarCoreExtension],
});

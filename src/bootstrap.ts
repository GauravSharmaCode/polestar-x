/**
 * Process bootstrap — MUST be imported before "@earendil-works/pi-coding-agent".
 *
 * pi computes its identity (APP_NAME, CONFIG_DIR_NAME, VERSION, changelog path)
 * from `PI_PACKAGE_DIR` at *module-evaluation time* inside its config module. ES
 * imports are hoisted and evaluated in source order, so this side-effect module
 * is imported first in cli.ts to set the env var before pi's config evaluates.
 * Setting it after the pi import (as a normal statement) is too late.
 */
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.title = "polestar";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// --init-config: scaffold the project-local .polestar/ and exit, without loading
// pi at all. pi doesn't dispatch slash-commands in headless -p mode, so this
// flag is the headless/scriptable path. The /init-config command in
// polestar-core.ts covers the interactive case; both stay in sync.
if (process.argv.includes("--init-config")) {
	scaffoldProjectConfig(process.cwd());
	process.exit(0);
}

// Sovereign identity (published layout only — no src/ alongside dist/). Pointing
// PI_PACKAGE_DIR at polestar's package root makes pi read polestar's
// package.json + CHANGELOG, so APP_NAME=polestar, the user config dir is
// ~/.polestar/agent, the version is polestar's, and the startup changelog is
// polestar's. pi resolves bundled assets relative to this root; the build
// vendors pi's theme/export-html/assets into dist/ (scripts/vendor-pi-assets.mjs).
//
// In a source checkout pi's src-vs-dist asset heuristic would look under src/,
// where nothing is vendored, so dev runs keep pi's own identity and assets.
process.env.PI_PACKAGE_DIR = packageRoot;

// Suppress pi's upstream version notifier. pi's startup check hits its own
// server (https://pi.dev/api/latest-version) and compares the result against
// our version. Since polestar's version (e.g. 0.2.0) is always behind pi's
// latest (e.g. 0.73.x), the "Update Available" box — telling users to run
// `polestar update` to get pi's version and linking pi's changelog — fires on
// every startup. None of that is meaningful for a sovereign fork. Set this
// before pi evaluates so it survives pi upgrades. Honour an explicit user
// override (any prior value disables the check just the same).
if (process.env.PI_SKIP_VERSION_CHECK === undefined) {
	process.env.PI_SKIP_VERSION_CHECK = "1";
}

migrateLegacyAgentDir();

/**
 * One-time migration so upgrading 0.1.x users keep their auth, sessions,
 * settings, and models when the config dir moves from ~/.pi/agent to
 * ~/.polestar/agent. Copies to a staging dir and renames atomically, so a failed
 * copy leaves no partial ~/.polestar/agent and the migration retries next run.
 * Never clobbers an existing ~/.polestar/agent.
 */
function migrateLegacyAgentDir(): void {
	const home = homedir();
	const legacy = join(home, ".pi", "agent");
	const sovereign = join(home, ".polestar", "agent");
	if (existsSync(sovereign) || !existsSync(legacy)) {
		return;
	}
	const staging = `${sovereign}.migrating`;
	try {
		rmSync(staging, { recursive: true, force: true });
		cpSync(legacy, staging, { recursive: true });
		renameSync(staging, sovereign);
		console.error("PoleStar-X: migrated ~/.pi/agent → ~/.polestar/agent (auth, sessions, settings preserved)");
	} catch (err) {
		rmSync(staging, { recursive: true, force: true });
		const message = err instanceof Error ? err.message : String(err);
		console.error(`PoleStar-X: could not migrate ~/.pi/agent (${message}); starting with a fresh config dir`);
	}
}

function scaffoldProjectConfig(cwd: string): void {
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
		writeFileSync(mcpPath, JSON.stringify({ mcpServers: {} }, null, 2), "utf-8");
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
}

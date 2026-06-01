import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtensionAPI, ExtensionFactory } from "../../../coding-agent/src/core/extensions/types.ts";
import { connectMcpBridge, disconnectMcpBridge, clients as mcpClients } from "../mcp/bridge.ts";
import { createMemoryBackend } from "../memory/backend.ts";
import { formatHistoricalMemoryBlock } from "../memory/format.ts";
// Import Think/Write modes and MCP Bridge
import { POLESTAR_DEFAULT_TOOLS, planExitTool, setExecutionMode } from "../modes/think-write.ts";
import { composeSystemPrompt } from "../prompts/compose-system-prompt.ts";
import { routeModel } from "../router/route-model.ts";
import { classifyFailure } from "../self-heal/classify-failure.ts";
import { decideRetry } from "../self-heal/retry-policy.ts";
// Import Subagents Tool
import { taskTool } from "../subagents/task-tool.ts";
import { applyPatchTool } from "../tools/apply-patch.ts";
// Import new PoleStar-X tools
import { globTool } from "../tools/glob.ts";
import { manageRuleTool } from "../tools/manage-rule.ts";
import { questionTool } from "../tools/question.ts";
import { scaffoldSkill } from "../tools/self-config.ts";
import { todoWriteTool } from "../tools/todo-write.ts";
import { webFetchTool } from "../tools/webfetch.ts";
import { webSearchTool } from "../tools/websearch.ts";
import { shortAsciiLogoCompactText } from "../ui/branding.ts";

const MEMORY_SEARCH_TIMEOUT_MS = 1500;

export const polestarCoreExtension: ExtensionFactory = (pi: ExtensionAPI) => {
	const memory = createMemoryBackend(async (cmd, args) => {
		const result = await pi.exec(cmd, args, { timeout: MEMORY_SEARCH_TIMEOUT_MS });
		return { stdout: result.stdout, code: result.code };
	});

	// Register all new tools
	pi.registerTool(globTool);
	pi.registerTool(todoWriteTool);
	pi.registerTool(applyPatchTool);
	pi.registerTool(webFetchTool);
	pi.registerTool(webSearchTool);
	pi.registerTool(questionTool);
	pi.registerTool(manageRuleTool);
	pi.registerTool(planExitTool);
	pi.registerTool(taskTool);

	pi.on("resources_discover", async (event) => {
		const { existsSync, readdirSync } = await import("node:fs");
		const { join } = await import("node:path");
		const skillsDir = join(event.cwd, ".polestar", "skills");
		const skillPaths: string[] = [];
		if (existsSync(skillsDir)) {
			try {
				const files = readdirSync(skillsDir, { withFileTypes: true });
				for (const file of files) {
					if (file.isDirectory()) {
						const skillMd = join(skillsDir, file.name, "SKILL.md");
						if (existsSync(skillMd)) {
							skillPaths.push(skillMd);
						}
					}
				}
			} catch {
				// Ignore directory read errors
			}
		}
		return { skillPaths };
	});

	pi.on("session_start", async (_event, ctx) => {
		// Set full default active tools
		pi.setActiveTools([...POLESTAR_DEFAULT_TOOLS]);

		if (ctx.ui) {
			ctx.ui.setStatus("mode", "✎ write");

			// Set branding header
			ctx.ui.setHeader((_tui, theme) => {
				const container = new Container();
				container.addChild(new Spacer(1));
				container.addChild(new Text(theme.fg("accent", shortAsciiLogoCompactText), 1, 0));
				container.addChild(new Spacer(1));
				const logo = theme.bold(theme.fg("accent", "PoleStar-X")) + theme.fg("dim", " v0.1.0");
				container.addChild(new Text(`${logo} - Sovereign fork of pi`, 1, 0));
				container.addChild(new Spacer(1));
				return container;
			});
		}

		// Connect stdio MCP servers configured in mcp.json
		try {
			await connectMcpBridge(pi, ctx.cwd);
		} catch (err: any) {
			console.error(`Failed to connect MCP servers: ${err.message}`);
		}
	});

	pi.on("session_shutdown", async () => {
		disconnectMcpBridge();
	});

	pi.on("before_agent_start", async (event, ctx) => {
		// Bind pi reference for use in tools
		(ctx as any)._pi = pi;

		const systemPrompt = composeSystemPrompt(event.systemPrompt);
		const memoryMd = await memory.readMemoryFile();
		const mergedPrompt = memoryMd ? `${systemPrompt}\n\n## Long-term memory\n${memoryMd}` : systemPrompt;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), MEMORY_SEARCH_TIMEOUT_MS);
		let memoryBlock: string | undefined;
		try {
			const results = await memory.search(event.prompt, controller.signal);
			memoryBlock = formatHistoricalMemoryBlock(results);
		} catch {
			memoryBlock = undefined;
		} finally {
			clearTimeout(timer);
		}

		const available = ctx.modelRegistry.getAvailable();
		if (available.length > 0) {
			const route = routeModel({
				prompt: event.prompt,
				currentModel: ctx.model,
				availableModels: available,
			});
			if (route.model) {
				await pi.setModel(route.model);
			} else if (route.taskClass === "privacy_local") {
				throw new Error(
					"Security Block: This task involves sensitive/privacy data, but no local model (Ollama/local) is available to handle it safely.",
				);
			}
		}

		if (memoryBlock) {
			return {
				systemPrompt: mergedPrompt,
				message: {
					customType: "polestar_memory",
					content: memoryBlock,
					display: "Historical memory",
				},
			};
		}

		return { systemPrompt: mergedPrompt };
	});

	pi.on("agent_end", async () => {
		// Auto-logging off by default — explicit tools/commands only.
	});

	pi.registerTool({
		name: "memory_search",
		label: "Memory Search",
		description: "Search pi-memory for relevant prior work",
		parameters: Type.Object({
			query: Type.String(),
		}),
		async execute(_id, params) {
			const results = await memory.search(params.query);
			return {
				content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
				details: results,
			};
		},
	});

	pi.registerTool({
		name: "memory_log_learning",
		label: "Memory Log",
		description: "Log a learning note to pi-memory",
		parameters: Type.Object({
			summary: Type.String(),
			tags: Type.Optional(Type.String()),
		}),
		async execute(_id, params) {
			const tags = params.tags
				?.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
			await memory.logLearning(params.summary, tags);
			return { content: [{ type: "text", text: "logged" }], details: {} };
		},
	});

	pi.registerTool({
		name: "manage_skill",
		label: "Manage Skill",
		description: "Scaffold a new SKILL.md under the agent skills directory",
		parameters: Type.Object({
			name: Type.String(),
			description: Type.String(),
			body: Type.String(),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const path = scaffoldSkill({
				name: params.name,
				description: params.description,
				body: params.body,
				skillsDir: `${ctx.cwd}/.polestar/skills`,
			});
			if ("reload" in ctx && typeof ctx.reload === "function") {
				try {
					await ctx.reload();
				} catch {
					// Ignore reload errors during tool execution
				}
			}
			return { content: [{ type: "text", text: `Created and loaded ${path}` }], details: { path } };
		},
	});

	pi.registerCommand("remember", {
		description: "Log a learning note to pi-memory",
		handler: async (args, ctx) => {
			const summary = args.trim();
			if (!summary) {
				ctx.ui.notify("Usage: /remember <text>", "warning");
				return;
			}
			await memory.logLearning(summary);
			ctx.ui.notify("Remembered.", "info");
		},
	});

	pi.registerCommand("init", {
		description: "Bootstrap PoleStar config directory and defaults",
		handler: async (_args, ctx) => {
			const { mkdirSync, writeFileSync, existsSync } = await import("node:fs");
			const { join } = await import("node:path");
			const dir = join(ctx.cwd, ".polestar");
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
					JSON.stringify(
						{
							mcpServers: {
								// Example server configuration:
								// "weather": {
								//   "command": "node",
								//   "args": ["/path/to/weather-server.js"]
								// }
							},
						},
						null,
						2,
					),
					"utf-8",
				);
			}

			const todosPath = join(dir, "todos.md");
			if (!existsSync(todosPath)) {
				writeFileSync(todosPath, `# PoleStar-X Todos\n\n\`\`\`json\n[\n]\n\`\`\`\n`, "utf-8");
			}

			ctx.ui.notify(`Initialized ${dir} config directory.`, "info");
		},
	});

	pi.registerCommand("recall", {
		description: "Search pi-memory and print top matches",
		handler: async (args, ctx) => {
			const query = args.trim() || "recent work";
			const results = await memory.search(query);
			const block = formatHistoricalMemoryBlock(results) ?? "No matches.";
			ctx.ui.notify(block, "info");
		},
	});

	// Register commands for Think & Write modes
	pi.registerCommand("think", {
		description: "Switch PoleStar-X to Think (read-only planning) mode",
		handler: async (_args, ctx) => {
			setExecutionMode(pi, "think", ctx);
		},
	});

	pi.registerCommand("plan", {
		description: "Alias for /think: Switch to Think (read-only planning) mode",
		handler: async (_args, ctx) => {
			setExecutionMode(pi, "think", ctx);
		},
	});

	pi.registerCommand("write", {
		description: "Switch PoleStar-X to Write (default implementation) mode",
		handler: async (_args, ctx) => {
			setExecutionMode(pi, "write", ctx);
		},
	});

	pi.registerCommand("tools", {
		description: "List all registered tools and their active status",
		handler: async (_args, ctx) => {
			const activeList = pi.getActiveTools ? pi.getActiveTools() : [];
			const ourTools = [
				"glob",
				"todowrite",
				"apply_patch",
				"webfetch",
				"websearch",
				"question",
				"manage_rule",
				"plan_exit",
				"task",
				"memory_search",
				"memory_log_learning",
				"manage_skill",
			];
			const builtins = ["read", "bash", "edit", "write", "grep", "find", "ls"];

			let output = "### Registered Tools:\n\n";

			output += "**Built-in Tools:**\n";
			for (const tool of builtins) {
				const active = activeList.includes(tool) ? "✓ active" : "✗ inactive";
				output += `  - **${tool}** (${active})\n`;
			}

			output += "\n**PoleStar Custom Tools:**\n";
			for (const tool of ourTools) {
				const active = activeList.includes(tool) ? "✓ active" : "✗ inactive";
				output += `  - **${tool}** (${active})\n`;
			}

			const allActive = activeList.filter((t) => !builtins.includes(t) && !ourTools.includes(t));
			if (allActive.length > 0) {
				output += "\n**Active MCP/External Tools:**\n";
				for (const tool of allActive) {
					output += `  - **${tool}** (✓ active)\n`;
				}
			}

			ctx.ui.notify(output, "info");
		},
	});

	pi.registerCommand("hooks", {
		description: "List active extension lifecycle hooks and handlers",
		handler: async (_args, ctx) => {
			const output = [
				"### Active Extension Hooks & System Listeners:",
				"",
				"- **resources_discover**: Discovers and reloads custom profiles and SKILL.md documents from `.polestar/skills/`.",
				"- **session_start**: Initializes the default tool suite and boots external Model Context Protocol (MCP) servers.",
				"- **session_shutdown**: Gracefully tears down MCP stdio child processes.",
				"- **before_agent_start**: Restores long-term memory records and applies privacy routing rules to enforce local model security.",
				"- **tool_result**: Listens to bash command executions and triggers the self-healing retry pipeline on diagnostic errors.",
			].join("\n");
			ctx.ui.notify(output, "info");
		},
	});

	pi.registerCommand("mcp", {
		description: "List all configured and running Model Context Protocol (MCP) servers",
		handler: async (_args, ctx) => {
			const { existsSync, readFileSync } = await import("node:fs");
			const { join } = await import("node:path");
			const mcpPath = join(ctx.cwd, ".polestar", "mcp.json");

			let output = "### Model Context Protocol (MCP) Servers:\n\n";

			if (!existsSync(mcpPath)) {
				output += "No configuration found at `.polestar/mcp.json`.\n";
				output += "To bootstrap your workspace configuration, run `/init`.";
				ctx.ui.notify(output, "warning");
				return;
			}

			let config: any;
			try {
				config = JSON.parse(readFileSync(mcpPath, "utf-8"));
			} catch (err: any) {
				ctx.ui.notify(`Failed to parse \`.polestar/mcp.json\`: ${err.message}`, "error");
				return;
			}

			const servers = config.mcpServers || config.servers || {};
			const serverEntries = Object.entries(servers);

			if (serverEntries.length === 0) {
				output += "No MCP servers configured in `.polestar/mcp.json`.\n";
				output += "Add servers under `mcpServers` using the format:\n";
				output +=
					'```json\n{\n  "mcpServers": {\n    "weather": {\n      "command": "node",\n      "args": ["/path/to/server.js"]\n    }\n  }\n}\n```';
			} else {
				for (const [name, serverConfig] of serverEntries) {
					const cfg = serverConfig as any;
					const activeClient = mcpClients.find((c) => c.serverName === name);
					const status = activeClient?.isConnected() ? "● running" : "○ offline";

					output += `- **${name}** (${status})\n`;
					output += `  - Command: \`${cfg.command} ${(cfg.args || []).join(" ")}\`\n`;
				}
			}

			ctx.ui.notify(output, "info");
		},
	});

	pi.on("tool_result", async (event) => {
		if (event.toolName !== "bash" || !event.isError) return;
		const text = event.content.map((c) => ("text" in c ? c.text : "")).join("\n");
		const failureClass = classifyFailure({
			command: String(event.input.command ?? ""),
			stdout: text,
			stderr: text,
			exitCode: 1,
		});
		const decision = decideRetry(failureClass, 0);
		if (!decision.shouldRetry) return;
		return {
			content: [
				{
					type: "text",
					text: `${text}\n\n[polestar-self-heal] ${decision.reason}. Diagnose root cause before retrying.`,
				},
			],
		};
	});
};

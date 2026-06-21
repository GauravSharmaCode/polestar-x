import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { McpClient } from "./client.ts";

export interface McpServerStatus {
	name: string;
	running: boolean;
	error?: string;
	toolCount: number;
}

export let clients: McpClient[] = [];
let serverStatus: McpServerStatus[] = [];

export function getMcpServerStatus(): McpServerStatus[] {
	return [...serverStatus];
}

export async function connectMcpBridge(pi: ExtensionAPI, cwd: string) {
	// First stop any running clients
	disconnectMcpBridge();
	serverStatus = [];

	const configPath = path.join(cwd, ".polestar", "mcp.json");
	if (!existsSync(configPath)) {
		return;
	}

	let config: any;
	try {
		config = JSON.parse(readFileSync(configPath, "utf-8"));
	} catch (err: any) {
		const status: McpServerStatus = {
			name: "mcp.json",
			running: false,
			error: `Invalid config: ${err.message}`,
			toolCount: 0,
		};
		serverStatus.push(status);
		console.error(`Warning: Failed to parse .polestar/mcp.json: ${err.message}`);
		return;
	}

	const servers = config.mcpServers || config.servers || {};
	for (const [serverName, serverConfig] of Object.entries(servers)) {
		const cfg = serverConfig as any;
		if (!cfg.command) {
			serverStatus.push({
				name: serverName,
				running: false,
				error: "Missing 'command' in config",
				toolCount: 0,
			});
			continue;
		}

		const client = new McpClient(serverName, cfg.command, cfg.args || [], cfg.env || {});
		clients.push(client);

		try {
			const tools = await client.start();
			serverStatus.push({
				name: serverName,
				running: true,
				toolCount: tools.length,
			});

			for (const tool of tools) {
				const namespacedName = `mcp__${serverName}__${tool.name}`;
				pi.registerTool({
					name: namespacedName,
					label: `${serverName}: ${tool.name}`,
					description: tool.description || `Call MCP tool ${tool.name} from server ${serverName}`,
					parameters: Type.Any({
						description: "Parameters for the MCP tool call (conforming to the tool's JSON Schema)",
					}),
					async execute(_id, params) {
						try {
							const result = await client.callTool(tool.name, params);

							let text = "";
							if (result && Array.isArray(result.content)) {
								text = result.content
									.map((c: any) => (c.type === "text" ? c.text : JSON.stringify(c)))
									.join("\n");
							} else {
								text = JSON.stringify(result, null, 2);
							}

							return {
								content: [{ type: "text", text }],
								details: result,
							};
						} catch (err: any) {
							throw new Error(`MCP tool call failed: ${err.message}`);
						}
					},
				});
			}
		} catch (err: any) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			serverStatus.push({
				name: serverName,
				running: false,
				error: `Connection failed: ${errorMsg}`,
				toolCount: 0,
			});
			console.error(`MCP Bridge error for "${serverName}": ${errorMsg}`);
		}
	}

	// Report MCP status through console (failures will be visible in logs)
	const failures = serverStatus.filter((s) => !s.running);
	if (failures.length > 0) {
		console.warn(
			`⚠ ${failures.length} MCP server(s) failed to connect:\n${failures.map((f) => `  • ${f.name}: ${f.error}`).join("\n")}`,
		);
	}
}

export function disconnectMcpBridge() {
	for (const client of clients) {
		try {
			client.stop();
		} catch {
			// Ignore stop errors
		}
	}
	clients = [];
	serverStatus = [];
}

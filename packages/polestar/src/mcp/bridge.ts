import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "../../../coding-agent/src/core/extensions/types.ts";
import { McpClient } from "./client.ts";

export let clients: McpClient[] = [];

export async function connectMcpBridge(pi: ExtensionAPI, cwd: string) {
	// First stop any running clients
	disconnectMcpBridge();

	const configPath = path.join(cwd, ".polestar", "mcp.json");
	if (!existsSync(configPath)) {
		return;
	}

	let config: any;
	try {
		config = JSON.parse(readFileSync(configPath, "utf-8"));
	} catch (err: any) {
		console.error(`Warning: Failed to parse .polestar/mcp.json: ${err.message}`);
		return;
	}

	const servers = config.mcpServers || config.servers || {};
	for (const [serverName, serverConfig] of Object.entries(servers)) {
		const cfg = serverConfig as any;
		if (!cfg.command) continue;

		const client = new McpClient(serverName, cfg.command, cfg.args || [], cfg.env || {});
		clients.push(client);

		try {
			const tools = await client.start();
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
			console.error(`MCP Bridge error for ${serverName}: ${err.message}`);
		}
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
}

import { Type } from "typebox";

export const PoleStarConfigSchema = Type.Object(
	{
		version: Type.Literal(1),
		memory: Type.Optional(
			Type.Object({
				enabled: Type.Optional(Type.Boolean({ default: true })),
				timeout: Type.Optional(Type.Number({ default: 1500, minimum: 500, maximum: 10000 })),
			}),
		),
		router: Type.Optional(
			Type.Object({
				auto: Type.Optional(Type.Boolean({ default: true })),
				preferLocal: Type.Optional(Type.Boolean({ default: false })),
			}),
		),
		mcp: Type.Optional(
			Type.Object({
				autoStart: Type.Optional(Type.Boolean({ default: true })),
			}),
		),
	},
	{ title: "PoleStar-X Config", description: "Settings for .polestar/settings.json" },
);

export const McpServerConfigSchema = Type.Object(
	{
		command: Type.String({ description: "Executable command (e.g., 'node', 'python')" }),
		args: Type.Optional(Type.Array(Type.String())),
		env: Type.Optional(Type.Record(Type.String(), Type.String())),
	},
	{ title: "MCP Server Config", description: "Single MCP server definition" },
);

export const McpConfigSchema = Type.Object(
	{
		mcpServers: Type.Optional(Type.Record(Type.String(), McpServerConfigSchema)),
		servers: Type.Optional(Type.Record(Type.String(), McpServerConfigSchema)), // Legacy alias
	},
	{ title: "MCP Config", description: "Settings for .polestar/mcp.json" },
);

export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
	try {
		// In a real implementation, use a JSON schema validator like `ajv`
		// For now, just do basic type checking
		if (typeof config !== "object" || config === null) {
			return { valid: false, errors: ["Config must be an object"] };
		}

		const cfg = config as any;
		if (cfg.version !== 1) {
			return { valid: false, errors: [`Config version must be 1, got ${cfg.version}`] };
		}

		return { valid: true, errors: [] };
	} catch (err: any) {
		return { valid: false, errors: [err.message] };
	}
}

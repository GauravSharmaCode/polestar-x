import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { glob } from "glob";
import { Type } from "typebox";
import type { ToolDefinition } from "../../../coding-agent/src/core/extensions/types.ts";

const globParams = Type.Object({
	pattern: Type.String({ description: "The glob pattern to match files against, e.g. '**/*.ts'" }),
	path: Type.Optional(
		Type.String({
			description: "The directory to search in (default: current working directory)",
		}),
	),
});

export const globTool: ToolDefinition<typeof globParams> = {
	name: "glob",
	label: "Glob",
	description: "Find files matching a glob pattern",
	parameters: globParams,
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const searchDir = params.path
			? path.isAbsolute(params.path)
				? params.path
				: path.resolve(ctx.cwd, params.path)
			: ctx.cwd;

		if (!existsSync(searchDir)) {
			throw new Error(`Directory does not exist: ${searchDir}`);
		}
		if (!statSync(searchDir).isDirectory()) {
			throw new Error(`Path is not a directory: ${searchDir}`);
		}

		// Perform glob search
		const files = await glob(params.pattern, {
			cwd: searchDir,
			absolute: true,
			nodir: true,
			signal,
		});

		const relativeFiles = files.map((f) => path.relative(ctx.cwd, f));
		const limit = 100;
		const truncated = relativeFiles.length > limit;
		const displayedFiles = relativeFiles.slice(0, limit);

		let output = displayedFiles.length > 0 ? displayedFiles.join("\n") : "No files found";
		if (truncated) {
			output += `\n\n(Results truncated: showing first ${limit} of ${relativeFiles.length} files. Refine pattern or path if needed.)`;
		}

		return {
			content: [{ type: "text", text: output }],
			details: {
				count: relativeFiles.length,
				truncated,
			},
		};
	},
};

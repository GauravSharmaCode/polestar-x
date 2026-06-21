import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export type ExecutionMode = "think" | "spec" | "plan" | "write";

let currentMode: ExecutionMode = "write";
let originalActiveTools: string[] = [];

// Base set of PoleStar-X default tools
export const POLESTAR_DEFAULT_TOOLS = [
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"glob",
	"apply_patch",
	"todowrite",
	"webfetch",
	"websearch",
	"question",
	"memory_search",
	"memory_log_learning",
	"manage_skill",
	"manage_rule",
	"task",
];

// Tools banned in Think (read-only) mode
const MUTATING_TOOLS = ["edit", "write", "apply_patch", "todowrite", "bash"];

export function getExecutionMode(): ExecutionMode {
	return currentMode;
}

export function setExecutionMode(pi: ExtensionAPI, mode: ExecutionMode, ctx: ExtensionContext) {
	currentMode = mode;

	if (originalActiveTools.length === 0) {
		originalActiveTools = pi.getActiveTools();
		if (originalActiveTools.length === 0) {
			originalActiveTools = [...POLESTAR_DEFAULT_TOOLS];
		}
	}

	if (mode === "think") {
		// Keep only non-mutating tools, and add plan_exit
		const filtered = originalActiveTools.filter((name) => !MUTATING_TOOLS.includes(name));
		if (!filtered.includes("plan_exit")) {
			filtered.push("plan_exit");
		}

		pi.setActiveTools(filtered);
		if (ctx?.ui) {
			ctx.ui.setStatus("mode", "⏸ think");
			ctx.ui.notify("Switched to Think (read-only) mode. Modifying tools are disabled.", "info");
		}
	} else if (mode === "spec" || mode === "plan") {
		const filtered = originalActiveTools.filter((name) => !MUTATING_TOOLS.includes(name));
		if (!filtered.includes("plan_exit")) {
			filtered.push("plan_exit");
		}
		// Add restricted write for the specific mode
		filtered.push("restricted_write");

		pi.setActiveTools(filtered);
		if (ctx?.ui) {
			const icon = mode === "spec" ? "📝" : "📋";
			ctx.ui.setStatus("mode", `${icon} ${mode}`);
			ctx.ui.notify(
				`Switched to ${mode.charAt(0).toUpperCase() + mode.slice(1)} mode. Write restricted to .polestar/docs/${mode}.md.`,
				"info",
			);
		}
	} else {
		// Restore full tools
		let toRestore = originalActiveTools.filter((name) => name !== "plan_exit" && name !== "restricted_write");
		if (toRestore.length === 0) {
			toRestore = [...POLESTAR_DEFAULT_TOOLS];
		}
		pi.setActiveTools(toRestore);
		if (ctx?.ui) {
			ctx.ui.setStatus("mode", "✎ write");
			ctx.ui.notify("Switched to Write mode. All tools are active.", "info");
		}
	}
}

const restrictedWriteParams = Type.Object({
	content: Type.String({ description: "The content to write to the document" }),
});

export const restrictedWriteTool: ToolDefinition<typeof restrictedWriteParams> = {
	name: "restricted_write",
	label: "Restricted Write",
	description: "Write content to the permitted specification or plan document.",
	promptGuidelines: ["Always use this tool to save your spec or plan to the filesystem."],
	parameters: restrictedWriteParams,
	async execute(_id, params) {
		const { writeFileSync, mkdirSync } = await import("node:fs");
		const { join, dirname } = await import("node:path");

		const mode = getExecutionMode();
		if (mode !== "spec" && mode !== "plan") {
			throw new Error("restricted_write can only be used in spec or plan mode.");
		}

		const targetFile = `.polestar/docs/${mode}.md`;
		const fullPath = join(process.cwd(), targetFile);

		mkdirSync(dirname(fullPath), { recursive: true });
		writeFileSync(fullPath, params.content, "utf8");

		return {
			content: [{ type: "text", text: `Successfully wrote to ${targetFile}` }],
			details: { file: targetFile },
		};
	},
};

const planExitParams = Type.Object({
	explanation: Type.String({ description: "Explanation of the plan to be executed in Write mode" }),
});

export function createPlanExitTool(pi: ExtensionAPI): ToolDefinition<typeof planExitParams> {
	return {
		name: "plan_exit",
		label: "Exit Plan",
		description:
			"Signal that the thinking/planning phase is complete and ask to transition to Write mode to begin implementation.",
		parameters: planExitParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			let consented = true;
			if (ctx.hasUI) {
				consented = await ctx.ui.confirm(
					"Transition to Write Mode",
					`The agent proposed completing the plan:\n"${params.explanation}"\n\nTransition to Write mode to execute implementation?`,
				);
			}

			if (consented) {
				setExecutionMode(pi, "write", ctx);
				return {
					content: [
						{ type: "text" as const, text: "Successfully transitioned to Write mode. You may now modify files." },
					],
					details: { mode: "write" },
				};
			} else {
				return {
					content: [
						{ type: "text" as const, text: "Transition rejected by user. Remaining in Think (read-only) mode." },
					],
					details: { mode: "think" },
				};
			}
		},
	};
}

import { Type } from "typebox";
import type { ExtensionAPI, ToolDefinition } from "../../../coding-agent/src/core/extensions/types.ts";

export type ExecutionMode = "think" | "write";

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

export function setExecutionMode(pi: ExtensionAPI, mode: ExecutionMode, ctx: any) {
	currentMode = mode;

	if (mode === "think") {
		// Save currently active tools before filtering
		originalActiveTools = pi.getActiveTools();
		if (originalActiveTools.length === 0) {
			originalActiveTools = [...POLESTAR_DEFAULT_TOOLS];
		}

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
	} else {
		// Restore full tools
		let toRestore = originalActiveTools.filter((name) => name !== "plan_exit");
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

const planExitParams = Type.Object({
	explanation: Type.String({ description: "Explanation of the plan to be executed in Write mode" }),
});

export const planExitTool: ToolDefinition<typeof planExitParams> = {
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
			// Accessing ExtensionAPI registered in context or from extension load
			const pi = (ctx as any)._pi;
			if (pi) {
				setExecutionMode(pi, "write", ctx);
				return {
					content: [
						{ type: "text" as const, text: "Successfully transitioned to Write mode. You may now modify files." },
					],
					details: { mode: "write" },
				};
			}
			throw new Error("Extension API reference not found in context. Unable to toggle mode.");
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

import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import type { ToolDefinition } from "../../../coding-agent/src/core/extensions/types.ts";
import { getAgentDir } from "../../../coding-agent/src/index.ts";

const manageRuleParams = Type.Object({
	rule: Type.String({ description: "The rule text or guideline to append" }),
	scope: Type.Optional(
		Type.Union([Type.Literal("project"), Type.Literal("global")], {
			description:
				"The scope of the rule: 'project' (workspace cwd RULES.md) or 'global' (system-wide RULES.md). Defaults to 'project'.",
			default: "project",
		}),
	),
});

export const manageRuleTool: ToolDefinition<typeof manageRuleParams> = {
	name: "manage_rule",
	label: "Manage Rule",
	description: "Append a custom rule/instruction to project-level or global guidelines.",
	parameters: manageRuleParams,
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const scope = params.scope || "project";
		const ruleText = params.rule.trim();

		let targetPath = "";
		if (scope === "global") {
			targetPath = path.join(getAgentDir(), "RULES.md");
		} else {
			targetPath = path.join(ctx.cwd, "RULES.md");
		}

		const exists = existsSync(targetPath);
		const formattedRule = `\n- ${ruleText}\n`;

		if (!exists) {
			writeFileSync(targetPath, `# PoleStar Guidelines\n${formattedRule}`, "utf-8");
		} else {
			appendFileSync(targetPath, formattedRule, "utf-8");
		}

		// Trigger reload of project context files if available in context
		if ("reload" in ctx && typeof ctx.reload === "function") {
			try {
				await ctx.reload();
			} catch {
				// Ignore reload failures during tool execute
			}
		}

		const output = `Successfully appended new rule to ${scope} guidelines at ${path.basename(targetPath)}:\n"${ruleText}"`;

		return {
			content: [{ type: "text" as const, text: output }],
			details: {
				scope,
				path: targetPath,
				rule: ruleText,
			},
		};
	},
};

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import type { ToolDefinition } from "../../../coding-agent/src/core/extensions/types.ts";

const TodoItemSchema = Type.Object({
	content: Type.String({ description: "Brief description of the task" }),
	status: Type.String({
		description: "Current status of the task: pending, in_progress, completed, cancelled",
	}),
	priority: Type.String({ description: "Priority level of the task: high, medium, low" }),
});

const todoWriteParams = Type.Object({
	todos: Type.Array(TodoItemSchema, { description: "The complete updated todo list" }),
});

export const todoWriteTool: ToolDefinition<typeof todoWriteParams> = {
	name: "todowrite",
	label: "Todo Write",
	description: "Update the checklist of todos for the current session.",
	parameters: todoWriteParams,
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const polestarDir = path.join(ctx.cwd, ".polestar");
		mkdirSync(polestarDir, { recursive: true });
		const todoPath = path.join(polestarDir, "todos.md");

		const jsonString = JSON.stringify(params.todos, null, 2);
		const fileContent = `# PoleStar-X Todos\n\n\`\`\`json\n${jsonString}\n\`\`\`\n`;

		writeFileSync(todoPath, fileContent, "utf-8");

		const pendingCount = params.todos.filter((t) => t.status === "pending" || t.status === "in_progress").length;
		const output = `Successfully updated todos in .polestar/todos.md.\nRemaining tasks: ${pendingCount} pending/in_progress.`;

		return {
			content: [{ type: "text", text: output }],
			details: {
				todos: params.todos,
			},
		};
	},
};

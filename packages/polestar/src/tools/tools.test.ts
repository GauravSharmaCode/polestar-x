import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPatchTool } from "./apply-patch.ts";
import { globTool } from "./glob.ts";
import { manageRuleTool } from "./manage-rule.ts";
import { todoWriteTool } from "./todo-write.ts";
import { webFetchTool } from "./webfetch.ts";
import { webSearchTool } from "./websearch.ts";

function createMockContext(cwd: string) {
	return {
		cwd,
		hasUI: false,
		ui: {
			confirm: async () => true,
			select: async () => undefined,
			input: async () => undefined,
			notify: () => {},
			setStatus: () => {},
			setWorkingMessage: () => {},
			setWorkingVisible: () => {},
		},
		sessionManager: {} as any,
		modelRegistry: {} as any,
		model: undefined,
		isIdle: () => true,
		signal: undefined,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		getContextUsage: () => undefined,
		compact: () => {},
		getSystemPrompt: () => "",
	};
}

describe("PoleStar Tools", () => {
	let testDir: string;
	let ctx: any;

	beforeEach(() => {
		testDir = path.join(tmpdir(), `polestar-tools-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		ctx = createMockContext(testDir);
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {}
	});

	describe("globTool", () => {
		it("should find files matching a glob pattern", async () => {
			writeFileSync(path.join(testDir, "test1.ts"), "content1");
			writeFileSync(path.join(testDir, "test2.txt"), "content2");

			const result = await globTool.execute("call-id", { pattern: "*.ts" }, undefined, undefined, ctx);
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";

			expect(text).toContain("test1.ts");
			expect(text).not.toContain("test2.txt");
		});
	});

	describe("todoWriteTool", () => {
		it("should persist todos inside .polestar/todos.md as a JSON code block", async () => {
			const todos = [
				{ content: "Task 1", status: "pending", priority: "high" },
				{ content: "Task 2", status: "in_progress", priority: "medium" },
			];

			const result = await todoWriteTool.execute("call-id", { todos }, undefined, undefined, ctx);
			expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain(
				"Successfully updated todos",
			);

			const todosFile = path.join(testDir, ".polestar", "todos.md");
			expect(existsSync(todosFile)).toBe(true);

			const fileContent = readFileSync(todosFile, "utf-8");
			expect(fileContent).toContain("```json");
			expect(fileContent).toContain("Task 1");
			expect(fileContent).toContain("high");
		});
	});

	describe("applyPatchTool", () => {
		it("should parse and apply standard Add/Update hunks", async () => {
			const filePath = "src/code.ts";
			const absolutePath = path.join(testDir, filePath);
			mkdirSync(path.dirname(absolutePath), { recursive: true });
			writeFileSync(absolutePath, "console.log('original');\n", "utf-8");

			const patchText = `
*** Begin Patch
*** Update File: src/code.ts
@@ console.log('original');
-console.log('original');
+console.log('updated');
*** End of File
*** End Patch
`.trim();

			const result = await applyPatchTool.execute("call-id", { patchText }, undefined, undefined, ctx);
			expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("Updated file");

			const updatedContent = readFileSync(absolutePath, "utf-8");
			expect(updatedContent).toContain("updated");
			expect(updatedContent).not.toContain("original");
		});
	});

	describe("webFetchTool", () => {
		it("should fetch web pages and convert to markdown", async () => {
			const htmlResponse = "<html><body><h1>Hello Web</h1></body></html>";

			// Mock global fetch
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					headers: new Map([["content-type", "text/html"]]),
					text: () => Promise.resolve(htmlResponse),
				}),
			);

			const result = await webFetchTool.execute(
				"call-id",
				{ url: "https://example.com/page", format: "markdown" },
				undefined,
				undefined,
				ctx,
			);

			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			expect(text).toContain("Hello Web");

			// Restore fetch
			globalThis.fetch = originalFetch;
		});
	});

	describe("webSearchTool", () => {
		it("should fetch and parse search results using DuckDuckGo fallback", async () => {
			const htmlResponse = `
				<div class="result">
					<a class="result__url" href="https://example.com/ddg-link">DuckDuckGo Search Result</a>
					<span class="result__snippet">Description of the page content.</span>
				</div>
			`;

			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					text: () => Promise.resolve(htmlResponse),
				}),
			);

			const result = await webSearchTool.execute("call-id", { query: "Vitest test" }, undefined, undefined, ctx);

			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			expect(text).toContain("DuckDuckGo Search Result");
			expect(text).toContain("example.com/ddg-link");
			expect(text).toContain("Description of the page content.");

			globalThis.fetch = originalFetch;
		});
	});

	describe("manageRuleTool", () => {
		it("should append rules to project-level RULES.md by default", async () => {
			const rule = "Always use strict type checking";
			const result = await manageRuleTool.execute("call-id", { rule, scope: "project" }, undefined, undefined, ctx);

			expect(result.content[0]?.type === "text" ? result.content[0].text : "").toContain("appended new rule");

			const rulesPath = path.join(testDir, "RULES.md");
			expect(existsSync(rulesPath)).toBe(true);

			const content = readFileSync(rulesPath, "utf-8");
			expect(content).toContain(rule);
		});
	});
});

import { describe, expect, it } from "vitest";
import { composeSystemPrompt } from "./compose-system-prompt.ts";

describe("composeSystemPrompt", () => {
	it("prepends polestar block and preserves base", () => {
		const result = composeSystemPrompt("BASE_PROMPT");
		expect(result).toContain("BASE_PROMPT");
		expect(result).toContain("PoleStar-X");
		expect(result).toContain("destructive");
	});

	it("strips inherited pi harness identity from base prompt", () => {
		const base = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users.

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /readme
- Always read pi .md files completely and follow links to related docs (e.g., tui.md for TUI API details)

Available tools:
- read`;
		const result = composeSystemPrompt(base);
		expect(result).toContain("PoleStar-X");
		expect(result).not.toContain("operating inside pi");
		expect(result).not.toContain("Pi documentation");
		expect(result).toContain("Available tools:");
	});

	it("is idempotent", () => {
		const once = composeSystemPrompt("BASE");
		const twice = composeSystemPrompt(once);
		expect(twice).toBe(once);
	});
});

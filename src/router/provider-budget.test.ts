import { describe, expect, it } from "vitest";
import { getProviderBudget } from "./provider-budget.ts";

describe("getProviderBudget", () => {
	it("returns recurring for anthropic", () => {
		expect(getProviderBudget("anthropic")).toBe("recurring");
	});

	it("returns recurring for antigravity", () => {
		expect(getProviderBudget("antigravity")).toBe("recurring");
	});

	it("returns recurring for openrouter", () => {
		expect(getProviderBudget("openrouter")).toBe("recurring");
	});

	it("returns limited for github", () => {
		expect(getProviderBudget("github")).toBe("limited");
	});

	it("returns limited for cursor", () => {
		expect(getProviderBudget("cursor")).toBe("limited");
	});

	it("returns limited for copilot", () => {
		expect(getProviderBudget("copilot")).toBe("limited");
	});

	it("is case-insensitive", () => {
		expect(getProviderBudget("Anthropic")).toBe("recurring");
		expect(getProviderBudget("GITHUB")).toBe("limited");
	});

	it("defaults to limited for unknown providers", () => {
		expect(getProviderBudget("unknown-provider")).toBe("limited");
	});
});

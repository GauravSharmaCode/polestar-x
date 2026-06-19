import { describe, expect, it, vi } from "vitest";
import { ModelBlacklist } from "./model-blacklist.ts";

describe("ModelBlacklist", () => {
	it("is not blacklisted with fewer failures than maxRetries", () => {
		const bl = new ModelBlacklist(3, 1000);
		bl.recordFailure("gpt-4o");
		bl.recordFailure("gpt-4o");
		expect(bl.isBlacklisted("gpt-4o")).toBe(false);
	});

	it("blacklists a model after maxRetries failures", () => {
		const bl = new ModelBlacklist(3, 60_000);
		bl.recordFailure("gpt-4o");
		bl.recordFailure("gpt-4o");
		const nowBlacklisted = bl.recordFailure("gpt-4o");
		expect(nowBlacklisted).toBe(true);
		expect(bl.isBlacklisted("gpt-4o")).toBe(true);
	});

	it("doubles backoff duration on second blacklist", () => {
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now);

		const bl = new ModelBlacklist(1, 5_000);
		bl.recordFailure("claude-opus"); // blacklisted: 5s
		const entry1Until = now + 5_000;

		// Expire the first blacklist
		vi.spyOn(Date, "now").mockReturnValue(entry1Until + 1);
		expect(bl.isBlacklisted("claude-opus")).toBe(false);

		// Second blacklist: 10s
		bl.recordFailure("claude-opus");
		expect(bl.isBlacklisted("claude-opus")).toBe(true);

		// Advance 9s — still blacklisted
		vi.spyOn(Date, "now").mockReturnValue(entry1Until + 1 + 9_000);
		expect(bl.isBlacklisted("claude-opus")).toBe(true);

		// Advance 1 more second — expired
		vi.spyOn(Date, "now").mockReturnValue(entry1Until + 1 + 10_001);
		expect(bl.isBlacklisted("claude-opus")).toBe(false);

		vi.restoreAllMocks();
	});

	it("filter removes blacklisted models", () => {
		const bl = new ModelBlacklist(1, 60_000);
		bl.recordFailure("bad-model");
		const models = [{ id: "good-model" }, { id: "bad-model" }];
		expect(bl.filter(models)).toEqual([{ id: "good-model" }]);
	});

	it("recordSuccess resets failure count so blacklist threshold restarts", () => {
		const bl = new ModelBlacklist(3, 60_000);
		bl.recordFailure("gpt-4o");
		bl.recordFailure("gpt-4o");
		bl.recordSuccess("gpt-4o");
		// Two more failures should not yet blacklist (counter reset)
		bl.recordFailure("gpt-4o");
		bl.recordFailure("gpt-4o");
		expect(bl.isBlacklisted("gpt-4o")).toBe(false);
	});

	it("unknown model is not blacklisted", () => {
		const bl = new ModelBlacklist(3, 60_000);
		expect(bl.isBlacklisted("unknown-model")).toBe(false);
	});

	it("filter returns all models when none are blacklisted", () => {
		const bl = new ModelBlacklist(3, 60_000);
		const models = [{ id: "a" }, { id: "b" }];
		expect(bl.filter(models)).toEqual(models);
	});
});

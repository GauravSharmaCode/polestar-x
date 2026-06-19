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

		// Exact boundary — should be expired at exactly blacklistedUntil
		vi.spyOn(Date, "now").mockReturnValue(entry1Until + 1 + 10_000);
		expect(bl.isBlacklisted("claude-opus")).toBe(false);

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

	it("recordSuccess lifts an active blacklist immediately", () => {
		const bl = new ModelBlacklist(1, 60_000);
		bl.recordFailure("m"); // blacklisted (maxRetries = 1)
		expect(bl.isBlacklisted("m")).toBe(true);
		bl.recordSuccess("m");
		expect(bl.isBlacklisted("m")).toBe(false);
	});

	it("recordSuccess preserves escalation so repeated failures back off longer", () => {
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now);

		const bl = new ModelBlacklist(1, 1_000); // base 1s
		bl.recordFailure("m"); // blacklistCount 1, window 1s
		bl.recordSuccess("m"); // lifts block, KEEPS blacklistCount = 1
		bl.recordFailure("m"); // blacklistCount 2, window 2s

		// 1.5s in: a non-escalated 1s window would have expired; the 2s window has not.
		vi.spyOn(Date, "now").mockReturnValue(now + 1_500);
		expect(bl.isBlacklisted("m")).toBe(true);

		vi.spyOn(Date, "now").mockReturnValue(now + 2_001);
		expect(bl.isBlacklisted("m")).toBe(false);

		vi.restoreAllMocks();
	});

	it("caps backoff at maxBackoffMs", () => {
		const now = Date.now();
		vi.spyOn(Date, "now").mockReturnValue(now);

		const bl = new ModelBlacklist(1, 1_000, 3_000); // base 1s, cap 3s
		bl.recordFailure("m");
		for (let i = 0; i < 10; i++) {
			bl.recordSuccess("m"); // lift, keep escalation
			bl.recordFailure("m"); // escalate again
		}

		// Without a cap the window would be enormous; with the cap it is exactly 3s.
		vi.spyOn(Date, "now").mockReturnValue(now + 2_999);
		expect(bl.isBlacklisted("m")).toBe(true);
		vi.spyOn(Date, "now").mockReturnValue(now + 3_001);
		expect(bl.isBlacklisted("m")).toBe(false);

		vi.restoreAllMocks();
	});
});

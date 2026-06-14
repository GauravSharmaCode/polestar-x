import { describe, expect, it } from "vitest";
import { isAgentSessionRetryableError } from "./builtin-retry.ts";

describe("isAgentSessionRetryableError", () => {
	it("matches transient provider faults", () => {
		expect(isAgentSessionRetryableError("rate limit exceeded")).toBe(true);
		expect(isAgentSessionRetryableError("connection lost")).toBe(true);
	});

	it("does not match billing or quota errors", () => {
		expect(isAgentSessionRetryableError("billing quota exceeded")).toBe(false);
	});
});

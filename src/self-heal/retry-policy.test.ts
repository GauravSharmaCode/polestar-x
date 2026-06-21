import { describe, expect, it } from "vitest";
import { decideRetry } from "./retry-policy.ts";

describe("decideRetry", () => {
	it("never retries unsafe failures", () => {
		expect(decideRetry("unsafe", 0).shouldRetry).toBe(false);
	});

	it("retries code_test failures within cap", () => {
		expect(decideRetry("code_test", 0).shouldRetry).toBe(true);
		expect(decideRetry("code_test", 3).shouldRetry).toBe(false);
	});
});

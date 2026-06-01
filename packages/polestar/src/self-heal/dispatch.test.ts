import { describe, expect, it } from "vitest";
import { queueToolFailureRetry } from "./auto-retry.ts";
import { buildSelfHealFollowUp, isAutoRetryFailureClass, shouldDeferAssistantRetryToAgentSession } from "./dispatch.ts";
import { createSelfHealState } from "./state.ts";

describe("self-heal dispatch", () => {
	it("builds follow-up with command and error snippet", () => {
		const text = buildSelfHealFollowUp({
			failureClass: "code_test",
			reason: "retry:code_test:1/3",
			source: "tool",
			command: "npm test",
			errorText: "Assertion failed",
		});
		expect(text).toContain("[polestar-self-heal] retry:code_test:1/3");
		expect(text).toContain("Failed command: `npm test`");
		expect(text).toContain("Assertion failed");
	});

	it("defers to agent-session retry for standard provider faults", () => {
		expect(shouldDeferAssistantRetryToAgentSession("rate limit exceeded")).toBe(true);
		expect(shouldDeferAssistantRetryToAgentSession("billing quota exceeded")).toBe(false);
	});

	it("queues automatic retry only for code_test and provider tool failures", () => {
		const state = createSelfHealState();
		const code = queueToolFailureRetry(state, {
			command: "npm test",
			stdout: "Tests failed",
			stderr: "",
			exitCode: 1,
		});
		expect(code.shouldRetry).toBe(true);
		expect(state.pending?.failureClass).toBe("code_test");

		const infra = queueToolFailureRetry(createSelfHealState(), {
			command: "missing-cmd",
			stdout: "command not found",
			stderr: "",
			exitCode: 127,
		});
		expect(infra.shouldRetry).toBe(false);
	});

	it("limits auto-retry classes", () => {
		expect(isAutoRetryFailureClass("code_test")).toBe(true);
		expect(isAutoRetryFailureClass("provider")).toBe(true);
		expect(isAutoRetryFailureClass("infra")).toBe(false);
	});
});

import type { Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { modelRouter } from "./model-router.ts";

function mockModel(id: string, provider = "anthropic"): Model<any> {
	return {
		id,
		provider,
		name: id,
		api: "anthropic-messages",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
	} as Model<any>;
}

describe("modelRouter", () => {
	it("routes privacy prompts toward local when available", () => {
		const result = modelRouter.route({
			prompt: "read my .env and fix API_KEY",
			turnCount: 0,
			previousFailures: 0,
			availableModels: [mockModel("claude-3-5-sonnet"), mockModel("llama3", "ollama")],
		});
		expect(result.taskClass).toBe("privacy_local");
		expect(result.model?.provider).toBe("ollama");
		expect(result.thinkingLevel).toBe("off");
	});

	it("blocks routing to cloud models if privacy is requested but no local models are available", () => {
		const result = modelRouter.route({
			prompt: "read my .env and fix API_KEY",
			turnCount: 0,
			previousFailures: 0,
			availableModels: [mockModel("claude-3-5-sonnet")],
		});
		expect(result.taskClass).toBe("privacy_local");
		expect(result.model).toBeUndefined();
		expect(result.reason).toBe("blocked:privacy_local:no_local_model_available");
		expect(result.fallbackChain).toEqual([]);
	});

	it("routes architecture tasks to premium models and enables thinking", () => {
		const result = modelRouter.route({
			prompt: "Design a new caching layer for the agent",
			turnCount: 0,
			previousFailures: 0,
			availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus"), mockModel("gpt-4o")],
		});
		expect(result.taskClass).toBe("architecture");
		expect(result.model?.id).toBe("claude-3-5-opus");
		expect(result.thinkingLevel).toBe("medium");
		expect(result.fallbackChain[0]?.id).toBe("claude-3-5-opus");
	});

	it("escalates thinking level when previous failures are present", () => {
		const result = modelRouter.route({
			prompt: "Change the color scheme from blue to green",
			turnCount: 1,
			previousFailures: 1,
			availableModels: [mockModel("gpt-4-mini", "openai"), mockModel("gpt-4o", "openai")],
		});
		expect(result.taskClass).toBe("code_edit");
		expect(result.model?.id).toBe("gpt-4o");
		expect(result.thinkingLevel).toBe("medium");
		expect(result.reason).toContain("escalated");
	});

	it("routes exploration tasks to fast models", () => {
		const result = modelRouter.route({
			prompt: "grep through the codebase for all calls to routeModel",
			turnCount: 0,
			previousFailures: 0,
			availableModels: [mockModel("claude-3-5-opus"), mockModel("claude-3-5-haiku")],
		});
		expect(result.taskClass).toBe("exploration");
		expect(result.model?.id).toBe("claude-3-5-haiku");
		expect(result.thinkingLevel).toBe("off");
	});
});

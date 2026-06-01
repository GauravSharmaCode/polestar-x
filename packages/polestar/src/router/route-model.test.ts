import type { Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { routeModel } from "./route-model.ts";

function mockModel(id: string, provider = "anthropic", reasoning = false): Model<any> {
	return {
		id,
		provider,
		name: id,
		api: "anthropic-messages",
		reasoning,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
	} as Model<any>;
}

describe("routeModel", () => {
	it("routes privacy prompts toward local when available", () => {
		const result = routeModel({
			prompt: "read my .env and fix API_KEY",
			availableModels: [mockModel("claude"), mockModel("llama3", "ollama")],
		});
		expect(result.taskClass).toBe("privacy_local");
		expect(result.model?.provider).toBe("ollama");
	});

	it("blocks routing to cloud models if privacy is requested but no local models are available", () => {
		const result = routeModel({
			prompt: "read my .env and fix API_KEY",
			availableModels: [mockModel("claude")],
		});
		expect(result.taskClass).toBe("privacy_local");
		expect(result.model).toBeUndefined();
		expect(result.reason).toBe("blocked:privacy_local:no_local_model_available");
	});

	it("routes multi-line tasks to architecture (safer default)", () => {
		const result = routeModel({
			prompt: "Fix these problems:\n\n1. Memory logging\n2. Worktree isolation\n3. Router improvements",
			availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus"), mockModel("gpt-4-turbo")],
		});
		expect(result.taskClass).toBe("architecture");
		expect(result.model?.id).toBe("claude-3-5-opus");
	});

	it("routes architecture tasks to Opus/strong models", () => {
		const result = routeModel({
			prompt: "Design a new caching layer for the agent",
			availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")],
		});
		expect(result.taskClass).toBe("architecture");
		expect(result.model?.id).toBe("claude-3-5-opus");
	});

	it("routes code_edit tasks to capable models when available", () => {
		const result = routeModel({
			prompt: "Change the color scheme from blue to green",
			availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-sonnet")],
		});
		expect(result.taskClass).toBe("code_edit");
		expect(result.model?.id).toBe("claude-3-5-sonnet");
	});

	it("routes exploration tasks to fast models", () => {
		const result = routeModel({
			prompt: "grep through the codebase for all calls to routeModel",
			availableModels: [mockModel("claude-3-5-opus"), mockModel("claude-3-5-haiku")],
		});
		expect(result.taskClass).toBe("exploration");
		expect(result.model?.id).toBe("claude-3-5-haiku");
	});

	it("routes background tasks to fast models", () => {
		const result = routeModel({
			prompt: "Fix a typo in the README",
			availableModels: [mockModel("claude-3-5-opus"), mockModel("claude-3-5-haiku")],
		});
		expect(result.taskClass).toBe("background");
		expect(result.model?.id).toBe("claude-3-5-haiku");
	});

	it("prioritizes capable models over fast models for code_edit", () => {
		const result = routeModel({
			prompt: "Add error handling to the fetch function",
			availableModels: [mockModel("gpt-4-mini"), mockModel("gpt-4-turbo")],
		});
		expect(result.model?.id).toBe("gpt-4-turbo");
	});
});

import type { Model } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { RoutingOrchestrator } from "./routing-orchestrator.ts";

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

const SESSION = "test-session";

describe("RoutingOrchestrator", () => {
	it("routes normally when no model is pinned", () => {
		const orch = new RoutingOrchestrator(5);
		const decision = orch.route(
			{
				prompt: "Fix a bug",
				turnCount: 1,
				previousFailures: 0,
				availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")],
			},
			SESSION,
		);
		expect(decision.model?.id).toBe("claude-3-5-opus");
		expect(decision.reason).not.toBe("user_pinned");
	});

	it("pins the user model when they override the router choice", () => {
		const orch = new RoutingOrchestrator(5);
		// First route: router picks opus, stores lastRouterModelId = "claude-3-5-opus"
		orch.route(
			{
				prompt: "Fix a bug",
				turnCount: 1,
				previousFailures: 0,
				currentModel: undefined,
				availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")],
			},
			SESSION,
		);

		// User manually switches to haiku (ctx.currentModel differs from lastRouterModelId)
		const pinned = orch.route(
			{
				prompt: "Fix a bug",
				turnCount: 2,
				previousFailures: 0,
				currentModel: mockModel("claude-3-5-haiku"),
				availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")],
			},
			SESSION,
		);

		expect(pinned.model?.id).toBe("claude-3-5-haiku");
		expect(pinned.reason).toBe("user_pinned");
	});

	it("keeps honoring the pin on subsequent turns", () => {
		const orch = new RoutingOrchestrator(5);
		orch.route(
			{ prompt: "Do X", turnCount: 1, previousFailures: 0, currentModel: undefined, availableModels: [mockModel("claude-3-5-opus")] },
			SESSION,
		);
		orch.route(
			{ prompt: "Do X", turnCount: 2, previousFailures: 0, currentModel: mockModel("claude-3-5-haiku"), availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")] },
			SESSION,
		);
		const result = orch.route(
			{ prompt: "Do Y", turnCount: 3, previousFailures: 0, currentModel: mockModel("claude-3-5-haiku"), availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")] },
			SESSION,
		);
		expect(result.model?.id).toBe("claude-3-5-haiku");
		expect(result.reason).toBe("user_pinned");
	});

	it("releases pin when pinned model is blacklisted", () => {
		const orch = new RoutingOrchestrator(1); // blacklist after 1 failure
		orch.route(
			{ prompt: "Do X", turnCount: 1, previousFailures: 0, currentModel: undefined, availableModels: [mockModel("claude-3-5-opus"), mockModel("claude-3-5-haiku")] },
			SESSION,
		);
		orch.route(
			{ prompt: "Do X", turnCount: 2, previousFailures: 0, currentModel: mockModel("claude-3-5-haiku"), availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")] },
			SESSION,
		);
		// Record failure for pinned model
		orch.recordFailure("claude-3-5-haiku");

		const result = orch.route(
			{ prompt: "Do X", turnCount: 3, previousFailures: 1, currentModel: mockModel("claude-3-5-haiku"), availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")] },
			SESSION,
		);
		expect(result.reason).not.toBe("user_pinned");
		expect(result.model?.id).toBe("claude-3-5-opus");
	});

	it("resets session state on resetSession", () => {
		const orch = new RoutingOrchestrator(5);
		orch.route({ prompt: "X", turnCount: 1, previousFailures: 0, currentModel: undefined, availableModels: [mockModel("claude-3-5-opus")] }, SESSION);
		orch.route({ prompt: "X", turnCount: 2, previousFailures: 0, currentModel: mockModel("claude-3-5-haiku"), availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")] }, SESSION);

		orch.resetSession(SESSION);

		const result = orch.route(
			{ prompt: "X", turnCount: 1, previousFailures: 0, currentModel: mockModel("claude-3-5-haiku"), availableModels: [mockModel("claude-3-5-haiku"), mockModel("claude-3-5-opus")] },
			SESSION,
		);
		expect(result.reason).not.toBe("user_pinned");
	});

	it("prefers recurring-budget providers (anthropic=recurring, github=limited per provider-budget.ts)", () => {
		const orch = new RoutingOrchestrator(5);
		const result = orch.route(
			{
				prompt: "Fix a bug",
				turnCount: 1,
				previousFailures: 0,
				availableModels: [mockModel("claude-3-5-opus", "github"), mockModel("claude-3-5-opus", "anthropic")],
			},
			SESSION,
		);
		expect(result.model?.provider).toBe("anthropic");
	});

	it("falls back to all models if all are blacklisted", () => {
		const orch = new RoutingOrchestrator(1);
		orch.recordFailure("only-model");
		const result = orch.route(
			{ prompt: "Fix a bug", turnCount: 1, previousFailures: 1, availableModels: [mockModel("only-model")] },
			SESSION,
		);
		expect(result.model?.id).toBe("only-model");
	});
});

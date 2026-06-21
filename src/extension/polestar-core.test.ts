import type { Model } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	memory: {
		search: vi.fn(),
		logLearning: vi.fn(),
		logTicket: vi.fn(),
		readMemoryFile: vi.fn(),
	},
	routingOrchestrator: {
		route: vi.fn(),
		recordFailure: vi.fn(),
		recordSuccess: vi.fn(),
		resetSession: vi.fn(),
	},
}));

vi.mock("../memory/backend.ts", () => ({
	createMemoryBackend: () => mocks.memory,
}));

vi.mock("../mcp/bridge.ts", () => ({
	connectMcpBridge: vi.fn(),
	disconnectMcpBridge: vi.fn(),
	clients: [],
}));

vi.mock("../router/routing-orchestrator.ts", () => ({
	routingOrchestrator: mocks.routingOrchestrator,
}));

import { polestarCoreExtension } from "./polestar-core.ts";

function mockModel(id: string, provider: string): Model<any> {
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

function createHarness() {
	const handlers = new Map<string, (event: any, ctx: any) => Promise<any>>();
	const pi = {
		on: vi.fn((name: string, handler: (event: any, ctx: any) => Promise<any>) => {
			handlers.set(name, handler);
		}),
		registerTool: vi.fn(),
		registerCommand: vi.fn(),
		setModel: vi.fn(),
		setThinkingLevel: vi.fn(),
		setActiveTools: vi.fn(),
		getActiveTools: vi.fn(() => []),
	};

	polestarCoreExtension(pi as any);
	return { handlers, pi };
}

function createContext(models: Model<any>[] = []) {
	return {
		cwd: process.cwd(),
		model: undefined,
		modelRegistry: {
			getAvailable: () => models,
		},
		sessionManager: {
			getSessionId: () => "test-session",
		},
	};
}

describe("polestarCoreExtension", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.memory.readMemoryFile.mockResolvedValue(undefined);
		mocks.memory.search.mockResolvedValue([]);
		mocks.routingOrchestrator.route.mockReturnValue({
			taskClass: "code_edit",
			complexity: "medium",
			model: undefined,
			thinkingLevel: "off",
			reason: "test",
			fallbackChain: [],
		});
	});

	it("does not require UI when recalled memory is added to the system prompt", async () => {
		const { handlers } = createHarness();
		mocks.memory.search.mockResolvedValue([{ path: "MEMORY.md", snippet: "prior context", score: 0.9 }]);

		const result = await handlers.get("before_agent_start")?.(
			{ prompt: "use memory", systemPrompt: "base prompt" },
			createContext(),
		);

		expect(result?.systemPrompt).toContain("base prompt");
		expect(result?.systemPrompt).toContain("## Historical Memory");
		expect(result?.systemPrompt).toContain("prior context");
	});

	it("attributes turn success to the fallback model that was actually applied", async () => {
		const primary = mockModel("gpt-4o", "provider-a");
		const fallback = mockModel("gpt-4o", "provider-b");
		const { handlers, pi } = createHarness();
		pi.setModel.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		mocks.routingOrchestrator.route.mockReturnValue({
			taskClass: "code_edit",
			complexity: "medium",
			model: primary,
			thinkingLevel: "off",
			reason: "test",
			fallbackChain: [primary, fallback],
		});

		const ctx = createContext([primary, fallback]);

		await handlers.get("turn_start")?.({ turnIndex: 0 }, ctx);
		await handlers.get("context")?.({ messages: [{ role: "user", content: "Fix the router" }] }, ctx);
		await handlers.get("turn_end")?.({ message: { role: "assistant", stopReason: "stop" } }, ctx);

		expect(mocks.routingOrchestrator.recordSuccess).toHaveBeenCalledWith(fallback);
	});
});

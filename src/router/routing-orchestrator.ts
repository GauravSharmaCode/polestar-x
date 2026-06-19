import type { Model } from "@earendil-works/pi-ai";
import { classifyTaskWithComplexity } from "./classify-task.ts";
import { ModelBlacklist } from "./model-blacklist.ts";
import { modelRouter } from "./model-router.ts";
import type { RoutingContext, RoutingDecision } from "./model-router.ts";
import { getProviderBudget } from "./provider-budget.ts";

/** Tier rank: lower = more capable/preferred. */
function modelTierRank(model: Model<any>): number {
	const id = model.id;
	if (/opus|gpt-5|claude-4|reasoning|claude-3-7|o1|o3/i.test(id)) return 0; // premium
	if (/sonnet|gpt-4o|pro(?!-mini)/i.test(id)) return 1; // standard
	if (/haiku|flash|mini|nano/i.test(id)) return 2; // fast
	return 3; // unknown
}

/** Sort models so premium > standard > fast, with recurring-budget providers first within each tier. */
function sortByTierAndBudget(models: Model<any>[]): Model<any>[] {
	return [...models].sort((a, b) => {
		const tierDiff = modelTierRank(a) - modelTierRank(b);
		if (tierDiff !== 0) return tierDiff;
		const aBudget = getProviderBudget(a.provider) === "recurring" ? 0 : 1;
		const bBudget = getProviderBudget(b.provider) === "recurring" ? 0 : 1;
		return aBudget - bBudget;
	});
}

interface OrchestratorSessionState {
	lastRouterModelId?: string;
	userPinned: boolean;
}

export class RoutingOrchestrator {
	private readonly blacklist: ModelBlacklist;
	private readonly sessionStates = new Map<string, OrchestratorSessionState>();

	constructor(maxRetries = 5) {
		this.blacklist = new ModelBlacklist(maxRetries);
	}

	recordFailure(modelId: string): void {
		this.blacklist.recordFailure(modelId);
	}

	recordSuccess(modelId: string): void {
		this.blacklist.recordSuccess(modelId);
	}

	resetSession(sessionId: string): void {
		const state = this.getSessionState(sessionId);
		state.userPinned = false;
		state.lastRouterModelId = undefined;
	}

	route(ctx: RoutingContext, sessionId: string): RoutingDecision {
		const state = this.getSessionState(sessionId);

		// Detect user model override: current model differs from what router last set.
		if (state.lastRouterModelId !== undefined && ctx.currentModel?.id !== state.lastRouterModelId) {
			state.userPinned = true;
		}

		// Release pin if the user's chosen model is blacklisted.
		if (state.userPinned && ctx.currentModel && this.blacklist.isBlacklisted(ctx.currentModel.id)) {
			state.userPinned = false;
		}

		// Honor user pin: return their choice with task-appropriate thinking level.
		if (state.userPinned && ctx.currentModel) {
			const classification = classifyTaskWithComplexity(ctx.prompt, ctx.preferLocal);
			state.lastRouterModelId = ctx.currentModel.id;
			return {
				taskClass: classification.taskClass,
				complexity: classification.complexity,
				model: ctx.currentModel,
				thinkingLevel: classification.suggestedThinking,
				reason: "user_pinned",
				fallbackChain: [ctx.currentModel],
			};
		}

		// Filter blacklisted; fall back to full list only if everything is blacklisted.
		const eligible = this.blacklist.filter(ctx.availableModels);
		const candidates = eligible.length > 0 ? eligible : ctx.availableModels;

		// Sort so higher-tier / recurring-budget models are preferred when the router
		// falls through to `available[0]` as last resort.
		const sorted = sortByTierAndBudget(candidates);

		const decision = modelRouter.route({
			...ctx,
			availableModels: sorted,
			getProviderBudget,
		});

		state.lastRouterModelId = decision.model?.id;
		return decision;
	}

	private getSessionState(sessionId: string): OrchestratorSessionState {
		const existing = this.sessionStates.get(sessionId);
		if (existing) return existing;
		const created: OrchestratorSessionState = { userPinned: false };
		this.sessionStates.set(sessionId, created);
		return created;
	}
}

export const routingOrchestrator = new RoutingOrchestrator();

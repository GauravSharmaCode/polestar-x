import type { Model } from "@earendil-works/pi-ai";
import { classifyTaskWithComplexity } from "./classify-task.ts";
import { ModelBlacklist } from "./model-blacklist.ts";
import { modelRouter, modelTierRank } from "./model-router.ts";
import type { RoutingContext, RoutingDecision } from "./model-router.ts";
import { getProviderBudget } from "./provider-budget.ts";

// modelRouter re-tiers and re-sorts internally; this pre-sort only governs the
// router's last-resort `available[0]` fallback (when every tier for a task class
// is empty), ensuring even that path prefers higher-tier / recurring-budget models.
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

		if (decision.model !== undefined) {
			state.lastRouterModelId = decision.model.id;
		}
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

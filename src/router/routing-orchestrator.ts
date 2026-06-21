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

export interface ModelIdentity {
	provider: string;
	id: string;
}

/** Stable identity for a model across providers: two providers can share a model id. */
export function modelKey(model: ModelIdentity | undefined): string | undefined {
	return model ? `${model.provider}/${model.id}` : undefined;
}

interface OrchestratorSessionState {
	lastRouterModelKey?: string;
	userPinned: boolean;
}

export class RoutingOrchestrator {
	private readonly blacklist: ModelBlacklist;
	private readonly sessionStates = new Map<string, OrchestratorSessionState>();

	constructor(maxRetries = 5) {
		this.blacklist = new ModelBlacklist(maxRetries);
	}

	recordFailure(model: ModelIdentity): void {
		const key = modelKey(model);
		if (key) this.blacklist.recordFailure(key);
	}

	recordSuccess(model: ModelIdentity): void {
		const key = modelKey(model);
		if (key) this.blacklist.recordSuccess(key);
	}

	resetSession(sessionId: string): void {
		const state = this.getSessionState(sessionId);
		state.userPinned = false;
		state.lastRouterModelKey = undefined;
	}

	route(ctx: RoutingContext, sessionId: string): RoutingDecision {
		const state = this.getSessionState(sessionId);

		// Detect user model override: current model differs from what the router last set.
		// Key on provider+id so a same-id cross-provider switch is still detected.
		const currentKey = modelKey(ctx.currentModel);
		if (state.lastRouterModelKey !== undefined && currentKey !== state.lastRouterModelKey) {
			state.userPinned = true;
		}

		// Release pin if the user's chosen model is blacklisted.
		const currentModelKey = modelKey(ctx.currentModel);
		if (state.userPinned && currentModelKey && this.blacklist.isBlacklisted(currentModelKey)) {
			state.userPinned = false;
		}

		// Honor user pin: return their choice with task-appropriate thinking level.
		if (state.userPinned && ctx.currentModel) {
			const classification = classifyTaskWithComplexity(ctx.prompt, ctx.preferLocal);
			state.lastRouterModelKey = modelKey(ctx.currentModel);
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
		const eligible = ctx.availableModels.filter((model) => {
			const key = modelKey(model);
			return key ? !this.blacklist.isBlacklisted(key) : true;
		});
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
			state.lastRouterModelKey = modelKey(decision.model);
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

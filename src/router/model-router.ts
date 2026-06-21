import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { classifyTaskWithComplexity } from "./classify-task.ts";
import type { TaskClass } from "./types.ts";

export interface ModelTier {
	premium: Model<any>[];
	standard: Model<any>[];
	fast: Model<any>[];
	local: Model<any>[];
}

export interface RoutingDecision {
	taskClass: TaskClass;
	complexity: "low" | "medium" | "high";
	model?: Model<any>;
	thinkingLevel: ThinkingLevel;
	reason: string;
	fallbackChain: Model<any>[];
}

export interface RoutingContext {
	prompt: string;
	turnCount: number;
	previousFailures: number;
	currentModel?: Model<any>;
	availableModels: Model<any>[];
	preferLocal?: boolean;
	budgetRemaining?: number;
	currentMode?: string;
	getProviderBudget?: (provider: string) => "recurring" | "limited";
}

function isLocalModel(model: { provider: string; id: string }): boolean {
	const provider = model.provider.toLowerCase();
	const id = model.id.toLowerCase();
	return (
		provider.includes("ollama") || provider.includes("local") || provider.includes("custom") || id.includes("local")
	);
}

function getVersion(model: Model<any>): number {
	const match = model.id.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
	if (!match) return 0;
	return parseFloat(`${match[1]}.${match[2] || "0"}${match[3] || "0"}`);
}

/** Tier rank: 0 premium, 1 standard, 2 fast, 3 unknown. Single source of truth for tiering. */
export function modelTierRank(model: { id: string }): number {
	const id = model.id;
	if (/opus|gpt-5|claude-4|reasoning|claude-3-7|o1|o3/i.test(id)) return 0;
	if (/sonnet|gpt-4o|pro(?!-mini)/i.test(id)) return 1;
	if (/haiku|flash|mini|nano/i.test(id)) return 2;
	return 3;
}

function sortTier(models: Model<any>[], getBudget?: (provider: string) => "recurring" | "limited"): Model<any>[] {
	return models.sort((a, b) => {
		if (getBudget) {
			const aBudget = getBudget(a.provider) === "recurring" ? 0 : 1;
			const bBudget = getBudget(b.provider) === "recurring" ? 0 : 1;
			if (aBudget !== bBudget) return aBudget - bBudget;
		}
		const aThink = /think|reasoning/i.test(a.id) ? 1 : 0;
		const bThink = /think|reasoning/i.test(b.id) ? 1 : 0;
		const aVer = getVersion(a);
		const bVer = getVersion(b);
		if (aVer !== bVer) return bVer - aVer;
		return bThink - aThink;
	});
}

function buildTiers(models: Model<any>[], getBudget?: (provider: string) => "recurring" | "limited"): ModelTier {
	const premium = models.filter((m) => modelTierRank(m) === 0);
	const standard = models.filter((m) => modelTierRank(m) === 1);
	const fast = models.filter((m) => modelTierRank(m) === 2);
	const local = models.filter((m) => isLocalModel(m));

	return {
		premium: sortTier(premium, getBudget),
		standard: sortTier(standard, getBudget),
		fast: sortTier(fast, getBudget),
		local: sortTier(local, getBudget),
	};
}

function buildFallbackChain(primary: Model<any> | undefined, models: Model<any>[]): Model<any>[] {
	const chain = primary ? [primary] : [];
	const rest = models.filter((m) => !primary || m.provider !== primary.provider || m.id !== primary.id);

	const groups = new Map<string, Model<any>[]>();
	for (const m of rest) {
		const g = groups.get(m.provider) || [];
		g.push(m);
		groups.set(m.provider, g);
	}

	let hasMore = true;
	while (hasMore) {
		hasMore = false;
		for (const [_, list] of groups) {
			if (list.length > 0) {
				chain.push(list.shift()!);
				hasMore = true;
			}
		}
	}

	return chain;
}

function escalateThinkingLevel(level: ThinkingLevel): ThinkingLevel {
	if (level === "off") return "medium";
	if (level === "medium") return "high";
	return level;
}

export class ModelRouter {
	route(ctx: RoutingContext): RoutingDecision {
		const tiers = buildTiers(ctx.availableModels, ctx.getProviderBudget);
		const classification = classifyTaskWithComplexity(ctx.prompt, ctx.preferLocal);
		const shouldEscalate =
			ctx.previousFailures > 0 || ctx.turnCount > 5 || classification.complexity === "high" || taskLooksStuck(ctx);

		return pickForClass(classification.taskClass, classification, tiers, ctx, shouldEscalate);
	}
}

function taskLooksStuck(ctx: RoutingContext): boolean {
	// Cheap heuristic: if the session keeps turning without progress, treat it as stuck.
	// (Use `turnCount` rather than token/usage to keep this extension-only.)
	return ctx.turnCount >= 10;
}

function pickFromTiers(
	preferred: Model<any>[],
	fallback: Model<any>[],
	available: Model<any>[],
): Model<any> | undefined {
	return preferred[0] ?? fallback[0] ?? available[0];
}

function pickForClass(
	taskClass: TaskClass,
	classification: ReturnType<typeof classifyTaskWithComplexity>,
	tiers: ModelTier,
	ctx: RoutingContext,
	escalate: boolean,
): RoutingDecision {
	const available = ctx.availableModels;
	if (available.length === 0) {
		return {
			taskClass,
			complexity: classification.complexity,
			model: ctx.currentModel,
			thinkingLevel: classification.suggestedThinking,
			reason: "no_available_models",
			fallbackChain: ctx.currentModel ? [ctx.currentModel] : [],
		};
	}

	if (taskClass === "privacy_local") {
		const local = tiers.local[0];
		if (!local) {
			return {
				taskClass,
				complexity: classification.complexity,
				model: undefined,
				thinkingLevel: "off",
				reason: "blocked:privacy_local:no_local_model_available",
				fallbackChain: [],
			};
		}
		return {
			taskClass,
			complexity: classification.complexity,
			model: local,
			thinkingLevel: "off",
			reason: "privacy:local_required",
			fallbackChain: buildFallbackChain(local, tiers.local),
		};
	}

	const isThinkingMode = ctx.currentMode === "think" || ctx.currentMode === "plan";
	const isSpecMode = ctx.currentMode === "spec";

	if (taskClass === "architecture" || isThinkingMode || isSpecMode) {
		const prefer =
			isThinkingMode || isSpecMode ? tiers.premium : tiers.premium.length > 0 ? tiers.premium : tiers.standard;
		const model = pickFromTiers(prefer, tiers.standard, available);

		let baseThinking = classification.suggestedThinking;
		if (isThinkingMode) baseThinking = "high";
		else if (isSpecMode && baseThinking === "off") baseThinking = "medium";
		else if (baseThinking === "off") baseThinking = "medium";

		const thinkingLevel = escalate ? escalateThinkingLevel(baseThinking) : baseThinking;
		const fallback = [...tiers.premium, ...tiers.standard, ...tiers.fast].filter((m) => !isLocalModel(m));
		return {
			taskClass,
			complexity: classification.complexity,
			model,
			thinkingLevel,
			reason: `architecture:${escalate ? "escalated" : "default"}:${ctx.currentMode || "none"}`,
			fallbackChain: buildFallbackChain(model, fallback),
		};
	}

	if (taskClass === "exploration") {
		const model = pickFromTiers(tiers.fast, tiers.standard, available);
		const fallback = [...tiers.fast, ...tiers.standard].filter((m) => !isLocalModel(m));
		return {
			taskClass,
			complexity: classification.complexity,
			model,
			thinkingLevel: "off",
			reason: "exploration:fast_model",
			fallbackChain: buildFallbackChain(model, fallback),
		};
	}

	if (taskClass === "background") {
		const model = pickFromTiers(tiers.fast, [], available);
		const fallback = [...tiers.fast].filter((m) => !isLocalModel(m));
		return {
			taskClass,
			complexity: classification.complexity,
			model,
			thinkingLevel: "off",
			reason: "background:cheapest",
			fallbackChain: buildFallbackChain(model, fallback),
		};
	}

	// code_edit: scale tier to complexity so trivial prompts use cheap models.
	//   escalated / high → premium (fallback standard)
	//   medium           → standard (fallback fast)
	//   low              → fast    (fallback standard)
	// `escalate` already includes complexity === "high" (see shouldEscalate).
	let prefer: Model<any>[];
	let fallback: Model<any>[];
	if (escalate) {
		prefer = tiers.premium.length > 0 ? tiers.premium : tiers.standard;
		fallback = tiers.standard;
	} else if (classification.complexity === "medium") {
		prefer = tiers.standard.length > 0 ? tiers.standard : tiers.premium;
		fallback = tiers.fast;
	} else {
		prefer = tiers.fast.length > 0 ? tiers.fast : tiers.standard;
		fallback = tiers.standard;
	}
	const model = pickFromTiers(prefer, fallback, available);
	const baseThinking = classification.suggestedThinking;
	const thinkingLevel = escalate ? escalateThinkingLevel(baseThinking) : baseThinking;
	const chain = [...tiers.standard, ...tiers.fast].filter((m) => !isLocalModel(m));
	return {
		taskClass,
		complexity: classification.complexity,
		model,
		thinkingLevel,
		reason: `code_edit:${escalate ? "escalated" : "default"}`,
		fallbackChain: buildFallbackChain(model, chain),
	};
}

export const modelRouter = new ModelRouter();

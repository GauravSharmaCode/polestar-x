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
}

function isLocalModel(model: { provider: string; id: string }): boolean {
	const provider = model.provider.toLowerCase();
	const id = model.id.toLowerCase();
	return (
		provider.includes("ollama") || provider.includes("local") || provider.includes("custom") || id.includes("local")
	);
}

function buildTiers(models: Model<any>[]): ModelTier {
	return {
		premium: models.filter((m) => /opus|gpt-5|claude-4|reasoning/i.test(m.id)),
		standard: models.filter((m) => /sonnet|gpt-4o|pro(?!-mini)/i.test(m.id)),
		fast: models.filter((m) => /haiku|flash|mini|nano/i.test(m.id)),
		local: models.filter((m) => isLocalModel(m)),
	};
}

function buildFallbackChain(primary: Model<any> | undefined, models: Model<any>[]): Model<any>[] {
	if (!primary) return [...models];
	const rest = models.filter((m) => m !== primary && m.id !== primary.id);
	return [primary, ...rest];
}

function escalateThinkingLevel(level: ThinkingLevel): ThinkingLevel {
	if (level === "off") return "medium";
	if (level === "medium") return "high";
	return level;
}

export class ModelRouter {
	route(ctx: RoutingContext): RoutingDecision {
		const tiers = buildTiers(ctx.availableModels);
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

	if (taskClass === "architecture") {
		const model = pickFromTiers(tiers.premium, tiers.standard, available);
		const baseThinking = classification.suggestedThinking === "off" ? "medium" : classification.suggestedThinking;
		const thinkingLevel = escalate ? escalateThinkingLevel(baseThinking) : baseThinking;
		const fallback = [...tiers.premium, ...tiers.standard, ...tiers.fast].filter((m) => !isLocalModel(m));
		return {
			taskClass,
			complexity: classification.complexity,
			model,
			thinkingLevel,
			reason: `architecture:${escalate ? "escalated" : "default"}`,
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

	// code_edit default
	const prefer = escalate ? tiers.premium : tiers.standard;
	const fallback = escalate ? tiers.standard : tiers.fast;
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

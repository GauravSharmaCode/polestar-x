import { classifyTask } from "./classify-task.ts";
import type { RouteRequest, RouteResult } from "./types.ts";

function isLocalModel(model: { provider: string; id: string }): boolean {
	const p = model.provider.toLowerCase();
	const id = model.id.toLowerCase();
	return p.includes("ollama") || p.includes("local") || id.includes("local") || model.provider === "custom";
}

function isCapableModel(model: { id: string }): boolean {
	// Strong models (Opus, Claude 3.5 Sonnet, GPT-4 Turbo/5, etc.)
	// Explicitly exclude fast models (-haiku, -mini, -flash)
	const id = model.id.toLowerCase();
	if (id.includes("haiku") || id.includes("mini") || id.includes("flash")) {
		return false;
	}
	return /opus|claude-3-5-sonnet|gpt-4-turbo|gpt-5|claude-4|sonnet|pro/i.test(id);
}

function isFastModel(model: { id: string }): boolean {
	// Fast/cheap models
	return /flash|mini|haiku|fast|nano/i.test(model.id);
}

function pickByClass(
	models: RouteRequest["availableModels"],
	taskClass: ReturnType<typeof classifyTask>,
): RouteResult["model"] | null {
	if (models.length === 0) return undefined;

	if (taskClass === "privacy_local") {
		const local = models.find(isLocalModel);
		if (local) {
			return local;
		}
		// Hard block: do not return a cloud model if privacy_local is requested and no local model is available
		return null;
	}

	if (taskClass === "architecture") {
		return models.find((m) => isCapableModel(m)) ?? models.find((m) => m.reasoning) ?? models[0];
	}

	if (taskClass === "code_edit") {
		// Code editing typically needs moderate capability; prefer capable models but allow fast fallback
		return models.find((m) => isCapableModel(m)) ?? models.find((m) => !isFastModel(m)) ?? models[0];
	}

	if (taskClass === "exploration") {
		return models.find((m) => isFastModel(m)) ?? models[0];
	}

	if (taskClass === "background") {
		return models.find((m) => isFastModel(m)) ?? models[0];
	}

	return models[0];
}

export function routeModel(request: RouteRequest): RouteResult {
	const taskClass = classifyTask(request.prompt, request.preferLocal);
	const modelResult = pickByClass(request.availableModels, taskClass);

	if (modelResult === null) {
		return {
			taskClass,
			model: undefined,
			reason: `blocked:privacy_local:no_local_model_available`,
		};
	}

	const model = modelResult ?? request.currentModel;
	return {
		taskClass,
		model,
		reason: `heuristic:${taskClass}`,
	};
}

export function buildFallbackChain(
	models: RouteRequest["availableModels"],
	primary?: RouteResult["model"],
): RouteResult["model"][] {
	if (!primary) return [...models];
	const rest = models.filter((m) => m !== primary && m.id !== primary.id);
	return [primary, ...rest];
}

import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "../../../coding-agent/src/core/extensions/types.ts";
import { modelRouter } from "../router/model-router.ts";
import { isAgentSessionRetryableError } from "./builtin-retry.ts";
import type { FailureClass } from "./classify-failure.ts";
import type { PendingRetry } from "./state.ts";

const AUTO_RETRY_CLASSES: FailureClass[] = ["code_test", "provider"];
export const SELF_HEAL_FOLLOW_UP_PREFIX = "[polestar-self-heal]";

export function isAutoRetryFailureClass(failureClass: FailureClass): boolean {
	return AUTO_RETRY_CLASSES.includes(failureClass);
}

export function buildSelfHealFollowUp(pending: PendingRetry): string {
	const lines = [
		`${SELF_HEAL_FOLLOW_UP_PREFIX} ${pending.reason}. Diagnose root cause before retrying.`,
		"",
		"Continue working on the task. Fix the underlying issue before re-running the same command.",
	];
	if (pending.command) {
		lines.splice(2, 0, `Failed command: \`${pending.command}\``);
	}
	if (pending.errorText) {
		const snippet = pending.errorText.trim().slice(0, 1200);
		if (snippet) {
			lines.splice(pending.command ? 3 : 2, 0, "", "```", snippet, "```");
		}
	}
	return lines.join("\n");
}

export function shouldDeferAssistantRetryToAgentSession(errorMessage: string | undefined): boolean {
	if (!errorMessage) return false;
	return isAgentSessionRetryableError(errorMessage);
}

export async function tryProviderModelFallback(
	pi: ExtensionAPI,
	ctx: {
		model: Model<any> | undefined;
		modelRegistry: { getAvailable(): Model<any>[] };
	},
	routing: { initialPrompt?: string; turnCount: number; consecutiveFailures: number },
): Promise<boolean> {
	const available = ctx.modelRegistry.getAvailable();
	if (available.length <= 1) return false;

	const decision = modelRouter.route({
		prompt: routing.initialPrompt ?? "",
		turnCount: routing.turnCount,
		previousFailures: routing.consecutiveFailures + 1,
		currentModel: ctx.model,
		availableModels: available,
	});

	const chain = decision.fallbackChain.length > 0 ? decision.fallbackChain : available;
	const current = ctx.model;
	let startIndex = 0;
	if (current) {
		const idx = chain.findIndex((m) => m.provider === current.provider && m.id === current.id);
		startIndex = idx >= 0 ? idx + 1 : 0;
	}

	for (let i = startIndex; i < chain.length; i++) {
		const candidate = chain[i];
		if (current && candidate.provider === current.provider && candidate.id === current.id) {
			continue;
		}
		if (await pi.setModel(candidate)) {
			return true;
		}
	}
	return false;
}

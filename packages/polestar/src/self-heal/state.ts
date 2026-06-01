import type { FailureClass } from "./classify-failure.ts";

export interface PendingRetry {
	failureClass: FailureClass;
	reason: string;
	source: "tool" | "assistant";
	command?: string;
	errorText?: string;
}

export interface SelfHealState {
	attemptsByClass: Partial<Record<FailureClass, number>>;
	pending: PendingRetry | null;
}

export function createSelfHealState(): SelfHealState {
	return { attemptsByClass: {}, pending: null };
}

export function getAttemptCount(state: SelfHealState, failureClass: FailureClass): number {
	return state.attemptsByClass[failureClass] ?? 0;
}

/** Record a failed attempt and return the new count for this failure class. */
export function recordFailureAttempt(state: SelfHealState, failureClass: FailureClass): number {
	const next = getAttemptCount(state, failureClass) + 1;
	state.attemptsByClass[failureClass] = next;
	return next;
}

export function resetSelfHealAttempts(state: SelfHealState): void {
	state.attemptsByClass = {};
	state.pending = null;
}

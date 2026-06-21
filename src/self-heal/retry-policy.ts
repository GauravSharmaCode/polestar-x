import type { FailureClass } from "./classify-failure.ts";

export interface RetryDecision {
	shouldRetry: boolean;
	maxAttempts: number;
	reason: string;
}

const DEFAULT_MAX: Record<FailureClass, number> = {
	code_test: 3,
	infra: 1,
	unsafe: 0,
	provider: 2,
	unknown: 1,
};

export function decideRetry(failureClass: FailureClass, attempt: number): RetryDecision {
	const maxAttempts = DEFAULT_MAX[failureClass];
	const shouldRetry = attempt < maxAttempts;
	return {
		shouldRetry,
		maxAttempts,
		reason: shouldRetry ? `retry:${failureClass}:${attempt + 1}/${maxAttempts}` : `stop:${failureClass}`,
	};
}

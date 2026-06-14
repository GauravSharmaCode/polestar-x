/**
 * PoleStar harness boundary types — decouple product layer from forked runtime.
 */

export interface HarnessModelExecutor {
	executeTurn(input: { messages: unknown[]; modelId: string }): AsyncIterable<unknown>;
}

export interface HarnessSessionStore {
	load(sessionId: string): Promise<unknown[]>;
	save(sessionId: string, messages: unknown[]): Promise<void>;
}

export interface HarnessHookBus {
	emit<T>(event: string, payload: T): Promise<T | undefined>;
}

export interface HarnessToolRegistry {
	list(): string[];
	setActive(toolNames: string[]): void;
}

export interface HarnessPromptAssembler {
	compose(basePrompt: string): string;
}

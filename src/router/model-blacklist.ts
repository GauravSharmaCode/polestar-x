const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour

interface BlacklistEntry {
	failureCount: number;
	blacklistCount: number;
	blacklistedUntil?: number;
}

export class ModelBlacklist {
	private readonly entries = new Map<string, BlacklistEntry>();
	private readonly maxRetries: number;
	private readonly baseBackoffMs: number;
	private readonly maxBackoffMs: number;

	constructor(
		maxRetries = DEFAULT_MAX_RETRIES,
		baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
		maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
	) {
		this.maxRetries = maxRetries;
		this.baseBackoffMs = baseBackoffMs;
		this.maxBackoffMs = maxBackoffMs;
	}

	recordFailure(modelId: string): boolean {
		const entry = this.entries.get(modelId) ?? { failureCount: 0, blacklistCount: 0 };
		entry.failureCount += 1;
		if (entry.failureCount >= this.maxRetries) {
			entry.blacklistCount += 1;
			const backoff = Math.min(this.baseBackoffMs * 2 ** (entry.blacklistCount - 1), this.maxBackoffMs);
			entry.blacklistedUntil = Date.now() + backoff;
			entry.failureCount = 0;
		}
		this.entries.set(modelId, entry);
		return this.isBlacklisted(modelId);
	}

	recordSuccess(modelId: string): void {
		const entry = this.entries.get(modelId);
		if (entry) {
			entry.failureCount = 0;
			// Lift any active block — the model is working again.
			entry.blacklistedUntil = undefined;
			// Keep blacklistCount: exponential escalation must survive a single recovery
			// so a chronically flaky model backs off progressively longer each cycle.
		}
	}

	isBlacklisted(modelId: string): boolean {
		const entry = this.entries.get(modelId);
		if (!entry?.blacklistedUntil) return false;
		if (Date.now() >= entry.blacklistedUntil) {
			entry.blacklistedUntil = undefined;
			return false;
		}
		return true;
	}

	filter<T extends { id: string }>(models: T[]): T[] {
		return models.filter((m) => !this.isBlacklisted(m.id));
	}
}

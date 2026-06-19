const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_BACKOFF_MS = 5 * 60 * 1000; // 5 minutes

interface BlacklistEntry {
	failureCount: number;
	blacklistCount: number;
	blacklistedUntil?: number;
}

export class ModelBlacklist {
	private readonly entries = new Map<string, BlacklistEntry>();

	constructor(
		private readonly maxRetries = DEFAULT_MAX_RETRIES,
		private readonly baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
	) {}

	recordFailure(modelId: string): boolean {
		const entry = this.entries.get(modelId) ?? { failureCount: 0, blacklistCount: 0 };
		entry.failureCount += 1;
		if (entry.failureCount >= this.maxRetries) {
			entry.blacklistCount += 1;
			entry.blacklistedUntil = Date.now() + this.baseBackoffMs * Math.pow(2, entry.blacklistCount - 1);
			entry.failureCount = 0;
		}
		this.entries.set(modelId, entry);
		return this.isBlacklisted(modelId);
	}

	recordSuccess(modelId: string): void {
		const entry = this.entries.get(modelId);
		if (entry) {
			entry.failureCount = 0;
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

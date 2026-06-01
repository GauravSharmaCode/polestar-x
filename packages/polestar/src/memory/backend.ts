import type { SearchResult } from "@gauravsharmacode/pi-memory/dist/core/search.js";

export type MemorySearchResult = SearchResult;

export interface MemoryBackend {
	search(query: string, signal?: AbortSignal): Promise<MemorySearchResult[]>;
	logLearning(summary: string, tags?: string[]): Promise<void>;
	logTicket(id: string, summary: string, resolution?: string, tags?: string[]): Promise<void>;
	readMemoryFile(): Promise<string | undefined>;
}

export class DirectMemoryBackend implements MemoryBackend {
	// Lazy-loaded pi-memory client
	private searchMemory: any = null;
	private logWork: any = null;
	private initPromise: Promise<void> | null = null;

	private async ensureInitialized(): Promise<void> {
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				// Dynamically import pi-memory to avoid adding it as a hard dependency if not available
				const searchModule = await import("@gauravsharmacode/pi-memory/dist/tools/search.js");
				const logModule = await import("@gauravsharmacode/pi-memory/dist/tools/log.js");
				this.searchMemory = searchModule.searchMemory;
				this.logWork = logModule.logWork;
			} catch {
				// pi-memory not available, will gracefully degrade
				this.searchMemory = null;
				this.logWork = null;
			}
		})();

		await this.initPromise;
	}

	async search(query: string, signal?: AbortSignal): Promise<MemorySearchResult[]> {
		await this.ensureInitialized();

		if (!this.searchMemory) {
			return [];
		}

		try {
			const response = await this.searchMemory({ query, maxResults: 5 });
			return response?.results || [];
		} catch (err: any) {
			if (signal?.aborted) return [];
			console.debug(`Memory search error: ${err.message}`);
			return [];
		}
	}

	async logLearning(summary: string, tags: string[] = []): Promise<void> {
		await this.ensureInitialized();

		if (!this.logWork) {
			return;
		}

		try {
			await this.logWork({
				type: "learning",
				summary,
				tags,
			});
		} catch (err: any) {
			console.debug(`Memory log error: ${err.message}`);
		}
	}

	async logTicket(id: string, summary: string, resolution?: string, tags: string[] = []): Promise<void> {
		await this.ensureInitialized();

		if (!this.logWork) {
			return;
		}

		try {
			await this.logWork({
				type: "ticket",
				summary,
				ticketId: id,
				resolution,
				tags,
			});
		} catch (err: any) {
			console.debug(`Memory log error: ${err.message}`);
		}
	}

	async readMemoryFile(): Promise<string | undefined> {
		// pi-memory doesn't expose a read function, returning undefined
		return undefined;
	}
}

export class NoopMemoryBackend implements MemoryBackend {
	async search(): Promise<MemorySearchResult[]> {
		return [];
	}

	async logLearning(): Promise<void> {}

	async logTicket(): Promise<void> {}

	async readMemoryFile(): Promise<string | undefined> {
		return undefined;
	}
}

export function createMemoryBackend(): MemoryBackend {
	// Try to use direct backend; fall back to noop if pi-memory not available
	try {
		return new DirectMemoryBackend();
	} catch {
		console.warn("pi-memory not available, memory features disabled");
		return new NoopMemoryBackend();
	}
}

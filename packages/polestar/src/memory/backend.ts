import type { MemorySearchResult } from "pi-memory";

export interface MemoryBackend {
	search(query: string, signal?: AbortSignal): Promise<MemorySearchResult[]>;
	logLearning(summary: string, tags?: string[]): Promise<void>;
	logTicket(id: string, summary: string, resolution?: string, tags?: string[]): Promise<void>;
	readMemoryFile(): Promise<string | undefined>;
}

export class DirectMemoryBackend implements MemoryBackend {
	// Lazy-loaded pi-memory client
	private memoryClient: any = null;
	private initPromise: Promise<void> | null = null;

	private async ensureInitialized(): Promise<void> {
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				// Dynamically import pi-memory to avoid adding it as a hard dependency if not available
				const piMemory = await import("pi-memory");
				this.memoryClient = piMemory;
			} catch {
				// pi-memory not available, will gracefully degrade
				this.memoryClient = null;
			}
		})();

		await this.initPromise;
	}

	async search(query: string, signal?: AbortSignal): Promise<MemorySearchResult[]> {
		await this.ensureInitialized();

		if (!this.memoryClient) {
			return [];
		}

		try {
			const results = await this.memoryClient.search?.(query, { signal });
			return Array.isArray(results) ? results : [];
		} catch (err: any) {
			if (signal?.aborted) return [];
			console.debug(`Memory search error: ${err.message}`);
			return [];
		}
	}

	async logLearning(summary: string, tags: string[] = []): Promise<void> {
		await this.ensureInitialized();

		if (!this.memoryClient) {
			return;
		}

		try {
			await this.memoryClient.log?.({
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

		if (!this.memoryClient) {
			return;
		}

		try {
			await this.memoryClient.log?.({
				type: "ticket",
				id,
				summary,
				resolution,
				tags,
			});
		} catch (err: any) {
			console.debug(`Memory log error: ${err.message}`);
		}
	}

	async readMemoryFile(): Promise<string | undefined> {
		await this.ensureInitialized();

		if (!this.memoryClient) {
			return undefined;
		}

		try {
			const content = await this.memoryClient.readMemory?.();
			return content && typeof content === "string" ? content : undefined;
		} catch (err: any) {
			console.debug(`Memory read error: ${err.message}`);
			return undefined;
		}
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

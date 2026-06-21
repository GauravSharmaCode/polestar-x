export interface MemorySearchResult {
	path: string;
	snippet: string;
	score: number;
}

export interface MemoryBackend {
	search(query: string, signal?: AbortSignal): Promise<MemorySearchResult[]>;
	logLearning(summary: string, tags?: string[]): Promise<void>;
	logTicket(id: string, summary: string, resolution?: string, tags?: string[]): Promise<void>;
	readMemoryFile(): Promise<string | undefined>;
}

export class DirectMemoryBackend implements MemoryBackend {
	private searchMemoryFn: any = null;
	private logWorkFn: any = null;
	private getMemoryFileFn: any = null;
	private initPromise: Promise<void> | null = null;

	private async ensureInitialized(): Promise<void> {
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				const searchMod = await import("@gauravsharmacode/pi-memory/dist/tools/search.js");
				const logMod = await import("@gauravsharmacode/pi-memory/dist/tools/log.js");
				const getMod = await import("@gauravsharmacode/pi-memory/dist/tools/get.js");
				this.searchMemoryFn = searchMod.searchMemory;
				this.logWorkFn = logMod.logWork;
				this.getMemoryFileFn = getMod.getMemoryFile;
			} catch (err: any) {
				console.debug(`Failed to initialize direct memory backend: ${err.message}`);
				this.searchMemoryFn = null;
				this.logWorkFn = null;
				this.getMemoryFileFn = null;
			}
		})();

		await this.initPromise;
	}

	async search(query: string, signal?: AbortSignal): Promise<MemorySearchResult[]> {
		await this.ensureInitialized();
		if (!this.searchMemoryFn) return [];

		try {
			const output = await this.searchMemoryFn({ query, maxResults: 5 });
			if (signal?.aborted) return [];
			return Array.isArray(output?.results) ? output.results : [];
		} catch (err: any) {
			console.debug(`Memory search error: ${err.message}`);
			return [];
		}
	}

	async logLearning(summary: string, tags: string[] = []): Promise<void> {
		await this.ensureInitialized();
		if (!this.logWorkFn) return;

		try {
			await this.logWorkFn({
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
		if (!this.logWorkFn) return;

		try {
			await this.logWorkFn({
				type: "ticket",
				ticketId: id,
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
		if (!this.getMemoryFileFn) return undefined;

		try {
			const output = await this.getMemoryFileFn({ path: "MEMORY.md" });
			return output?.content;
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
	try {
		return new DirectMemoryBackend();
	} catch {
		console.warn("pi-memory not available, memory features disabled");
		return new NoopMemoryBackend();
	}
}

import type { MemorySearchResult } from "./backend.ts";

export function formatHistoricalMemoryBlock(results: MemorySearchResult[], maxItems = 5): string | undefined {
	const filtered = results
		.filter((r) => r.snippet?.trim())
		.sort((a, b) => b.score - a.score)
		.slice(0, maxItems);
	if (filtered.length === 0) return undefined;
	const lines = filtered.map((r) => `- (${r.path}, score ${r.score.toFixed(2)}) ${r.snippet.trim()}`);
	return ["## Historical Memory", ...lines].join("\n");
}

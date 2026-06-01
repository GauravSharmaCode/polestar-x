import * as htmlparser2 from "htmlparser2";
import { Type } from "typebox";
import type { ToolDefinition } from "../../../coding-agent/src/core/extensions/types.ts";

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

async function searchDuckDuckGo(query: string, numResults: number): Promise<SearchResult[]> {
	const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		},
	});
	if (!response.ok) {
		throw new Error(`DuckDuckGo request failed with status: ${response.status}`);
	}
	const html = await response.text();

	const results: SearchResult[] = [];
	let currentResult: Partial<SearchResult> = {};
	let insideResult = false;
	let insideTitle = false;
	let insideSnippet = false;

	const parser = new htmlparser2.Parser({
		onopentag(name, attribs) {
			const className = attribs.class || "";
			if (name === "div" && className.split(" ").includes("result")) {
				if (insideResult && currentResult.title && currentResult.url) {
					results.push({
						title: currentResult.title.trim().replace(/\s+/g, " "),
						url: currentResult.url.trim(),
						snippet: (currentResult.snippet || "").trim().replace(/\s+/g, " "),
					});
				}
				insideResult = true;
				currentResult = { title: "", url: "", snippet: "" };
			} else if (insideResult) {
				if (name === "a" && className.includes("result__url")) {
					insideTitle = true;
					const href = attribs.href;
					if (href) {
						try {
							const urlObj = new URL(href, "https://html.duckduckgo.com");
							const uddg = urlObj.searchParams.get("uddg");
							currentResult.url = uddg ? decodeURIComponent(uddg) : href;
						} catch {
							currentResult.url = href;
						}
					}
				} else if (className.includes("result__snippet")) {
					insideSnippet = true;
				}
			}
		},
		ontext(text) {
			if (insideResult) {
				if (insideTitle) {
					currentResult.title = (currentResult.title || "") + text;
				} else if (insideSnippet) {
					currentResult.snippet = (currentResult.snippet || "") + text;
				}
			}
		},
		onclosetag(name) {
			if (insideResult) {
				if (name === "a") {
					insideTitle = false;
				}
				if (name === "span" || name === "a") {
					insideSnippet = false;
				}
			}
		},
	});

	parser.write(html);
	parser.end();

	if (insideResult && currentResult.title && currentResult.url) {
		results.push({
			title: currentResult.title.trim().replace(/\s+/g, " "),
			url: currentResult.url.trim(),
			snippet: (currentResult.snippet || "").trim().replace(/\s+/g, " "),
		});
	}

	return results.slice(0, numResults);
}

const webSearchParams = Type.Object({
	query: Type.String({ description: "The search query, e.g. 'TypeScript 5.0 release notes'" }),
	numResults: Type.Optional(
		Type.Number({ description: "Number of search results to return (default: 8)", default: 8 }),
	),
});

export const webSearchTool: ToolDefinition<typeof webSearchParams> = {
	name: "websearch",
	label: "Web Search",
	description: "Query the web using external search APIs or fallbacks and return the top search results.",
	parameters: webSearchParams,
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const query = params.query;
		const numResults = params.numResults || 8;

		// Ask consent in TUI if active
		if (ctx.hasUI) {
			const consented = await ctx.ui.confirm(
				"Web Search Consent",
				`Allow PoleStar to search the web for: "${query}"?`,
			);
			if (!consented) {
				throw new Error("Permission denied: Web search rejected by user.");
			}
		}

		let provider = "DuckDuckGo (Scraper)";
		let results: SearchResult[] = [];
		let errorMsg: string | undefined;

		try {
			if (process.env.TAVILY_API_KEY) {
				provider = "Tavily API";
				const response = await fetch("https://api.tavily.com/search", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query, max_results: numResults }),
				});
				if (response.ok) {
					const data = (await response.json()) as any;
					results = (data.results || []).map((r: any) => ({
						title: r.title || "Untitled",
						url: r.url || "",
						snippet: r.content || "",
					}));
				} else {
					throw new Error(`Tavily status ${response.status}`);
				}
			} else if (process.env.SERPER_API_KEY) {
				provider = "Serper Google API";
				const response = await fetch("https://google.serper.dev/search", {
					method: "POST",
					headers: {
						"X-API-KEY": process.env.SERPER_API_KEY,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ q: query, num: numResults }),
				});
				if (response.ok) {
					const data = (await response.json()) as any;
					results = (data.organic || []).map((r: any) => ({
						title: r.title || "Untitled",
						url: r.link || "",
						snippet: r.snippet || "",
					}));
				} else {
					throw new Error(`Serper status ${response.status}`);
				}
			} else if (process.env.EXA_API_KEY) {
				provider = "Exa Search API";
				const response = await fetch("https://api.exa.ai/search", {
					method: "POST",
					headers: {
						"x-api-key": process.env.EXA_API_KEY,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ query, numResults }),
				});
				if (response.ok) {
					const data = (await response.json()) as any;
					results = (data.results || []).map((r: any) => ({
						title: r.title || "Untitled",
						url: r.url || "",
						snippet: r.text || "",
					}));
				} else {
					throw new Error(`Exa status ${response.status}`);
				}
			} else {
				results = await searchDuckDuckGo(query, numResults);
			}
		} catch (err: any) {
			errorMsg = err.message || String(err);
			// Fallback to DuckDuckGo in case API caller failed
			try {
				provider = "DuckDuckGo (Scraper Fallback)";
				results = await searchDuckDuckGo(query, numResults);
				errorMsg = undefined;
			} catch (ddgErr: any) {
				throw new Error(
					`Web search failed across all providers. Main error: ${errorMsg}. Fallback error: ${ddgErr.message}`,
				);
			}
		}

		if (errorMsg) {
			throw new Error(`Web search failed: ${errorMsg}`);
		}

		// Format as a beautiful Markdown list
		let output = `### Search Results (via ${provider})\n\n`;
		if (results.length === 0) {
			output += "No results found.";
		} else {
			results.forEach((r, idx) => {
				output += `${idx + 1}. **[${r.title}](${r.url})**\n   ${r.snippet}\n\n`;
			});
		}

		return {
			content: [{ type: "text" as const, text: output.trim() }],
			details: {
				query,
				provider,
				resultsCount: results.length,
			},
		};
	},
};

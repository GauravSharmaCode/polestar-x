import * as htmlparser2 from "htmlparser2";
import TurndownService from "turndown";
import { Type } from "typebox";
import type { ToolDefinition } from "../../../coding-agent/src/core/extensions/types.ts";

const webFetchParams = Type.Object({
	url: Type.String({ description: "The URL to fetch content from" }),
	format: Type.Optional(
		Type.Union([Type.Literal("markdown"), Type.Literal("text"), Type.Literal("html")], {
			description: "The format to return the content in (text, markdown, or html). Defaults to markdown.",
			default: "markdown",
		}),
	),
});

export const webFetchTool: ToolDefinition<typeof webFetchParams> = {
	name: "webfetch",
	label: "Web Fetch",
	description: "Fetch contents of a web page and convert to markdown, text, or HTML.",
	parameters: webFetchParams,
	async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
		const format = params.format || "markdown";
		const url = params.url;

		if (!url.startsWith("http://") && !url.startsWith("https://")) {
			throw new Error("URL must start with http:// or https://");
		}

		// Consent step
		const domain = new URL(url).hostname;
		if (ctx.hasUI) {
			const consented = await ctx.ui.confirm(
				"Web Access Consent",
				`Allow PoleStar to fetch content from the external domain: ${domain}?`,
			);
			if (!consented) {
				throw new Error(`Permission denied: Fetching from ${domain} rejected by user.`);
			}
		}

		// Perform fetch
		const response = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept: "*/*",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch ${url}: HTTP status ${response.status} ${response.statusText}`);
		}

		const contentType = response.headers.get("content-type") || "";
		if (contentType.includes("image/") || contentType.includes("application/pdf")) {
			throw new Error(`Unsupported content type: ${contentType}`);
		}

		const rawHtml = await response.text();

		let resultText = "";
		if (format === "html") {
			resultText = rawHtml;
		} else if (format === "markdown") {
			const turndown = new TurndownService({
				headingStyle: "atx",
				codeBlockStyle: "fenced",
			});
			resultText = turndown.turndown(rawHtml);
		} else {
			// Extract plain text from HTML
			let text = "";
			const parser = new htmlparser2.Parser({
				ontext(data) {
					text += data;
				},
			});
			parser.write(rawHtml);
			parser.end();
			resultText = text.replace(/\s+/g, " ").trim();
		}

		// Enforce a sensible truncation limit to avoid overloading the context window
		const maxChars = 25000;
		const truncated = resultText.length > maxChars;
		if (truncated) {
			resultText = `${resultText.substring(0, maxChars)}\n\n...(Fetched content truncated due to size limit)...`;
		}

		return {
			content: [{ type: "text" as const, text: resultText }],
			details: {
				url,
				format,
				truncated,
			},
		};
	},
};

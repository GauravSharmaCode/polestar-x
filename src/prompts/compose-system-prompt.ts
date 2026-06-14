import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const POLESTAR_MARKER = "<!-- polestar-x-system-prompt -->";

const defaultPromptPath = join(dirname(fileURLToPath(import.meta.url)), "system.md");

export function resolvePolestarPromptPath(overridePath?: string): string {
	if (overridePath && existsSync(overridePath)) {
		return overridePath;
	}
	const envPath = process.env.POLESTAR_SYSTEM_PROMPT_PATH;
	if (envPath && existsSync(envPath)) {
		return envPath;
	}
	return defaultPromptPath;
}

export function loadPolestarPromptBlock(overridePath?: string): string | undefined {
	const path = resolvePolestarPromptPath(overridePath);
	if (!existsSync(path)) {
		return undefined;
	}
	const text = readFileSync(path, "utf-8").trim();
	return text.length > 0 ? text : undefined;
}

/** Remove inherited pi harness identity so PoleStar-X instructions are authoritative. */
export function stripHarnessPiIdentity(basePrompt: string): string {
	const prompt = basePrompt.replace(
		/^You are an expert coding assistant operating inside [^,]+, a coding agent harness\.[^\n]*\n\n/,
		"",
	);

	const marker = "Pi documentation";
	let start = prompt.indexOf(`\n\n${marker}`);
	if (start === -1 && prompt.startsWith(marker)) {
		start = 0;
	} else if (start === -1) {
		return prompt.trimStart();
	}

	const lines = prompt.slice(start === 0 ? 0 : start + 2).split("\n");
	let consumed = 0;
	for (const line of lines) {
		if (line.startsWith("Pi documentation") || line.startsWith("- ") || line.trim() === "") {
			consumed += line.length + 1;
			continue;
		}
		break;
	}

	if (start === 0) {
		return prompt.slice(consumed).trimStart();
	}
	return `${prompt.slice(0, start)}${prompt.slice(start + 2 + consumed)}`.trimStart();
}

/**
 * Prepend PoleStar sections above the dynamic harness prompt. Idempotent.
 */
export function composeSystemPrompt(basePrompt: string, overridePath?: string): string {
	if (basePrompt.includes(POLESTAR_MARKER)) {
		return basePrompt;
	}
	const block = loadPolestarPromptBlock(overridePath);
	if (!block) {
		return basePrompt;
	}
	const harnessPrompt = stripHarnessPiIdentity(basePrompt);
	return `${POLESTAR_MARKER}\n${block}\n\n${harnessPrompt}`;
}

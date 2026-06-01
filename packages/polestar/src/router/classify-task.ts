import type { TaskClass } from "./types.ts";

const PRIVACY_PATTERNS = [
	/\.env\b/i,
	/secret/i,
	/password/i,
	/api[_-]?key/i,
	/credential/i,
	/token/i,
	/private key/i,
	/ssn/i,
	/pii/i,
];

const ARCH_PATTERNS = [
	/architect/i,
	/design/i,
	/refactor plan/i,
	/roadmap/i,
	/migrate/i,
	/implement.*feature/i,
	/build.*system/i,
	/fix.*problems/i,
	/complete.*feature/i,
	/add.*capability/i,
	/orchestrate/i,
	/multi-agent/i,
	/extension/i,
	/integration/i,
	/pipeline/i,
];

const EXPLORATION_PATTERNS = [
	/find all/i,
	/search the repo/i,
	/where is/i,
	/grep/i,
	/across the codebase/i,
	/list all/i,
	/enumerate/i,
];

// Background tasks: very specific, low-priority changes
const BACKGROUND_PATTERNS = [/typo/i, /lint/i, /format/i, /minor/i];

export function classifyTask(prompt: string, preferLocal = false): TaskClass {
	if (preferLocal || PRIVACY_PATTERNS.some((p) => p.test(prompt))) {
		return "privacy_local";
	}
	if (ARCH_PATTERNS.some((p) => p.test(prompt))) {
		return "architecture";
	}
	if (EXPLORATION_PATTERNS.some((p) => p.test(prompt))) {
		return "exploration";
	}
	if (BACKGROUND_PATTERNS.some((p) => p.test(prompt))) {
		return "background";
	}
	// Multi-line prompts → architecture (safer default for complex tasks)
	if (prompt.includes("\n")) {
		return "architecture";
	}
	// Single-line prompts default to code_edit
	return "code_edit";
}

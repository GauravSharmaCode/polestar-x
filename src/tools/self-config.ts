import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface SkillScaffoldInput {
	name: string;
	description: string;
	body: string;
	skillsDir: string;
}

export function scaffoldSkill(input: SkillScaffoldInput): string {
	mkdirSync(input.skillsDir, { recursive: true });
	const dir = join(input.skillsDir, input.name);
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "SKILL.md");
	const content = `---
name: ${input.name}
description: ${input.description}
---

${input.body}
`;
	writeFileSync(path, content, "utf-8");
	return path;
}

export function appendRule(rulesPath: string, line: string): void {
	const prefix = line.endsWith("\n") ? line : `${line}\n`;
	writeFileSync(rulesPath, prefix, { flag: "a" });
}

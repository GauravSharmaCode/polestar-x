import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function getArtifactsDir(cwd: string): string {
	const dir = join(cwd, ".polestar", "artifacts");
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function writeArtifact(cwd: string, name: string, markdown: string): string {
	const path = join(getArtifactsDir(cwd), `${name}.md`);
	writeFileSync(path, markdown, "utf-8");
	return path;
}

export function readArtifact(cwd: string, name: string): string | undefined {
	const path = join(getArtifactsDir(cwd), `${name}.md`);
	try {
		return readFileSync(path, "utf-8");
	} catch {
		return undefined;
	}
}

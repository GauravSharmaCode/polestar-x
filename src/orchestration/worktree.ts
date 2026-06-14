import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface WorktreeSession {
	path: string;
	branch: string;
}

export function provisionWorktree(repoRoot: string, branchPrefix = "polestar"): WorktreeSession {
	const path = mkdtempSync(join(tmpdir(), "polestar-wt-"));
	const branch = `${branchPrefix}-${Date.now()}`;
	const result = spawnSync("git", ["worktree", "add", "-b", branch, path], {
		cwd: repoRoot,
		encoding: "utf-8",
	});
	if (result.status !== 0) {
		throw new Error(result.stderr || "git worktree add failed");
	}
	return { path, branch };
}

export function removeWorktree(repoRoot: string, session: WorktreeSession): void {
	spawnSync("git", ["worktree", "remove", "--force", session.path], { cwd: repoRoot });
	spawnSync("git", ["branch", "-D", session.branch], { cwd: repoRoot });
}

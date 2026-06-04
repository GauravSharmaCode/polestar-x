#!/usr/bin/env node
/**
 * Publish PoleStar-X and pi-coding-agent@0.78.1+ (/exit fix).
 *
 * Prerequisites: npm login (scopes @gauravsharmacode, @earendil-works)
 *
 * Usage: node scripts/publish-polestar.mjs [--dry-run]
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const publishArgs = dryRun
	? ["publish", "--dry-run", "--access", "public", "--ignore-scripts"]
	: ["publish", "--access", "public", "--ignore-scripts"];

function run(cwd, label) {
	console.log(`\n=== ${label} ===\n`);
	const result = spawnSync("npm", publishArgs, {
		cwd,
		encoding: "utf8",
		shell: process.platform === "win32",
		stdio: "inherit",
	});
	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}

run(join(root, "packages/coding-agent"), "@earendil-works/pi-coding-agent");
run(join(root, "packages/polestar"), "@gauravsharmacode/polestar-x");
console.log("\nDone.");

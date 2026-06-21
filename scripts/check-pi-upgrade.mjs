#!/usr/bin/env node
/**
 * Test a pi version upgrade in isolation — never commits.
 *
 * Usage: node scripts/check-pi-upgrade.mjs <new-version>
 * Example: node scripts/check-pi-upgrade.mjs 0.80.0
 *
 * Creates a temporary git worktree, pins the target pi version, runs
 * install → build → tests → import-check → smoke (Gates 1+4), then
 * removes the worktree. Gaurav decides whether to adopt the upgrade.
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PI_PACKAGES = [
	"@earendil-works/pi-agent-core",
	"@earendil-works/pi-ai",
	"@earendil-works/pi-coding-agent",
	"@earendil-works/pi-tui",
];

// --- pretty output ----------------------------------------------------------
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const ok   = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const info = (s) => console.log(`  \x1b[36m→\x1b[0m ${s}`);

function npm() {
	return process.platform === "win32" ? "npm.cmd" : "npm";
}

function run(command, args, { cwd = ROOT, env = {} } = {}) {
	console.log(`  $ ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32",
		env: { ...process.env, ...env },
	});
	if (result.status !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(" ")}`);
	}
}

// --- validate args ----------------------------------------------------------
const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+/.test(newVersion)) {
	console.error("Usage: node scripts/check-pi-upgrade.mjs <new-version>");
	console.error("Example: node scripts/check-pi-upgrade.mjs 0.80.0");
	process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const currentPiVersion = pkg.dependencies?.["@earendil-works/pi-coding-agent"] ?? "(unknown)";

console.log(bold(`\nPi upgrade probe: ${currentPiVersion} → ${newVersion}\n`));
console.log("Packages to pin:");
for (const p of PI_PACKAGES) {
	const cur = pkg.dependencies?.[p] ?? "?";
	info(`${p}  ${cur} → ${newVersion}`);
}
console.log();

// --- temp worktree ----------------------------------------------------------
const tmpBranch = `tmp/pi-upgrade-${newVersion}-${Date.now()}`;
const tmpPath = join(tmpdir(), `polestar-pi-upgrade-${Date.now()}`);
let worktreeCreated = false;
let failed = false;
let failReason = "";

try {
	console.log(bold("Setting up temp worktree…"));
	run("git", ["worktree", "add", "-b", tmpBranch, tmpPath, "HEAD"]);
	worktreeCreated = true;
	ok(`worktree at ${tmpPath}`);

	// Patch package.json in the worktree
	const wPkgPath = join(tmpPath, "package.json");
	const wPkg = JSON.parse(readFileSync(wPkgPath, "utf8"));
	let patched = 0;
	for (const p of PI_PACKAGES) {
		if (wPkg.dependencies?.[p]) {
			wPkg.dependencies[p] = newVersion;
			patched++;
		}
	}
	writeFileSync(wPkgPath, JSON.stringify(wPkg, null, "\t") + "\n");
	ok(`patched ${patched} pi deps → ${newVersion}`);

	// 1. Install
	console.log(bold("\n[1/5] Install…"));
	run(npm(), ["ci", "--ignore-scripts"], { cwd: tmpPath });
	ok("npm ci passed");

	// 2. Build
	console.log(bold("\n[2/5] Build…"));
	run(npm(), ["run", "build"], { cwd: tmpPath });
	ok("build passed");

	// 3. Unit tests
	console.log(bold("\n[3/5] Unit tests…"));
	run(npm(), ["test"], { cwd: tmpPath });
	ok("tests passed");

	// 4. Import dep check
	console.log(bold("\n[4/5] Import dep check…"));
	run("node", ["scripts/check-package-import-deps.mjs", "."], { cwd: tmpPath });
	ok("all runtime imports declared");

	// 5. Smoke — Gates 1+4 only (skip live provider + interactive for speed)
	console.log(bold("\n[5/5] Smoke (Gates 1+4 — provider and interactive skipped)…"));
	run("bash", ["scripts/smoke.sh"], {
		cwd: tmpPath,
		env: { SMOKE_ALLOW_PROVIDER_SKIP: "1", SMOKE_SKIP_INTERACTIVE: "1" },
	});
	ok("smoke passed");

} catch (err) {
	failed = true;
	failReason = err.message;
} finally {
	if (worktreeCreated) {
		try {
			execSync(`git worktree remove --force "${tmpPath.replace(/\\/g, "/")}"`, {
				cwd: ROOT,
				stdio: "pipe",
			});
			execSync(`git branch -D "${tmpBranch}"`, { cwd: ROOT, stdio: "pipe" });
			info("temp worktree removed");
		} catch {
			info(`cleanup may be incomplete — remove manually: git worktree remove --force "${tmpPath}"`);
		}
	}
}

// --- result -----------------------------------------------------------------
if (failed) {
	console.error(bold(`\n✗  Pi ${newVersion} FAILED.\n`));
	console.error(`   ${failReason}`);
	console.error("\n   Do not upgrade until the failure is understood.\n");
	process.exit(1);
}

console.log(bold(`\n✓  Pi ${newVersion} passed all checks.\n`));
console.log("To adopt:");
console.log(`  1. Update pi deps to ${newVersion} in package.json`);
console.log("  2. npm ci");
console.log("  3. Commit the package.json change\n");

#!/usr/bin/env node
/**
 * PoleStar-X release pipeline.
 *
 * Usage:
 *   node scripts/release.mjs [--bump patch|minor|major] [--dry-run]
 *
 * With no --bump, releases whatever version is in package.json as-is.
 * --dry-run runs every gate but skips the version bump, commit, tag, publish, and push.
 *
 * Pipeline (abort on first failure):
 *   1.  Working tree clean
 *   2.  npm ci --ignore-scripts
 *   3.  npm run build
 *   4.  vitest --run (unit tests)
 *   5.  scripts/check-package-import-deps.mjs
 *   6.  scripts/smoke.sh   (pack → global install → boot + deps + live + /init-config)
 *   7.  Version bump in package.json + CHANGELOG.md entry  [skipped with --dry-run]
 *   8.  git commit + tag                                    [skipped with --dry-run]
 *   9.  npm publish --access public                         [skipped with --dry-run]
 *  10.  git push --follow-tags                              [skipped with --dry-run]
 *  11.  Post-publish registry smoke: install from npm + boot check
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- CLI args ---------------------------------------------------------------
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const bumpIdx = argv.indexOf("--bump");
const bumpType = bumpIdx >= 0 ? argv[bumpIdx + 1] : null;

if (bumpType && !["patch", "minor", "major"].includes(bumpType)) {
	console.error('--bump must be patch, minor, or major');
	process.exit(1);
}

// --- helpers ----------------------------------------------------------------
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const ok   = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const step = (n, s) => console.log(bold(`\n[${n}] ${s}`));

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

function runCapture(command, args, cwd = ROOT) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		throw new Error(result.stderr?.trim() || `Command failed: ${command} ${args.join(" ")}`);
	}
	return result.stdout.trim();
}

function bumpVersion(version, type) {
	const [maj, min, pat] = version.split(".").map(Number);
	if (type === "major") return `${maj + 1}.0.0`;
	if (type === "minor") return `${maj}.${min + 1}.0`;
	if (type === "patch") return `${maj}.${min}.${pat + 1}`;
	throw new Error(`Unknown bump type: ${type}`);
}

function readPkg() {
	return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
}

function writePkg(pkg) {
	writeFileSync(join(ROOT, "package.json"), JSON.stringify(pkg, null, "\t") + "\n");
}

// --- pre-flight -------------------------------------------------------------
const pkg = readPkg();
const releaseVersion = bumpType ? bumpVersion(pkg.version, bumpType) : pkg.version;

console.log(bold(`\nPoleStar-X release pipeline`));
console.log(`  package:  ${pkg.name}`);
console.log(`  current:  ${pkg.version}`);
console.log(`  release:  ${releaseVersion}`);
if (dryRun) console.log(`  mode:     DRY RUN (no commit/publish)`);
console.log();

// 1. Working tree clean
step(1, "Working tree clean");
const dirty = runCapture("git", ["status", "--porcelain"]);
if (dirty) {
	throw new Error(`Working tree is dirty — commit or stash first:\n${dirty}`);
}
ok("clean");

// 2. Install
step(2, "npm ci --ignore-scripts");
run(npm(), ["ci", "--ignore-scripts"]);
ok("deps installed");

// 3. Build
step(3, "npm run build");
run(npm(), ["run", "build"]);
ok("build clean");

// 4. Unit tests
step(4, "vitest --run");
run(npm(), ["test"]);
ok("all tests passed");

// 5. Import dep check
step(5, "import dep check");
run("node", ["scripts/check-package-import-deps.mjs", "."], { cwd: ROOT });
ok("all runtime imports declared");

// 6. Pre-publish smoke (pack → global install → boot + deps + provider + /init-config)
step(6, "smoke.sh (pre-publish local install)");
run("bash", ["scripts/smoke.sh"], { cwd: ROOT });
ok("smoke passed");

if (dryRun) {
	console.log(bold("\n  Dry run complete. All pre-publish gates passed."));
	console.log("  Re-run without --dry-run to publish.\n");
	process.exit(0);
}

// 7. Version bump
step(7, `version bump${bumpType ? ` (${bumpType}: ${pkg.version} → ${releaseVersion})` : " (none)"}`);
if (bumpType) {
	const p = readPkg();
	p.version = releaseVersion;
	writePkg(p);
	ok(`package.json version → ${releaseVersion}`);

	const changelogPath = join(ROOT, "CHANGELOG.md");
	const today = new Date().toISOString().slice(0, 10);
	const existing = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "";
	const entry = `## ${releaseVersion} (${today})\n\n_Add release notes here before tagging._\n\n`;
	writeFileSync(changelogPath, entry + existing);
	ok(`CHANGELOG.md prepended ${releaseVersion} entry`);
} else {
	ok(`keeping version ${releaseVersion}`);
}

// 8. Commit + tag
step(8, "git commit + tag");
run("git", ["add", "package.json", "CHANGELOG.md"]);
run("git", ["commit", "-m", `chore(release): v${releaseVersion}`]);
run("git", ["tag", `v${releaseVersion}`]);
ok(`tagged v${releaseVersion}`);

// 9. Publish
step(9, "npm publish");
run(npm(), ["publish", "--access", "public"]);
ok(`published ${pkg.name}@${releaseVersion}`);

// 10. Push
step(10, "git push --follow-tags");
run("git", ["push", "--follow-tags"]);
ok("pushed branch + tag");

// 11. Post-publish registry smoke
//     Install from the real registry and verify the artifact boots.
//     This is the gate 0.1.0 was missing: local pack != what npm ships.
step(11, "post-publish registry smoke");
console.log("  Installing from npm registry…");

run(npm(), ["install", "-g", "--ignore-scripts", `${pkg.name}@${releaseVersion}`]);

const npmGlobalPrefix = runCapture(npm(), ["prefix", "-g"]);
const binPath = process.platform === "win32"
	? join(npmGlobalPrefix, "polestar.cmd")
	: join(npmGlobalPrefix, "bin", "polestar");

const versionOut = spawnSync(binPath, ["--version"], { encoding: "utf8" });
if (versionOut.status !== 0) {
	throw new Error("Registry install failed --version check");
}
ok(`--version: ${versionOut.stdout.trim()}`);

const modelsOut = spawnSync(binPath, ["--list-models"], { encoding: "utf8" });
if (modelsOut.status !== 0) {
	throw new Error("Registry install failed --list-models (provider catalog broken)");
}
ok("--list-models clean");

run(npm(), ["uninstall", "-g", pkg.name]);
ok("registry global cleaned up");

// --- done -------------------------------------------------------------------
console.log(bold(`\n  Release ${releaseVersion} complete.\n`));
console.log(`  npm:  https://www.npmjs.com/package/${pkg.name}`);
console.log(`  tag:  v${releaseVersion}\n`);

#!/usr/bin/env node
/**
 * Publish PoleStar-X to npm.
 *
 * Prerequisites: npm login (scope @gauravsharmacode)
 *
 * Usage: node scripts/publish-polestar.mjs [--dry-run]
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

function commandForPlatform(command) {
	if (process.platform !== "win32") {
		return command;
	}
	if (command === "npm" || command === "npx") {
		return `${command}.cmd`;
	}
	return command;
}

function run(command, args, options = {}) {
	console.log(`$ ${[command, ...args].join(" ")}`);
	const result = spawnSync(commandForPlatform(command), args, {
		cwd: options.cwd ?? root,
		encoding: "utf8",
		shell: process.platform === "win32",
		stdio: options.capture ? ["inherit", "pipe", "pipe"] : "inherit",
	});

	if (result.status !== 0) {
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
		throw new Error(output ? `Command failed: ${command} ${args.join(" ")}\n${output}` : `Command failed: ${command} ${args.join(" ")}`);
	}

	return result;
}

function readPackageJson() {
	return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

function assertBuildOutputExists() {
	if (!existsSync(join(root, "dist"))) {
		throw new Error("dist/ does not exist. Run npm run build first.");
	}
}

function validatePack() {
	const result = run("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], { capture: true });
	const packed = JSON.parse(result.stdout)[0];
	console.log(`  ${packed.filename}: ${packed.files.length} files, ${packed.size} bytes packed, ${packed.unpackedSize} bytes unpacked`);
}

function validateImportDependencies() {
	run("node", [join(root, "scripts/check-package-import-deps.mjs"), root]);
}

function isPublished(name, version) {
	const result = spawnSync(commandForPlatform("npm"), ["view", `${name}@${version}`, "version", "--json"], {
		encoding: "utf8",
		shell: process.platform === "win32",
		stdio: ["inherit", "pipe", "pipe"],
	});

	if (result.status === 0 && result.stdout.trim()) {
		return true;
	}

	const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
	if (result.status !== 0 && (output.includes("E404") || output.includes("404 Not Found"))) {
		return false;
	}

	throw new Error(output ? `Failed to query ${name}@${version}\n${output}` : `Failed to query ${name}@${version}`);
}

const packageJson = readPackageJson();
const name = packageJson.name;
const version = packageJson.version;

console.log(`Publishing ${name}@${version}${dryRun ? " (dry run)" : ""}\n`);

assertBuildOutputExists();

const published = isPublished(name, version);

if (dryRun) {
	if (published) {
		console.log(`${name}@${version} is already published; validating package contents only.`);
	} else {
		console.log(`${name}@${version} is not published; validating package contents before publish.`);
	}
	validateImportDependencies();
	validatePack();
	console.log("\nDry run complete.");
	process.exit(0);
}

if (published) {
	console.log(`Skipping: ${name}@${version} is already published.`);
	process.exit(0);
}

// Build, validate, publish
run("npm", ["run", "clean"]);
run("npm", ["run", "build"]);
validateImportDependencies();
run("npm", ["publish", "--access", "public"]);

console.log(`\nPublished ${name}@${version} successfully.`);
console.log(`Verify: npm view ${name}@${version} dependencies`);

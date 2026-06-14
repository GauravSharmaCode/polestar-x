#!/usr/bin/env node
/**
 * Publish PoleStar-X (and pi-coding-agent when a new patch is needed).
 *
 * Prerequisites: npm login (scopes @gauravsharmacode, @earendil-works)
 *
 * Usage: node scripts/publish-polestar.mjs [--dry-run]
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

const packages = [
	{ directory: join(root, "packages/coding-agent"), name: "@earendil-works/pi-coding-agent" },
	{ directory: join(root, "packages/polestar"), name: "@gauravsharmacode/polestar-x" },
];

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
		cwd: options.cwd,
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

function readPackageJson(directory) {
	return JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
}

function assertBuildOutputExists(directory) {
	if (!existsSync(join(directory, "dist"))) {
		throw new Error(`${directory}/dist does not exist. Run npm run build in that package first.`);
	}
}

function validatePack(directory) {
	const result = run("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], { capture: true, cwd: directory });
	const packed = JSON.parse(result.stdout)[0];
	console.log(`  ${packed.filename}: ${packed.files.length} files, ${packed.size} bytes packed, ${packed.unpackedSize} bytes unpacked`);
}

function validateImportDependencies(directory) {
	run("node", [join(root, "scripts/check-package-import-deps.mjs"), directory]);
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

console.log(`Publishing PoleStar-X release${dryRun ? " (dry run)" : ""}\n`);

for (const pkg of packages) {
	const packageJson = readPackageJson(pkg.directory);
	const version = packageJson.version;

	console.log(`=== ${pkg.name}@${version} ===\n`);
	assertBuildOutputExists(pkg.directory);

	const published = isPublished(pkg.name, version);

	if (dryRun) {
		if (published) {
			console.log(`${pkg.name}@${version} is already published; validating package contents only.`);
		} else {
			console.log(`${pkg.name}@${version} is not published; validating package contents before publish.`);
		}
		validateImportDependencies(pkg.directory);
		validatePack(pkg.directory);
		console.log();
		continue;
	}

	if (published) {
		console.log(`Skipping ${pkg.name}@${version}: already published\n`);
		continue;
	}

	validateImportDependencies(pkg.directory);
	run("npm", ["publish", "--access", "public", "--ignore-scripts"], { cwd: pkg.directory });
	console.log();
}

console.log("Done.");

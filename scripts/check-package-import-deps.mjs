#!/usr/bin/env node
/**
 * Ensure every external package imported by built dist/*.js files is declared
 * in the package's runtime dependencies (dependencies + optionalDependencies).
 *
 * Usage: node scripts/check-package-import-deps.mjs <package-directory>
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageDirectory = process.argv[2];

if (!packageDirectory) {
	console.error("Usage: node scripts/check-package-import-deps.mjs <package-directory>");
	process.exit(1);
}

const distDirectory = join(packageDirectory, "dist");
const packageJsonPath = join(packageDirectory, "package.json");

if (!existsSync(distDirectory)) {
	console.error(`${distDirectory} does not exist. Build the package first.`);
	process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const declaredDependencies = new Set([
	...Object.keys(packageJson.dependencies ?? {}),
	...Object.keys(packageJson.optionalDependencies ?? {}),
]);

const nodeBuiltins = new Set([
	"assert",
	"async_hooks",
	"buffer",
	"child_process",
	"cluster",
	"console",
	"constants",
	"crypto",
	"dgram",
	"diagnostics_channel",
	"dns",
	"domain",
	"events",
	"fs",
	"http",
	"http2",
	"https",
	"inspector",
	"module",
	"net",
	"os",
	"path",
	"perf_hooks",
	"process",
	"punycode",
	"querystring",
	"readline",
	"repl",
	"stream",
	"string_decoder",
	"sys",
	"timers",
	"tls",
	"trace_events",
	"tty",
	"url",
	"util",
	"v8",
	"vm",
	"wasi",
	"worker_threads",
	"zlib",
]);

// Vendored pi assets (copied into dist/ by scripts/vendor-pi-assets.mjs). These
// are pi's own bundled runtime files (theme modules, the HTML export template +
// its vendored libs); their imports resolve within pi's package, not polestar's
// dependency manifest, so they must not be scanned here. Keep in sync with
// scripts/vendor-pi-assets.mjs.
const vendoredAssetDirs = [
	join("modes", "interactive", "theme"),
	join("modes", "interactive", "assets"),
	join("core", "export-html"),
];

function isVendoredPath(filePath) {
	return vendoredAssetDirs.some((vendored) => filePath.includes(`${join(distDirectory, vendored)}`));
}

function walkJavaScriptFiles(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const filePath = join(directory, entry.name);
		if (entry.isDirectory()) {
			if (isVendoredPath(filePath)) {
				continue;
			}
			files.push(...walkJavaScriptFiles(filePath));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".js")) {
			files.push(filePath);
		}
	}
	return files;
}

function extractImportSpecifiers(source) {
	const specifiers = new Set();
	const patterns = [
		/(?:^|\n)\s*import\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
		/(?:^|\n)\s*export\s+(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g,
		/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
	];

	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) {
			specifiers.add(match[1]);
		}
	}

	return specifiers;
}

function packageNameFromSpecifier(specifier) {
	if (specifier.startsWith("node:")) {
		return null;
	}
	if (specifier.startsWith(".") || specifier.startsWith("/")) {
		return null;
	}
	if (specifier.startsWith("@")) {
		const [scope, name] = specifier.split("/");
		return name ? `${scope}/${name}` : null;
	}
	return specifier.split("/")[0];
}

const importedPackages = new Set();

for (const file of walkJavaScriptFiles(distDirectory)) {
	const source = readFileSync(file, "utf8");
	for (const specifier of extractImportSpecifiers(source)) {
		const packageName = packageNameFromSpecifier(specifier);
		if (!packageName || nodeBuiltins.has(packageName)) {
			continue;
		}
		importedPackages.add(packageName);
	}
}

const missing = [...importedPackages].filter((name) => !declaredDependencies.has(name)).sort();

if (missing.length > 0) {
	console.error(`${packageJson.name}: missing runtime dependencies for direct imports:`);
	for (const name of missing) {
		console.error(`  - ${name}`);
	}
	process.exit(1);
}

console.log(`${packageJson.name}: all ${importedPackages.size} imported runtime packages are declared in dependencies.`);

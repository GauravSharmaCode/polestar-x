#!/usr/bin/env node
/**
 * Vendor pi's bundled runtime assets into polestar's dist/.
 *
 * PoleStar-X runs as a sovereign app: cli.ts points pi at polestar's package
 * root (PI_PACKAGE_DIR) so pi reads polestar's package.json + CHANGELOG for its
 * identity. pi also resolves bundled assets (themes, the HTML export template,
 * interactive assets) relative to that same root, so those files must exist
 * under polestar's dist/. This script copies them from the installed pi package
 * after the TypeScript build.
 *
 * Run as part of `npm run build`.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const piDist = join(root, "node_modules", "@earendil-works", "pi-coding-agent", "dist");
const outDist = join(root, "dist");

if (!existsSync(piDist)) {
	console.error(`vendor-pi-assets: pi package not found at ${piDist} — run npm ci first.`);
	process.exit(1);
}

// [relative path under dist/, boot-critical?]
const assetDirs = [
	["modes/interactive/theme", true], // dark.json/light.json read by initTheme at startup
	["modes/interactive/assets", false], // clankolas.png (optional, pi loads in try/catch)
	["core/export-html", false], // template.{html,css,js} + vendor/*.min.js for /export
];

for (const [rel, critical] of assetDirs) {
	const from = join(piDist, rel);
	if (!existsSync(from)) {
		if (critical) {
			console.error(`vendor-pi-assets: MISSING boot-critical asset dir ${from}`);
			process.exit(1);
		}
		console.warn(`vendor-pi-assets: skipping missing ${rel}`);
		continue;
	}

	// Copy to dist/
	const toDist = join(root, "dist", rel);
	mkdirSync(dirname(toDist), { recursive: true });
	cpSync(from, toDist, { recursive: true });
	console.log(`vendor-pi-assets: vendored to dist/${rel}`);

	// Mirror to src/ for source-checkout runs (avoids identity mismatch in dev)
	const toSrc = join(root, "src", rel);
	mkdirSync(dirname(toSrc), { recursive: true });
	cpSync(from, toSrc, { recursive: true });
	console.log(`vendor-pi-assets: vendored to src/${rel}`);
}

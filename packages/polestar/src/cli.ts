#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * PoleStar-X CLI entry. Sets app package identity, then runs the inherited coding-agent runtime.
 */
import { main } from "@earendil-works/pi-coding-agent";
import { polestarCoreExtension } from "./extension/polestar-core.ts";

const polestarPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
process.env.POLESTAR_APP_PACKAGE_DIR = polestarPackageRoot;
process.title = "polestar";
process.env.POLESTAR_X = "true";

await main(process.argv.slice(2), {
	extensionFactories: [polestarCoreExtension],
});

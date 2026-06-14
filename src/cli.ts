#!/usr/bin/env node
import { main } from "@earendil-works/pi-coding-agent";
import { polestarCoreExtension } from "./extension/polestar-core.ts";

process.title = "polestar";

await main(process.argv.slice(2), {
	extensionFactories: [polestarCoreExtension],
});

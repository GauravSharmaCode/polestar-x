#!/usr/bin/env node
// bootstrap MUST be imported before pi-coding-agent: it sets PI_PACKAGE_DIR,
// which pi reads at module-evaluation time. ES imports evaluate in source order.
import "./bootstrap.ts";
import { main } from "@earendil-works/pi-coding-agent";
import { polestarCoreExtension } from "./extension/polestar-core.ts";

await main(process.argv.slice(2), {
	extensionFactories: [polestarCoreExtension],
});

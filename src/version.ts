import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Package version from package.json (e.g. "0.2.0"). */
export const VERSION: string = require("../package.json").version;

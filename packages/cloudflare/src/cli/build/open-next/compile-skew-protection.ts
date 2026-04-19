import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";

import type { OpenNextConfig } from "../../../api/index.js";

interface SkewProtectionDefines extends Record<string, string> {
	__SKEW_PROTECTION_ENABLED__: string;
}

export async function compileSkewProtection(options: BuildOptions, config: OpenNextConfig): Promise<void> {
	const initPath = path.join(import.meta.dirname, "../../templates/skew-protection.js");

	const skewProtectionEnabled = config.cloudflare?.skewProtection?.enabled === true;

	const define: SkewProtectionDefines = {
		__SKEW_PROTECTION_ENABLED__: JSON.stringify(skewProtectionEnabled),
	};

	await build({
		entryPoints: [initPath],
		outdir: path.join(options.outputDir, "cloudflare"),
		bundle: false,
		minify: false,
		format: "esm",
		target: "esnext",
		platform: "node",
		define,
	});
}

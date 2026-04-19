import path from "node:path";

import { loadConfig } from "@opennextjs/aws/adapters/config/util.js";
import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { build } from "esbuild";
import type { Unstable_Config } from "wrangler";

interface InitDefines extends Record<string, string> {
	__BUILD_TIMESTAMP_MS__: string;
	__NEXT_BASE_PATH__: string;
	__ASSETS_RUN_WORKER_FIRST__: string;
	__DEPLOYMENT_ID__: string;
	__TRAILING_SLASH__: string;
}

/**
 * Compiles the initialization code for the workerd runtime
 */
export async function compileInit(options: BuildOptions, wranglerConfig: Unstable_Config): Promise<void> {
	const initPath = path.join(import.meta.dirname, "../../templates/init.js");

	const nextConfig = loadConfig(path.join(options.appBuildOutputPath, ".next"));
	const basePath = nextConfig.basePath ?? "";
	const deploymentId = nextConfig.deploymentId ?? "";
	const trailingSlash = nextConfig.trailingSlash ?? false;

	const define: InitDefines = {
		__BUILD_TIMESTAMP_MS__: JSON.stringify(Date.now()),
		__NEXT_BASE_PATH__: JSON.stringify(basePath),
		__ASSETS_RUN_WORKER_FIRST__: JSON.stringify(wranglerConfig.assets?.run_worker_first ?? false),
		__DEPLOYMENT_ID__: JSON.stringify(deploymentId),
		__TRAILING_SLASH__: JSON.stringify(trailingSlash),
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

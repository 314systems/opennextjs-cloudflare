import path from "node:path";

import { loadFunctionsConfigManifest, loadMiddlewareManifest } from "@opennextjs/aws/adapters/config/util.js";
import * as buildHelper from "@opennextjs/aws/build/helper.js";

type MiddlewareRuntime = "edge" | "node" | "none";

/**
 * Detect which middleware runtime is configured by the compiled Next.js output.
 */
export function detectMiddlewareRuntime(options: buildHelper.BuildOptions): MiddlewareRuntime {
	const buildOutputDotNextDir = path.join(options.appBuildOutputPath, ".next");

	const middlewareManifest = loadMiddlewareManifest(buildOutputDotNextDir);
	const hasEdgeMiddleware = Object.keys(middlewareManifest.middleware ?? {}).length > 0;
	if (hasEdgeMiddleware) {
		return "edge";
	}

	const functionsConfigManifest = loadFunctionsConfigManifest(buildOutputDotNextDir);
	const hasNodeMiddleware = Boolean(functionsConfigManifest?.functions["/_middleware"]);
	if (hasNodeMiddleware) {
		return "node";
	}

	return "none";
}

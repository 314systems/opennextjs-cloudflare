import { copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

import { getOutputWorkerPath } from "../bundle-server.js";

/**
 * Copies
 * - the template files present in the cloudflare adapter package to `.open-next/cloudflare-templates`
 * - `worker.js` to `.open-next/`
 */
export async function copyPackageCliFiles(packageDistDir: string, buildOpts: BuildOptions): Promise<void> {
	console.log("# copyPackageTemplateFiles");
	const sourceDir = path.join(packageDistDir, "cli/templates");

	const destinationDir = path.join(buildOpts.outputDir, "cloudflare-templates");

	await mkdir(destinationDir, { recursive: true });
	await cp(sourceDir, destinationDir, { recursive: true });

	await copyFile(path.join(packageDistDir, "cli/templates/worker.js"), getOutputWorkerPath(buildOpts));
}

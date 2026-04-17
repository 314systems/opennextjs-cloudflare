import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { BuildOptions } from "@opennextjs/aws/build/helper.js";

import { extractProjectEnvVars } from "../../utils/extract-project-env-vars.js";

/**
 * Compiles the values extracted from the project's env files to the output directory for use in the worker.
 */
export async function compileEnvFiles(buildOpts: BuildOptions): Promise<void> {
	const envDir = path.join(buildOpts.outputDir, "cloudflare");
	await mkdir(envDir, { recursive: true });
	["production", "development", "test"].forEach(
		async (mode) =>
			await appendFile(
				path.join(envDir, `next-env.mjs`),
				`export const ${mode} = ${JSON.stringify(extractProjectEnvVars(mode, buildOpts))};\n`
			)
	);
}

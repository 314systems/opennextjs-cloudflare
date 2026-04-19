import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";

import { extractProjectEnvVars } from "../../utils/extract-project-env-vars.js";

type EnvMode = "production" | "development" | "test";

const ENV_MODES: EnvMode[] = ["production", "development", "test"];

/**
 * Compiles the values extracted from the project's env files to the output directory for use in the worker.
 */
export async function compileEnvFiles(buildOpts: BuildOptions): Promise<void> {
	const envDir = path.join(buildOpts.outputDir, "cloudflare");
	const envFilePath = path.join(envDir, "next-env.mjs");
	const fileContent =
		ENV_MODES.map(
			(mode) => `export const ${mode} = ${JSON.stringify(extractProjectEnvVars(mode, buildOpts))};`
		).join("\n") + "\n";

	await mkdir(envDir, { recursive: true });
	await writeFile(envFilePath, fileContent);
}

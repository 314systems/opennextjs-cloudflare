import logger from "@opennextjs/aws/logger.js";
import type { Argv } from "yargs";

import { populateCache, withPopulateCacheOptions } from "./populate-cache.js";
import { getEnvFromPlatformProxy } from "./utils/helpers.js";
import { runWrangler } from "./utils/run-wrangler.js";
import type { WithWranglerArgs } from "./utils/utils.js";
import {
	getNormalizedOptions,
	printHeaders,
	readWranglerConfig,
	retrieveCompiledConfig,
	withWranglerPassthroughArgs,
} from "./utils/utils.js";

/**
 * Implementation of the `opennextjs-cloudflare preview` command.
 *
 * @param args
 */
export async function previewCommand(
	args: WithWranglerArgs<{ cacheChunkSize?: number | undefined; remote: boolean }>
): Promise<void> {
	printHeaders("preview");

	const { config } = await retrieveCompiledConfig();
	const buildOpts = getNormalizedOptions(config);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const wranglerConfig = await readWranglerConfig(args);
	const envVars = await getEnvFromPlatformProxy(
		{
			...(args.wranglerConfigPath !== undefined ? { configPath: args.wranglerConfigPath } : {}),
			...(args.env !== undefined ? { environment: args.env } : {}),
		},
		buildOpts
	);

	await populateCache(
		buildOpts,
		config,
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		wranglerConfig,
		{
			target: args.remote ? "remote" : "local",
			...(args.env !== undefined ? { environment: args.env } : {}),
			...(args.wranglerConfigPath !== undefined ? { wranglerConfigPath: args.wranglerConfigPath } : {}),
			...(args.cacheChunkSize !== undefined ? { cacheChunkSize: args.cacheChunkSize } : {}),
			shouldUsePreviewId: args.remote,
		},
		envVars
	);

	const result = await runWrangler(buildOpts, ["dev", ...args.wranglerArgs], { logging: "all" });

	if (!result.success) {
		logger.error(`Wrangler dev command failed${result.stderr ? `:\n${result.stderr}` : ""}`);
		process.exit(1);
	}
}

/**
 * Add the `preview` command to yargs configuration.
 *
 * Consumes 1 positional parameter.
 */
export function addPreviewCommand<T>(y: Argv<T>): Argv<T> {
	return y.command(
		"preview [args..]",
		"Preview a built OpenNext app with a Wrangler dev server",
		(c) =>
			withPopulateCacheOptions(c).option("remote", {
				type: "boolean",
				alias: "r",
				default: false,
				desc: "Run on the global Cloudflare network with access to production resources",
			}),
		(args) => previewCommand(withWranglerPassthroughArgs(args))
	);
}

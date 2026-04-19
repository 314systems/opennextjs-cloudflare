import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { type CommentObject, parse, stringify } from "comment-json";

import { getPackageTemplatesDirPath } from "../../utils/get-package-templates-dir-path.js";
import { ensureR2Bucket } from "./ensure-r2-bucket.js";

/**
 * Gets the path to the Wrangler configuration file if it exists.
 *
 * @param appDir The directory to check for the Wrangler config file
 * @returns The path to Wrangler config file if it exists, undefined otherwise
 */
export function findWranglerConfig(appDir: string): string | undefined {
	return ["toml", "json", "jsonc"].map((ext) => join(appDir, `wrangler.${ext}`)).find(existsSync);
}

/**
 * Creates a wrangler.jsonc config file in the target directory for the project.
 *
 * If a wrangler.jsonc file already exists it will be overridden.
 *
 * The function attempts to create an R2 bucket for incremental cache. If bucket creation
 * fails (e.g., user not authenticated or R2 not enabled), a configuration without caching
 * will be created instead.
 *
 * @param projectDir The target directory for the project
 * @param defaultCompatDate The default YYYY-MM-DD compatibility date to use in the config (used if fetching the latest workerd version date fails)
 * @returns An object containing a `cachingEnabled` which indicates whether caching has been set up during the wrangler
 *          config file creation or not
 */
export async function createWranglerConfigFile(
	projectDir: string,
	defaultCompatDate = "2026-02-01"
): Promise<{ cachingEnabled: boolean }> {
	const workerName = await getWorkerName(projectDir);
	const compatibilityDate = (await getLatestCompatDate()) ?? defaultCompatDate;

	const wranglerConfigStr = await readFile(join(getPackageTemplatesDirPath(), "wrangler.jsonc"), "utf8")
		.then((str) => str.replaceAll("<WORKER_NAME>", workerName))
		.then((str) => str.replaceAll("<COMPATIBILITY_DATE>", compatibilityDate));

	const wranglerConfig = parse(wranglerConfigStr) as CommentObject;

	assert(Array.isArray(wranglerConfig.r2_buckets));
	assert(wranglerConfig.r2_buckets[0] != null && typeof wranglerConfig.r2_buckets[0] === "object");
	assert(
		"bucket_name" in wranglerConfig.r2_buckets[0] &&
			typeof wranglerConfig.r2_buckets[0].bucket_name === "string"
	);

	const bucketName = wranglerConfig.r2_buckets[0].bucket_name;
	const { success: cachingEnabled } = await ensureR2Bucket(projectDir, bucketName);

	if (!cachingEnabled) {
		delete wranglerConfig.r2_buckets;
	}

	await writeFile(join(projectDir, "wrangler.jsonc"), stringify(wranglerConfig, null, "\t"));

	return { cachingEnabled };
}

/**
 * Gets a valid worker name from the project's package.json name, falling back to `app-name`
 * in case the name could not be detected.
 *
 * @param projectDir The project directory containing the package.json file
 * @returns A valid worker name suitable for a Cloudflare Worker
 */
async function getWorkerName(projectDir: string): Promise<string> {
	const appName = (await getNameFromPackageJson(projectDir)) ?? "app-name";

	return (
		appName
			.toLowerCase()
			// Remove org prefix if present (e.g., "@org/my-app" -> "my-app")
			.replace(/^@[^/]+\//, "")
			.replaceAll("_", "-")
			.replace(/[^a-z0-9-]/g, "")
	);
}

/**
 * Reads the `name` field from the `package.json` in the given directory.
 *
 * @param sourceDir - The directory containing the `package.json` file.
 * @returns The package name if found, `undefined` otherwise.
 */
async function getNameFromPackageJson(sourceDir: string): Promise<string | undefined> {
	try {
		const packageJsonStr = await readFile(join(sourceDir, "package.json"), "utf8");
		const parsed: unknown = JSON.parse(packageJsonStr);
		const name = (parsed as Record<string, unknown>).name;
		if (typeof name === "string") return name;
	} catch {
		/* empty */
	}
	return undefined;
}

/**
 * Fetches the latest compatibility date from the npm registry based on the latest `workerd` version.
 *
 * The workerd version format is `major.yyyymmdd.patch`. The date portion is extracted and formatted
 * as `YYYY-MM-DD`. If the extracted date is in the future, today's date is returned instead.
 *
 * @returns The compatibility date as a `YYYY-MM-DD` string, or `undefined` if the fetch or parsing fails.
 */
async function getLatestCompatDate(): Promise<string | undefined> {
	try {
		const resp = await fetch("https://registry.npmjs.org/workerd");
		const body: { "dist-tags": { latest: string } } = await resp.json();
		const latestWorkerdVersion = body["dist-tags"].latest;

		// The format of the workerd version is `major.yyyymmdd.patch`.
		const match = /\d+\.(\d{4})(\d{2})(\d{2})\.\d+/.exec(latestWorkerdVersion);

		if (match) {
			const [, year, month, day] = match;
			if (year == undefined || month == undefined || day == undefined) {
				throw new Error("Failed to parse workerd version for compatibility date");
			}
			const compatDate = `${year}-${month}-${day}`;

			const currentDate = new Date().toISOString().slice(0, 10);

			return compatDate < currentDate ? compatDate : currentDate;
		}
	} catch {
		/* empty */
	}
	return undefined;
}

/** Name of the env var containing the mapping */
export const DEPLOYMENT_MAPPING_ENV_NAME = "CF_DEPLOYMENT_MAPPING";
/** Version used for the latest worker */
export const CURRENT_VERSION_ID = "current";

let deploymentMapping: Record<string, string> | undefined;

/**
 * Routes the request to the requested deployment.
 *
 * A specific deployment can be requested via:
 * - the `dpl` search parameter for assets
 * - the `x-deployment-id` for other requests
 *
 * When a specific deployment is requested, we route to that deployment via the preview URLs.
 * See https://developers.cloudflare.com/workers/configuration/previews/
 *
 * When the requested deployment is not supported a 400 response is returned.
 *
 * Notes:
 * - The re-routing is only active for the deployed version of the app (on a custom domain)
 * - Assets are also handled when `run_worker_first` is enabled.
 *   See https://developers.cloudflare.com/workers/static-assets/binding/#run_worker_first
 *
 * @param request
 * @returns
 */
export async function maybeGetSkewProtectionResponse(request: Request): Promise<Response | undefined> {
	// no early return as esbuild would not treeshake the code.
	if (__SKEW_PROTECTION_ENABLED__) {
		const url = new URL(request.url);

		// Skew protection is only active for the latest version of the app served on a custom domain.
		if (url.hostname === "localhost" || url.hostname.endsWith(".workers.dev")) {
			return undefined;
		}

		const deploymentIdHeader: string | null = request.headers.get("x-deployment-id");
		const requestDeploymentId = deploymentIdHeader ?? url.searchParams.get("dpl");

		if (!requestDeploymentId || requestDeploymentId === process.env.DEPLOYMENT_ID) {
			// The request does not specify a deployment id or it is the current deployment id
			return undefined;
		}

		const deploymentMappingEnv = process.env[DEPLOYMENT_MAPPING_ENV_NAME];
		const mapping = (deploymentMapping ??= deploymentMappingEnv
			? (JSON.parse(deploymentMappingEnv) as unknown as Record<string, string>)
			: {});

		if (!(requestDeploymentId in mapping)) {
			// Unknown deployment id, serve the current version
			return undefined;
		}

		const version = mapping[requestDeploymentId];

		if (!version || version === CURRENT_VERSION_ID) {
			return undefined;
		}

		const versionDomain = version.split("-")[0];
		if (
			versionDomain === undefined ||
			process.env.CF_WORKER_NAME === undefined ||
			process.env.CF_PREVIEW_DOMAIN === undefined
		) {
			// Invalid version format, serve the current version
			return undefined;
		}
		const hostname = `${versionDomain}-${process.env.CF_WORKER_NAME}.${process.env.CF_PREVIEW_DOMAIN}.workers.dev`;
		url.hostname = hostname;

		// Remove the origin header to prevent an error with POST requests
		const headers = new Headers(request.headers);
		headers.delete("origin");

		const response = await fetch(url, {
			body: request.body,
			headers,
			method: request.method,
			redirect: request.redirect,
			signal: request.signal,
		});

		return response;
	}
	return undefined;
}

declare global {
	// Replaced at build time with the value from Open Next config
	var __SKEW_PROTECTION_ENABLED__: boolean;
}

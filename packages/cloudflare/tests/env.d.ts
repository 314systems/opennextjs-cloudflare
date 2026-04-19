import type {} from "../src/api/cloudflare-context.js";

declare global {
	var __BUILD_TIMESTAMP_MS__: number;
}

declare module "cloudflare:workers" {
	// ProvidedEnv controls the type of `import("cloudflare:workers").env` in tests.
	interface ProvidedEnv extends Env {
		NEXT_TAG_CACHE_DO_SHARDED: NonNullable<CloudflareEnv["NEXT_TAG_CACHE_DO_SHARDED"]>;
		NEXT_CACHE_DO_PURGE: NonNullable<CloudflareEnv["NEXT_CACHE_DO_PURGE"]>;
		WORKER_SELF_REFERENCE: NonNullable<CloudflareEnv["WORKER_SELF_REFERENCE"]>;
		NEXT_CACHE_DO_QUEUE: NonNullable<CloudflareEnv["NEXT_CACHE_DO_QUEUE"]>;
	}
}

export {};

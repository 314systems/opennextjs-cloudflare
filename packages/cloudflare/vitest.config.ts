import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		/**
		 * Explicitly set root to current directory for this package.
		 *
		 * In monorepo setups, this vitest.config.ts takes priority over any parent
		 * vite.config.js files, preventing Vitest from using unrelated configurations
		 * from parent directories that may reference dependencies not installed in
		 * this package.
		 *
		 * This is the recommended approach for monorepo packages to ensure isolated
		 * test configuration.
		 *
		 * See: https://vitest.dev/config/
		 */
		root: ".",
		clearMocks: true,
		restoreMocks: true,
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["src/**/*.spec.ts"],
				},
			},
			{
				extends: true,
				plugins: [
					cloudflareTest({
						main: "./tests/fixtures/do-worker.ts",
						miniflare: {
							serviceBindings: {
								WORKER_SELF_REFERENCE: () =>
									new Response(null, {
										status: 200,
										headers: { "x-nextjs-cache": "REVALIDATED" },
									}),
							},
						},
						wrangler: { configPath: "./wrangler.jsonc" },
					}),
				],
				test: {
					name: "cloudflare-do",
					include: [
						"tests/api/durable-objects/bucket-cache-purge.spec.ts",
						"tests/api/durable-objects/queue.spec.ts",
						"tests/api/durable-objects/sharded-tag-cache.spec.ts",
					],
				},
			},
		],
	},
});

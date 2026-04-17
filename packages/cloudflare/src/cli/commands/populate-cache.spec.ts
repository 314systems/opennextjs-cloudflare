import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import type { Unstable_Config as WranglerConfig } from "wrangler";
import { unstable_startWorker } from "wrangler";

import { defineCloudflareConfig } from "../../api/config.js";
import r2IncrementalCache from "../../api/overrides/incremental-cache/r2-incremental-cache.js";
import { ensureR2Bucket } from "../utils/ensure-r2-bucket.js";
import { getCacheAssets, populateCache, PopulateCacheOptions } from "./populate-cache.js";
import { WorkerEnvVar } from "./utils/helpers.js";

describe("getCacheAssets", () => {
	let testDir: string;

	beforeAll(async () => {
		testDir = await mkdtemp(path.join(os.tmpdir(), "opennext-cache-test-"));
		const fetchBaseDir = path.join(testDir, "cache/__fetch/buildID");
		const cacheDir = path.join(testDir, "cache/buildID/path/to");

		await mkdir(fetchBaseDir, { recursive: true });
		await mkdir(cacheDir, { recursive: true });

		for (let i = 0; i < 3; i++) {
			await writeFile(path.join(fetchBaseDir, `${i}`), "", { encoding: "utf-8" });
			await writeFile(path.join(cacheDir, `${i}.cache`), "", { encoding: "utf-8" });
		}
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	test("list cache assets", () => {
		const assets = getCacheAssets({ outputDir: testDir } as BuildOptions).map((asset) => ({
			...asset,
			fullPath: asset.fullPath
				.split(path.sep)
				.join("/")
				.replace(testDir.split(path.sep).join("/"), "/base/path"),
		}));
		expect(assets).toMatchInlineSnapshot(`
      [
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/2.cache",
          "isFetch": false,
          "key": "/path/to/2",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/1.cache",
          "isFetch": false,
          "key": "/path/to/1",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/buildID/path/to/0.cache",
          "isFetch": false,
          "key": "/path/to/0",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/2",
          "isFetch": true,
          "key": "/2",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/1",
          "isFetch": true,
          "key": "/1",
        },
        {
          "buildId": "buildID",
          "fullPath": "/base/path/cache/__fetch/buildID/0",
          "isFetch": true,
          "key": "/0",
        },
      ]
    `);
	});
});

vi.mock("./utils/run-wrangler.js", () => ({
	runWrangler: vi.fn(async () => ({ success: true, stdout: "", stderr: "" })),
}));

vi.mock("./utils/helpers.js", () => ({
	getEnvFromPlatformProxy: vi.fn(async () => ({})),
	quoteShellMeta: vi.fn((s) => s),
}));

vi.mock("../utils/ensure-r2-bucket.js");
vi.mock("wrangler");

describe("populateCache", async () => {
	const testDir = await mkdtemp(path.join(os.tmpdir(), "opennext-cache-test-"));
	const buildOptions = {
		appPath: path.join(testDir, "app"),
		outputDir: path.join(testDir, "output"),
	} as BuildOptions;
	const config = defineCloudflareConfig({
		incrementalCache: r2IncrementalCache,
	});
	const wranglerConfig = {
		r2_buckets: [
			{
				binding: "NEXT_INC_CACHE_R2_BUCKET",
				bucket_name: "test-bucket",
				preview_bucket_name: "preview-bucket",
				jurisdiction: "eu",
			},
		],
	} as WranglerConfig;
	const envVars = {} as WorkerEnvVar;

	const setupMockFileSystem = async () => {
		const targetFile = path.join(buildOptions.outputDir, "cache/buildID/path/to/test.cache");
		await mkdir(path.dirname(targetFile), { recursive: true });
		await writeFile(targetFile, JSON.stringify({ data: "test" }));
	};

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	describe("R2 incremental cache", () => {
		afterEach(async () => {
			vi.resetAllMocks();
			vi.useRealTimers();
			await rm(buildOptions.outputDir, { recursive: true, force: true });
		});

		test.each<PopulateCacheOptions>([
			{ target: "local", shouldUsePreviewId: false },
			{ target: "remote", shouldUsePreviewId: false },
			{ target: "remote", shouldUsePreviewId: true },
		])(
			`$target (shouldUsePreviewId: $shouldUsePreviewId) - starts worker and sends individual cache entries with the cache key header`,
			async (populateCacheOptions) => {
				const bucketName =
					populateCacheOptions.target === "remote" && populateCacheOptions.shouldUsePreviewId
						? "preview-bucket"
						: "test-bucket";
				const mockWorkerDispose = vi.fn();

				await setupMockFileSystem();
				vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
				// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
				vi.mocked(unstable_startWorker).mockResolvedValueOnce({
					ready: Promise.resolve(),
					url: Promise.resolve(new URL("http://localhost:12345")),
					dispose: mockWorkerDispose,
				});
				vi.mocked(ensureR2Bucket).mockResolvedValueOnce({ success: true, bucketName });

				// Mock fetch to return a successful response for each individual entry.
				const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				});

				await populateCache(buildOptions, config, wranglerConfig, populateCacheOptions, envVars);

				expect(unstable_startWorker).toHaveBeenCalledWith(
					expect.objectContaining({
						bindings: expect.objectContaining({
							R2: expect.objectContaining({
								type: "r2_bucket",
								bucket_name: bucketName,
								jurisdiction: "eu",
							}),
						}),
						dev: expect.objectContaining({
							remote: populateCacheOptions.target === "remote",
						}),
					})
				);

				if (populateCacheOptions.target === "remote") {
					expect(ensureR2Bucket).toHaveBeenCalledWith(buildOptions.appPath, bucketName, "eu");
				} else {
					expect(ensureR2Bucket).not.toHaveBeenCalled();
				}

				expect(fetchMock).toHaveBeenCalled();

				for (const [input, init] of fetchMock.mock.calls) {
					expect(input).toBe("http://localhost:12345/populate");
					expect(init?.method).toBe("POST");
					expect(init?.headers).toEqual({
						"x-opennext-cache-key": expect.any(String),
						"content-length": expect.any(String),
					});
					expect(init?.body).toBeInstanceOf(ReadableStream);
				}

				// Verify worker was disposed after sending entries.
				expect(mockWorkerDispose).toHaveBeenCalled();
			}
		);

		test("remote - exits when bucket provisioning fails", async () => {
			await setupMockFileSystem();
			vi.mocked(ensureR2Bucket).mockResolvedValueOnce({
				success: false,
				error: "wrangler login failed",
			});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "remote", shouldUsePreviewId: false },
				envVars
			);

			await expect(result).rejects.toThrow(
				'Failed to provision remote R2 bucket "test-bucket" for binding "NEXT_INC_CACHE_R2_BUCKET": wrangler login failed'
			);

			expect(unstable_startWorker).not.toHaveBeenCalled();
		});

		test("retries timed out requests to the R2 worker", async () => {
			await setupMockFileSystem();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });

			const mockWorkerDispose = vi.fn();
			// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
			vi.mocked(unstable_startWorker).mockResolvedValueOnce({
				ready: Promise.resolve(),
				url: Promise.resolve(new URL("http://localhost:12345")),
				dispose: mockWorkerDispose,
			});
			vi.spyOn(AbortSignal, "timeout");

			const fetchMock = vi
				.spyOn(global, "fetch")
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					const timeoutError = new Error("Request timed out");
					timeoutError.name = "TimeoutError";
					throw timeoutError;
				})
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "local", shouldUsePreviewId: false },
				envVars
			);

			await vi.waitFor(() => {
				expect(AbortSignal.timeout).toHaveBeenCalledWith(60_000);
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			await vi.advanceTimersByTimeAsync(250);
			await result;

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(mockWorkerDispose).toHaveBeenCalled();
		});

		test("retries 5xx responses from the R2 worker", async () => {
			await setupMockFileSystem();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
			vi.spyOn(AbortSignal, "timeout");

			const mockWorkerDispose = vi.fn();
			// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
			vi.mocked(unstable_startWorker).mockResolvedValueOnce({
				ready: Promise.resolve(),
				url: Promise.resolve(new URL("http://localhost:12345")),
				dispose: mockWorkerDispose,
			});

			const fetchMock = vi
				.spyOn(global, "fetch")
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(
						JSON.stringify({ success: false, error: "R2 storage error", code: "ERR_WRITE_FAILED" }),
						{
							status: 500,
							headers: { "Content-Type": "application/json" },
						}
					);
				})
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "local", shouldUsePreviewId: false },
				envVars
			);

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			await vi.advanceTimersByTimeAsync(250);
			await expect(result).resolves.toBeUndefined();

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(AbortSignal.timeout).toHaveBeenCalledWith(60_000);
			expect(mockWorkerDispose).toHaveBeenCalled();
		});

		test("retries worker exceeded resource limits responses", async () => {
			await setupMockFileSystem();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });

			const mockWorkerDispose = vi.fn();
			// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
			vi.mocked(unstable_startWorker).mockResolvedValueOnce({
				ready: Promise.resolve(),
				url: Promise.resolve(new URL("http://localhost:12345")),
				dispose: mockWorkerDispose,
			});

			const fetchMock = vi
				.spyOn(global, "fetch")
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(
						"<!DOCTYPE html><title>Worker exceeded resource limits</title><h1>Error 1102</h1></html>",
						{
							status: 200,
							headers: { "Content-Type": "text/html" },
						}
					);
				})
				.mockImplementationOnce(async (_input, init) => {
					if (init?.body instanceof ReadableStream) {
						await init.body.cancel();
					}

					return new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "local", shouldUsePreviewId: false },
				envVars
			);

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			await vi.advanceTimersByTimeAsync(250);
			await expect(result).resolves.toBeUndefined();

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(mockWorkerDispose).toHaveBeenCalled();
		});

		test("exhausts all retries with exponential backoff for 5xx responses", async () => {
			await setupMockFileSystem();
			vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });

			const mockWorkerDispose = vi.fn();
			// @ts-expect-error - Mock unstable_startWorker to return a mock worker instance
			vi.mocked(unstable_startWorker).mockResolvedValueOnce({
				ready: Promise.resolve(),
				url: Promise.resolve(new URL("http://localhost:12345")),
				dispose: mockWorkerDispose,
			});

			const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (_input, init) => {
				if (init?.body instanceof ReadableStream) {
					await init.body.cancel();
				}

				return new Response(
					JSON.stringify({ success: false, error: "R2 storage error", code: "ERR_WRITE_FAILED" }),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					}
				);
			});

			const result = populateCache(
				buildOptions,
				config,
				wranglerConfig,
				{ target: "local", shouldUsePreviewId: false },
				envVars
			);

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(1);
			});

			await vi.advanceTimersByTimeAsync(249);
			expect(fetchMock).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(1);

			await vi.waitFor(() => {
				expect(fetchMock).toHaveBeenCalledTimes(2);
			});

			await vi.advanceTimersByTimeAsync(500 + 1000 + 2000);

			await expect(result).rejects.toThrow(
				/Failed to populate the local R2 cache: Failed to write "incremental-cache\/buildID\/[A-Za-z0-9]+.cache" to R2 after 5 attempts/
			);

			expect(fetchMock).toHaveBeenCalledTimes(5);
			expect(mockWorkerDispose).toHaveBeenCalled();
		});
	});
});

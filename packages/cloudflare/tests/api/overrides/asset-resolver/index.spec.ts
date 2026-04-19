import type { InternalEvent } from "@opennextjs/aws/types/open-next.js";
import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import assetResolver, { isUserWorkerFirst } from "../../../../src/api/overrides/asset-resolver/index.js";

const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");
const maybeGetAssetResult = assetResolver.maybeGetAssetResult!;

const makeEvent = (method: string, rawPath: string): InternalEvent =>
	({
		type: "core",
		method,
		rawPath,
		url: rawPath,
		headers: { accept: "*/*" },
		query: {},
		cookies: {},
		remoteAddress: "127.0.0.1",
	} as InternalEvent);

const setCloudflareContext = () => {
	(globalThis as unknown as Record<typeof cloudflareContextSymbol, unknown>)[cloudflareContextSymbol] = {
		env,
		cf: undefined,
		ctx: createExecutionContext(),
	};
};

const clearCloudflareContext = () => {
	delete (globalThis as unknown as Record<typeof cloudflareContextSymbol, unknown>)[cloudflareContextSymbol];
};

describe("maybeGetAssetResult", () => {
	beforeEach(() => {
		setCloudflareContext();
		globalThis.__ASSETS_RUN_WORKER_FIRST__ = true;
	});

	afterEach(() => {
		clearCloudflareContext();
		globalThis.__ASSETS_RUN_WORKER_FIRST__ = undefined;
	});

	it("should return a response body for GET requests", async () => {
		const result = await maybeGetAssetResult(makeEvent("GET", "/style.css"));

		expect(result).toBeDefined();
		expect(result!.statusCode).toBe(200);
		expect(result!.body).not.toBeNull();
	});

	it("should return a null body for HEAD requests", async () => {
		const result = await maybeGetAssetResult(makeEvent("HEAD", "/style.css"));

		expect(result).toBeDefined();
		expect(result!.statusCode).toBe(200);
		expect(result!.body).toBeNull();
	});

	it("should return undefined for 404 responses", async () => {
		const result = await maybeGetAssetResult(makeEvent("GET", "/missing.css"));

		expect(result).toBeUndefined();
	});

	it("should return undefined for POST requests", async () => {
		const result = await maybeGetAssetResult(makeEvent("POST", "/style.css"));

		expect(result).toBeUndefined();
	});

	it("should return undefined when run_worker_first is false", async () => {
		globalThis.__ASSETS_RUN_WORKER_FIRST__ = false;

		const result = await maybeGetAssetResult(makeEvent("GET", "/style.css"));

		expect(result).toBeUndefined();
	});
});

describe("isUserWorkerFirst", () => {
	it("should return false when run_worker_first is false", () => {
		expect(isUserWorkerFirst(false, "/test")).toBe(false);
		expect(isUserWorkerFirst(false, "/")).toBe(false);
	});

	it("should return false when run_worker_first is undefined", () => {
		expect(isUserWorkerFirst(undefined, "/test")).toBe(false);
		expect(isUserWorkerFirst(undefined, "/")).toBe(false);
	});

	it("should return true when run_worker_first is true", () => {
		expect(isUserWorkerFirst(true, "/test")).toBe(true);
		expect(isUserWorkerFirst(true, "/")).toBe(true);
	});

	describe("run_worker_first is an array", () => {
		it("should return true only for exact positive string matches", () => {
			expect(isUserWorkerFirst(["/test.ext"], "/test.ext")).toBe(true);
			expect(isUserWorkerFirst(["/a", "/b", "/test.ext"], "/test.ext")).toBe(true);
			expect(isUserWorkerFirst(["/a", "/b", "/test.ext"], "/test")).toBe(false);
			expect(isUserWorkerFirst(["/before/test.ext"], "/test.ext")).toBe(false);
			expect(isUserWorkerFirst(["/test.ext/after"], "/test.ext")).toBe(false);
		});

		it("should return false for matching negative string rules", () => {
			expect(isUserWorkerFirst(["!/test.ext"], "/test.ext")).toBe(false);
			expect(isUserWorkerFirst(["!/a", "!/b", "!/test.ext"], "/test.ext")).toBe(false);
		});

		it("should return true for matching positive wildcard patterns", () => {
			expect(isUserWorkerFirst(["/images/*"], "/images/pic.jpg")).toBe(true);
			expect(isUserWorkerFirst(["/images/*"], "/other/pic.jpg")).toBe(false);
		});

		it("should let matching negative wildcard patterns override positive matches", () => {
			expect(isUserWorkerFirst(["/*", "!/images/*"], "/images/pic.jpg")).toBe(false);
			expect(isUserWorkerFirst(["/*", "!/images/*"], "/index.html")).toBe(true);
			expect(isUserWorkerFirst(["!/images/*", "/*"], "/images/pic.jpg")).toBe(false);
			expect(isUserWorkerFirst(["!/images/*", "/*"], "/index.html")).toBe(true);
		});
	});
});

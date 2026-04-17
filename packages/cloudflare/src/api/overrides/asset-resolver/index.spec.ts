import type { InternalResult } from "@opennextjs/aws/types/open-next.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isUserWorkerFirst } from "./index.js";

const mockAssetsFetch = vi.fn();

vi.mock("../../cloudflare-context.js", () => ({
	getCloudflareContext: () => ({
		env: {
			ASSETS: { fetch: mockAssetsFetch },
		},
	}),
}));

describe("maybeGetAssetResult", () => {
	let resolver: typeof import("./index.js").default;

	beforeEach(async () => {
		vi.resetModules();
		mockAssetsFetch.mockReset();
		globalThis.__ASSETS_RUN_WORKER_FIRST__ = true;
		resolver = (await import("./index.js")).default;
	});

	const makeEvent = (method: string, rawPath: string) =>
		({
			method,
			rawPath,
			headers: { accept: "*/*" },
		}) as unknown as InternalResult;

	const callResolver = (method: string, rawPath: string): Promise<InternalResult | undefined> =>
		Promise.resolve(resolver.maybeGetAssetResult!(makeEvent(method, rawPath)));

	it("returns a 200 response with body for GET requests", async () => {
		const body = new ReadableStream();
		mockAssetsFetch.mockResolvedValue(new Response(body, { status: 200 }));

		const result = await callResolver("GET", "/style.css");

		expect(result).toBeDefined();
		expect(result!.statusCode).toBe(200);
		expect(result!.body).not.toBeNull();
	});

	it("returns a 200 response with null body for HEAD requests", async () => {
		mockAssetsFetch.mockResolvedValue(new Response(null, { status: 200 }));

		const result = await callResolver("HEAD", "/style.css");

		expect(result).toBeDefined();
		expect(result!.statusCode).toBe(200);
		expect(result!.body).toBeNull();
	});

	it("returns undefined for 404 responses", async () => {
		mockAssetsFetch.mockResolvedValue(new Response(null, { status: 404 }));

		const result = await callResolver("GET", "/missing.css");

		expect(result).toBeUndefined();
	});

	it("returns undefined for POST requests", async () => {
		const result = await callResolver("POST", "/style.css");

		expect(result).toBeUndefined();
		expect(mockAssetsFetch).not.toHaveBeenCalled();
	});

	it("returns undefined when run_worker_first is false", async () => {
		globalThis.__ASSETS_RUN_WORKER_FIRST__ = false;

		const result = await callResolver("GET", "/style.css");

		expect(result).toBeUndefined();
		expect(mockAssetsFetch).not.toHaveBeenCalled();
	});
});

describe("isUserWorkerFirst", () => {
	it("returns false when run_worker_first is false", () => {
		expect(isUserWorkerFirst(false, "/test")).toBe(false);
		expect(isUserWorkerFirst(false, "/")).toBe(false);
	});

	it("returns false when run_worker_first is undefined", () => {
		expect(isUserWorkerFirst(undefined, "/test")).toBe(false);
		expect(isUserWorkerFirst(undefined, "/")).toBe(false);
	});

	it("returns true when run_worker_first is true", () => {
		expect(isUserWorkerFirst(true, "/test")).toBe(true);
		expect(isUserWorkerFirst(true, "/")).toBe(true);
	});

	it("returns true when path exactly matches a rule in the array", () => {
		expect(isUserWorkerFirst(["/test.ext"], "/test.ext")).toBe(true);
		expect(isUserWorkerFirst(["/a", "/b", "/test.ext"], "/test.ext")).toBe(true);
		expect(isUserWorkerFirst(["/a", "/b", "/test.ext"], "/test")).toBe(false);
		expect(isUserWorkerFirst(["/before/test.ext"], "/test.ext")).toBe(false);
		expect(isUserWorkerFirst(["/test.ext/after"], "/test.ext")).toBe(false);
	});

	it("returns false when path matches a negative rule in the array", () => {
		expect(isUserWorkerFirst(["!/test.ext"], "/test.ext")).toBe(false);
		expect(isUserWorkerFirst(["!/a", "!/b", "!/test.ext"], "/test.ext")).toBe(false);
	});

	it("returns true when path matches a wildcard pattern in the array", () => {
		expect(isUserWorkerFirst(["/images/*"], "/images/pic.jpg")).toBe(true);
		expect(isUserWorkerFirst(["/images/*"], "/other/pic.jpg")).toBe(false);
	});

	it("returns false when a negative rule overrides a positive wildcard match in the array", () => {
		expect(isUserWorkerFirst(["/*", "!/images/*"], "/images/pic.jpg")).toBe(false);
		expect(isUserWorkerFirst(["/*", "!/images/*"], "/index.html")).toBe(true);
		expect(isUserWorkerFirst(["!/images/*", "/*"], "/images/pic.jpg")).toBe(false);
		expect(isUserWorkerFirst(["!/images/*", "/*"], "/index.html")).toBe(true);
	});
});

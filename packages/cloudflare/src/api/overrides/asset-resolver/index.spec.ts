import type { InternalResult } from "@opennextjs/aws/types/open-next.js";
import { beforeEach, describe, expect, it, test, vi } from "vitest";

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

	test("GET request returns response body", async () => {
		const body = new ReadableStream();
		mockAssetsFetch.mockResolvedValue(new Response(body, { status: 200 }));

		const result = await callResolver("GET", "/style.css");

		expect(result).toBeDefined();
		expect(result!.statusCode).toBe(200);
		expect(result!.body).not.toBeNull();
	});

	test("HEAD request returns null body", async () => {
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
	test("run_worker_first = false", () => {
		expect(isUserWorkerFirst(false, "/test")).toBe(false);
		expect(isUserWorkerFirst(false, "/")).toBe(false);
	});

	test("run_worker_first is undefined", () => {
		expect(isUserWorkerFirst(undefined, "/test")).toBe(false);
		expect(isUserWorkerFirst(undefined, "/")).toBe(false);
	});

	test("run_worker_first = true", () => {
		expect(isUserWorkerFirst(true, "/test")).toBe(true);
		expect(isUserWorkerFirst(true, "/")).toBe(true);
	});

	describe("run_worker_first is an array", () => {
		test("positive string match", () => {
			expect(isUserWorkerFirst(["/test.ext"], "/test.ext")).toBe(true);
			expect(isUserWorkerFirst(["/a", "/b", "/test.ext"], "/test.ext")).toBe(true);
			expect(isUserWorkerFirst(["/a", "/b", "/test.ext"], "/test")).toBe(false);
			expect(isUserWorkerFirst(["/before/test.ext"], "/test.ext")).toBe(false);
			expect(isUserWorkerFirst(["/test.ext/after"], "/test.ext")).toBe(false);
		});

		test("negative string match", () => {
			expect(isUserWorkerFirst(["!/test.ext"], "/test.ext")).toBe(false);
			expect(isUserWorkerFirst(["!/a", "!/b", "!/test.ext"], "/test.ext")).toBe(false);
		});

		test("positive patterns", () => {
			expect(isUserWorkerFirst(["/images/*"], "/images/pic.jpg")).toBe(true);
			expect(isUserWorkerFirst(["/images/*"], "/other/pic.jpg")).toBe(false);
		});

		test("negative patterns", () => {
			expect(isUserWorkerFirst(["/*", "!/images/*"], "/images/pic.jpg")).toBe(false);
			expect(isUserWorkerFirst(["/*", "!/images/*"], "/index.html")).toBe(true);
			expect(isUserWorkerFirst(["!/images/*", "/*"], "/images/pic.jpg")).toBe(false);
			expect(isUserWorkerFirst(["!/images/*", "/*"], "/index.html")).toBe(true);
		});
	});
});

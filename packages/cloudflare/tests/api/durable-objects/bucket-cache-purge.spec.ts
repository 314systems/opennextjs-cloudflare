import { runDurableObjectAlarm, runInDurableObject as runInDurableObjectUntyped } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import type { BucketCachePurge } from "../../../src/api/durable-objects/bucket-cache-purge.js";
import * as internal from "../../../src/api/overrides/internal.js";

const createBucketCachePurgeStub = (name = crypto.randomUUID()): DurableObjectStub<BucketCachePurge> => {
	const namespace = env.NEXT_CACHE_DO_PURGE;
	if (!namespace) {
		throw new Error("NEXT_CACHE_DO_PURGE binding is missing");
	}

	return namespace.get(namespace.idFromName(name)) as DurableObjectStub<BucketCachePurge>;
};

const runInBucketCachePurge = <R>(
	stub: DurableObjectStub<BucketCachePurge>,
	callback: (cache: BucketCachePurge, state: DurableObjectState) => R | Promise<R>
) =>
	runInDurableObjectUntyped(stub as DurableObjectStub, (cache, state) =>
		callback(cache as BucketCachePurge, state)
	);

const getStoredTags = (state: DurableObjectState) =>
	state.storage.sql
		.exec<{ tag: string }>("SELECT tag FROM cache_purge ORDER BY tag")
		.toArray()
		.map(({ tag }) => tag);

const sortTags = (tags: string[]) => [...tags].sort((a, b) => a.localeCompare(b));

const mockInternalPurgeCacheByTags = () =>
	vi.spyOn(internal, "internalPurgeCacheByTags").mockResolvedValue("purge-success");

const drainAlarm = async (stub: ReturnType<typeof createBucketCachePurgeStub>) => {
	mockInternalPurgeCacheByTags();
	await runDurableObjectAlarm(stub);
};

describe("BucketCachePurge", () => {
	it("should create the cache purge table", async () => {
		const stub = createBucketCachePurgeStub();

		await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) => {
			expect(
				state.storage.sql
					.exec<{
						name: string;
						}>("SELECT name FROM sqlite_master WHERE type = ? AND name = ?", "table", "cache_purge")
						.toArray()
			).toEqual([{ name: "cache_purge" }]);
		});
	});

	describe("purgeCacheByTags", () => {
		it("should insert tags into the sql table", async () => {
			const stub = createBucketCachePurgeStub();

			await stub.purgeCacheByTags(["tag1", "tag2"]);

			await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) => {
				expect(getStoredTags(state)).toEqual(["tag1", "tag2"]);
				expect(await state.storage.getAlarm()).toEqual(expect.any(Number));
			});

			await drainAlarm(stub);
		});

		it("should replace duplicate tags", async () => {
			const stub = createBucketCachePurgeStub();

			await stub.purgeCacheByTags(["tag", "tag"]);

			await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) => {
				expect(getStoredTags(state)).toEqual(["tag"]);
			});

			await drainAlarm(stub);
		});

		it("should set an alarm if no alarm is set", async () => {
			const stub = createBucketCachePurgeStub();

			await stub.purgeCacheByTags(["tag"]);

			await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) => {
				expect(await state.storage.getAlarm()).toEqual(expect.any(Number));
			});

			await drainAlarm(stub);
		});

		it("should not replace an alarm if one is already set", async () => {
			const stub = createBucketCachePurgeStub();

			await stub.purgeCacheByTags(["tag1"]);
			const firstAlarm = await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) =>
				state.storage.getAlarm()
			);

			await stub.purgeCacheByTags(["tag2"]);
			const secondAlarm = await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) =>
				state.storage.getAlarm()
			);

			expect(secondAlarm).toBe(firstAlarm);

			await drainAlarm(stub);
		});
	});

	describe("alarm", () => {
		it("should purge cache by tags and delete them from the sql table", async () => {
			const purgeSpy = mockInternalPurgeCacheByTags();
			const stub = createBucketCachePurgeStub();

			await stub.purgeCacheByTags(["tag1", "tag2"]);

			expect(await runDurableObjectAlarm(stub)).toBe(true);
			expect(purgeSpy).toHaveBeenCalledTimes(1);
			expect(purgeSpy.mock.calls[0]?.[1]).toEqual(["tag1", "tag2"]);

			await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) => {
				expect(getStoredTags(state)).toEqual([]);
			});
		});

		it("should keep tags and throw when cache purge is rate limited", async () => {
			const purgeSpy = vi
				.spyOn(internal, "internalPurgeCacheByTags")
				.mockResolvedValue("rate-limit-exceeded");
			const stub = createBucketCachePurgeStub();
			const tags = ["tag1", "tag2"];

			await stub.purgeCacheByTags(tags);

			await expect(runDurableObjectAlarm(stub)).rejects.toThrow("Rate limit exceeded");
			expect(purgeSpy).toHaveBeenCalledTimes(1);
			expect(purgeSpy.mock.calls[0]?.[1]).toEqual(tags);

			await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) => {
				expect(getStoredTags(state)).toEqual(tags);
			});
		});

		it("should not purge cache if no tags are found", async () => {
			const purgeSpy = mockInternalPurgeCacheByTags();
			const stub = createBucketCachePurgeStub();

			await runInBucketCachePurge(stub, async (cache: BucketCachePurge) => {
				await cache.alarm();
			});

			expect(purgeSpy).not.toHaveBeenCalled();
		});

		it("should call internalPurgeCacheByTags with the correct tags", async () => {
			const purgeSpy = mockInternalPurgeCacheByTags();
			const stub = createBucketCachePurgeStub();
			const tags = ["tag1", "tag2"];

			await stub.purgeCacheByTags(tags);

			expect(await runDurableObjectAlarm(stub)).toBe(true);
			expect(purgeSpy).toHaveBeenCalledTimes(1);
			expect(purgeSpy.mock.calls[0]?.[1]).toEqual(tags);
		});

		it("should continue until all tags are purged", async () => {
			const purgeSpy = mockInternalPurgeCacheByTags();
			const stub = createBucketCachePurgeStub();
			const tags = Array.from({ length: 101 }, (_, i) => `tag${i}`);

			await stub.purgeCacheByTags(tags);

			expect(await runDurableObjectAlarm(stub)).toBe(true);

			const purgedTagBatches = purgeSpy.mock.calls.map(([, purgedTags]) => purgedTags);
			expect(purgedTagBatches).toHaveLength(2);
			expect(purgedTagBatches.map((batch) => batch.length).sort((a, b) => a - b)).toEqual([1, 100]);
			expect(sortTags(purgedTagBatches.flat())).toEqual(sortTags(tags));

			await runInBucketCachePurge(stub, async (_cache: BucketCachePurge, state) => {
				expect(getStoredTags(state)).toEqual([]);
			});
		});
	});
});

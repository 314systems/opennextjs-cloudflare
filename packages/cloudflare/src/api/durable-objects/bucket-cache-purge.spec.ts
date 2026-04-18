import { afterEach, describe, expect, it, vi } from "vitest";

import * as internal from "../overrides/internal.js";
import { BucketCachePurge } from "./bucket-cache-purge.js";

const mockCursor = <T extends Record<string, SqlStorageValue>>(rows: T[]) =>
	({ toArray: () => rows }) as unknown as SqlStorageCursor<T>;

vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: CloudflareEnv
		) {}
	},
}));

class TestableBucketCachePurge extends BucketCachePurge {
	declare ctx: DurableObjectState<Record<string, never>>;
	declare env: CloudflareEnv;
}

const createBucketCachePurge = () => {
	const mockState = {
		waitUntil: vi.fn(),
		blockConcurrencyWhile: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
		storage: {
			setAlarm: vi.fn(),
			getAlarm: vi.fn(),
			sql: {
				exec: vi.fn().mockImplementation(() => ({
					one: vi.fn(),
					toArray: vi.fn().mockReturnValue([]),
				})),
			},
		},
	};
	return new TestableBucketCachePurge(
		mockState as unknown as DurableObjectState<Record<string, never>>,
		{} as CloudflareEnv
	);
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("BucketCachePurge", () => {
	it("should block concurrency while creating the table", () => {
		const cache = createBucketCachePurge();
		expect(vi.mocked(cache.ctx.blockConcurrencyWhile)).toHaveBeenCalled();
		expect(vi.mocked(cache.ctx.storage.sql.exec)).toHaveBeenCalledWith(
			expect.stringContaining("CREATE TABLE IF NOT EXISTS cache_purge")
		);
	});

	describe("purgeCacheByTags", () => {
		it("should insert tags into the sql table", async () => {
			const cache = createBucketCachePurge();
			vi.mocked(cache.ctx.storage.sql.exec).mockClear();
			const tags = ["tag1", "tag2"];
			await cache.purgeCacheByTags(tags);
			expect(vi.mocked(cache.ctx.storage.sql.exec)).toHaveBeenCalledWith(
				expect.stringContaining("INSERT OR REPLACE INTO cache_purge"),
				tags[0]
			);
			expect(vi.mocked(cache.ctx.storage.sql.exec)).toHaveBeenCalledWith(
				expect.stringContaining("INSERT OR REPLACE INTO cache_purge"),
				tags[1]
			);
		});

		it("should not set an alarm when tags are empty", async () => {
			const cache = createBucketCachePurge();
			vi.mocked(cache.ctx.storage.sql.exec).mockClear();
			await cache.purgeCacheByTags([]);
			expect(cache.ctx.storage.getAlarm).not.toHaveBeenCalled();
			expect(cache.ctx.storage.setAlarm).not.toHaveBeenCalled();
			expect(vi.mocked(cache.ctx.storage.sql.exec)).not.toHaveBeenCalled();
		});

		it("should set an alarm if no alarm is set", async () => {
			const cache = createBucketCachePurge();
			vi.mocked(cache.ctx.storage.getAlarm).mockResolvedValueOnce(null);
			await cache.purgeCacheByTags(["tag"]);
			expect(cache.ctx.storage.setAlarm).toHaveBeenCalled();
		});

		it("should not set an alarm if one is already set", async () => {
			const cache = createBucketCachePurge();
			vi.mocked(cache.ctx.storage.getAlarm).mockResolvedValueOnce(1234567890);
			await cache.purgeCacheByTags(["tag"]);
			expect(cache.ctx.storage.setAlarm).not.toHaveBeenCalled();
		});
	});

	describe("alarm", () => {
		it("should purge cache by tags and delete them from the sql table", async () => {
			const cache = createBucketCachePurge();
			vi.spyOn(internal, "internalPurgeCacheByTags").mockResolvedValue("purge-success");
			vi.mocked(cache.ctx.storage.sql.exec).mockClear();
			vi.mocked(cache.ctx.storage.sql.exec).mockReturnValueOnce(
				mockCursor([{ tag: "tag1" }, { tag: "tag2" }])
			);
			await cache.alarm();
			expect(vi.mocked(cache.ctx.storage.sql.exec)).toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				"tag1",
				"tag2"
			);
		});
		it("should not purge cache if no tags are found", async () => {
			const cache = createBucketCachePurge();
			vi.mocked(cache.ctx.storage.sql.exec).mockClear();
			vi.mocked(cache.ctx.storage.sql.exec).mockReturnValueOnce(mockCursor([]));
			await cache.alarm();
			expect(vi.mocked(cache.ctx.storage.sql.exec)).not.toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				[]
			);
		});

		it("should call internalPurgeCacheByTags with the correct tags", async () => {
			const cache = createBucketCachePurge();
			const tags = ["tag1", "tag2"];
			vi.mocked(cache.ctx.storage.sql.exec).mockClear();
			vi.mocked(cache.ctx.storage.sql.exec).mockReturnValueOnce(mockCursor(tags.map((tag) => ({ tag }))));
			const internalPurgeCacheByTagsSpy = vi
				.spyOn(internal, "internalPurgeCacheByTags")
				.mockResolvedValue("purge-success");
			await cache.alarm();
			expect(internalPurgeCacheByTagsSpy).toHaveBeenCalledWith(cache.env, tags);
			// 1st gets the tags and 2nd deletes them.
			expect(vi.mocked(cache.ctx.storage.sql.exec)).toHaveBeenCalledTimes(2);
		});

		it("should continue until all tags are purged", async () => {
			const cache = createBucketCachePurge();
			const firstBatch = Array.from({ length: 100 }, (_, i) => `tag${String(i)}`);
			const secondBatch = ["tag100"];
			const batches = [firstBatch, secondBatch];
			vi.mocked(cache.ctx.storage.sql.exec).mockClear();
			vi.mocked(cache.ctx.storage.sql.exec).mockImplementation((query: string) => {
				if (query.startsWith("SELECT")) {
					const batch = batches.shift() ?? [];
					return mockCursor(batch.map((tag) => ({ tag })));
				}
				return mockCursor([]);
			});
			const internalPurgeCacheByTagsSpy = vi
				.spyOn(internal, "internalPurgeCacheByTags")
				.mockResolvedValue("purge-success");
			await cache.alarm();
			expect(internalPurgeCacheByTagsSpy).toHaveBeenNthCalledWith(1, cache.env, firstBatch);
			expect(internalPurgeCacheByTagsSpy).toHaveBeenNthCalledWith(2, cache.env, secondBatch);
			expect(vi.mocked(cache.ctx.storage.sql.exec)).toHaveBeenCalledTimes(4);
			expect(vi.mocked(cache.ctx.storage.sql.exec)).toHaveBeenNthCalledWith(
				3,
				expect.stringContaining("SELECT tag FROM cache_purge LIMIT 100")
			);
		});

		it("should keep tags queued when the purge API is rate limited", async () => {
			const cache = createBucketCachePurge();
			vi.mocked(cache.ctx.storage.sql.exec).mockClear();
			vi.mocked(cache.ctx.storage.sql.exec).mockReturnValueOnce(mockCursor([{ tag: "tag1" }]));
			vi.spyOn(internal, "internalPurgeCacheByTags").mockResolvedValue("rate-limit-exceeded");

			await expect(cache.alarm()).rejects.toThrow("Rate limit exceeded");
			expect(vi.mocked(cache.ctx.storage.sql.exec)).not.toHaveBeenCalledWith(
				expect.stringContaining("DELETE FROM cache_purge"),
				expect.anything()
			);
		});
	});
});

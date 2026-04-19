import { runInDurableObject as runInDurableObjectUntyped } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { DOShardedTagCache } from "../../../src/api/durable-objects/sharded-tag-cache.js";

type RevalidationRow = {
	tag: string;
	revalidatedAt: number;
	stale: number | null;
	expire: number | null;
};

const createShardedTagCacheStub = (name = crypto.randomUUID()): DurableObjectStub<DOShardedTagCache> => {
	const namespace = env.NEXT_TAG_CACHE_DO_SHARDED;
	if (!namespace) {
		throw new Error("NEXT_TAG_CACHE_DO_SHARDED binding is missing");
	}

	return namespace.get(namespace.idFromName(name)) as DurableObjectStub<DOShardedTagCache>;
};

const runInShardedTagCache = <R>(
	stub: DurableObjectStub<DOShardedTagCache>,
	callback: (cache: DOShardedTagCache, state: DurableObjectState) => R | Promise<R>
) =>
	runInDurableObjectUntyped(stub as DurableObjectStub, (cache, state) =>
		callback(cache as DOShardedTagCache, state)
	);

const getRevalidationRows = (state: DurableObjectState) =>
	state.storage.sql
		.exec<RevalidationRow>("SELECT tag, revalidatedAt, stale, expire FROM revalidations ORDER BY tag")
		.toArray();

describe("DOShardedTagCache", () => {
	it("should create the revalidations table", async () => {
		const stub = createShardedTagCacheStub();

		await runInShardedTagCache(stub, async (cache: DOShardedTagCache, state) => {
			expect(cache).toBeInstanceOf(DOShardedTagCache);
			expect(
				state.storage.sql
					.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = ? AND name = ?", "table", "revalidations")
					.toArray()
			).toEqual([{ name: "revalidations" }]);

			const columns = state.storage.sql
				.exec<{ name: string }>("PRAGMA table_info(revalidations)")
				.toArray()
				.map(({ name }) => name);

			expect(columns).toEqual(expect.arrayContaining(["tag", "revalidatedAt", "stale", "expire"]));
		});
	});

	describe("getTagData", () => {
		it("should return an empty object for empty tags", async () => {
			const stub = createShardedTagCacheStub();

			await expect(stub.getTagData([])).resolves.toEqual({});
		});

		it("should return stored tag data", async () => {
			const stub = createShardedTagCacheStub();

			await stub.writeTags(["tag1"], 1000);
			await stub.writeTags([{ tag: "tag2", stale: 1500, expire: 9999 }]);

			await expect(stub.getTagData(["tag1", "tag2"])).resolves.toEqual({
				tag1: { revalidatedAt: 1000, stale: 1000, expire: null },
				tag2: { revalidatedAt: 1500, stale: 1500, expire: 9999 },
			});
		});

		it("should return an empty object on SQL error", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const stub = createShardedTagCacheStub();

			const result = await runInShardedTagCache(stub, async (cache: DOShardedTagCache, state) => {
				state.storage.sql.exec("DROP TABLE revalidations");
				return cache.getTagData(["tag1"]);
			});

			expect(result).toEqual({});
			expect(consoleErrorSpy).toHaveBeenCalled();
		});
	});

	describe("writeTags", () => {
		it("should write string tags using the old format", async () => {
			const stub = createShardedTagCacheStub();

			await stub.writeTags(["tag1", "tag2"], 1000);

			await runInShardedTagCache(stub, async (_cache: DOShardedTagCache, state) => {
				expect(getRevalidationRows(state)).toEqual([
					{ tag: "tag1", revalidatedAt: 1000, stale: 1000, expire: null },
					{ tag: "tag2", revalidatedAt: 1000, stale: 1000, expire: null },
				]);
			});
		});

		it("should write object tags using stale and expire", async () => {
			const stub = createShardedTagCacheStub();

			await stub.writeTags([{ tag: "tag1", stale: 5000, expire: 9999 }]);

			await runInShardedTagCache(stub, async (_cache: DOShardedTagCache, state) => {
				expect(getRevalidationRows(state)).toEqual([
					{ tag: "tag1", revalidatedAt: 5000, stale: 5000, expire: 9999 },
				]);
			});
		});

		it("should return early for empty tags", async () => {
			const stub = createShardedTagCacheStub();

			await stub.writeTags([]);

			await runInShardedTagCache(stub, async (_cache: DOShardedTagCache, state) => {
				expect(getRevalidationRows(state)).toEqual([]);
			});
		});
	});
});

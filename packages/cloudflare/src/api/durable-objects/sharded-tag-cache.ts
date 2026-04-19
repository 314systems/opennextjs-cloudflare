import { DurableObject } from "cloudflare:workers";

import { debugCache } from "../overrides/internal.js";

export interface TagData {
	// Timestamp (ms) when the tag was last revalidated.
	revalidatedAt: number;
	// Timestamp (ms) when the cached entry becomes stale. `null` means it never becomes stale.
	stale: number | null;
	// Timestamp (ms) when the cached entry expires. `null` means it never expires.
	expire: number | null;
}

export class DOShardedTagCache extends DurableObject<CloudflareEnv> {
	sql: SqlStorage;

	constructor(state: DurableObjectState, env: CloudflareEnv) {
		super(state, env);
		void state.blockConcurrencyWhile(() => {
			// Columns:
			//   tag           - The cache tag.
			//   revalidatedAt - Timestamp (ms) when the tag was last revalidated.
			//   stale         - Timestamp (ms) when the cached entry becomes stale. Added in v1.19.
			//   expire        - Timestamp (ms) when the cached entry expires. NULL means no expire. Added in v1.19.
			state.storage.sql.exec(
				`CREATE TABLE IF NOT EXISTS revalidations (tag TEXT PRIMARY KEY, revalidatedAt INTEGER, stale INTEGER, expire INTEGER DEFAULT NULL)`
			);
			// Schema migration: Add `stale` and `expire` columns for existing DO - those have been introduced to support SWR in v1.19
			try {
				// SQLite does not support adding multiple columns in a single ALTER TABLE statement.
				state.storage.sql.exec(
					`ALTER TABLE revalidations ADD COLUMN stale INTEGER; ALTER TABLE revalidations ADD COLUMN expire INTEGER DEFAULT NULL`
				);
			} catch {
				// The ALTER TABLE statement fails if the columns already exist.
				// It only means the DO has already been migrated.
			}
			return Promise.resolve();
		});
		this.sql = state.storage.sql;
	}

	getTagData(tags: string[]): Record<string, TagData> {
		if (tags.length === 0) return {};
		try {
			const result = this.sql
				.exec(
					`SELECT tag, revalidatedAt, stale, expire FROM revalidations WHERE tag IN (${tags.map(() => "?").join(", ")})`,
					...tags
				)
				.toArray();
			debugCache("DOShardedTagCache", `getTagData tags=${String(tags)} -> ${String(result.length)} results`);
			return Object.fromEntries(
				result.map((row) => [
					row.tag as string,
					{
						revalidatedAt: (row.revalidatedAt ?? 0) as number,
						stale: (row.stale ?? null) as number | null,
						expire: (row.expire ?? null) as number | null,
					},
				])
			);
		} catch (e) {
			console.error(e);
			return {};
		}
	}

	/**
	 * @deprecated since v1.19.
	 *
	 * Use `getTagData` instead - no processing should be done in the DO ao allow using the regional cache to cache all the values
	 * for a given tag using a single key.
	 *
	 * Kept for backward compatibility during rolling deploys.
	 */
	getLastRevalidated(tags: string[]): number {
		const data = this.getTagData(tags);
		const values = Object.values(data);
		const timeMs = values.length === 0 ? 0 : Math.max(...values.map(({ revalidatedAt }) => revalidatedAt));
		debugCache("DOShardedTagCache", `getLastRevalidated tags=${String(tags)} -> time=${String(timeMs)}`);
		return timeMs;
	}

	/**
	 * @deprecated since v1.19.
	 *
	 * Use `getTagData` instead - no processing should be done in the DO ao allow using the regional cache to cache all the values
	 * for a given tag using a single key.
	 *
	 * Kept for backward compatibility during rolling deploys.
	 */
	hasBeenRevalidated(tags: string[], lastModified?: number): boolean {
		const data = this.getTagData(tags);
		const lastModifiedOrNowMs = lastModified ?? Date.now();
		const revalidated = Object.values(data).some(({ revalidatedAt }) => revalidatedAt > lastModifiedOrNowMs);
		debugCache(
			"DOShardedTagCache",
			`hasBeenRevalidated tags=${String(tags)} -> revalidated=${String(revalidated)}`
		);
		return revalidated;
	}

	/**
	 * @deprecated since v1.19.
	 *
	 * Use `getTagData` instead - no processing should be done in the DO ao allow using the regional cache to cache all the values
	 * for a given tag using a single key.
	 *
	 * Kept for backward compatibility during rolling deploys.
	 */
	getRevalidationTimes(tags: string[]): Record<string, number> {
		const data = this.getTagData(tags);
		return Object.fromEntries(Object.entries(data).map(([tag, { revalidatedAt }]) => [tag, revalidatedAt]));
	}

	writeTags(
		tags: (string | { tag: string; stale?: number; expire?: number | null })[],
		lastModified?: number
	): void {
		if (tags.length === 0) return;
		const nowMs = lastModified ?? Date.now();
		debugCache("DOShardedTagCache", `writeTags tags=${JSON.stringify(tags)} time=${String(nowMs)}`);

		if (typeof tags[0] === "string") {
			// Old call format: writeTags(tags: string[], lastModified: number)
			for (const tag of tags as string[]) {
				// `expire` defaults to `NULL`
				this.sql.exec(
					`INSERT OR REPLACE INTO revalidations (tag, revalidatedAt, stale) VALUES (?, ?, ?)`,
					tag,
					nowMs,
					nowMs
				);
			}
		} else {
			// New call format: writeTags(tags: Array<{ tag, stale?, expire? }>)
			for (const entry of tags as { tag: string; stale?: number; expire?: number | null }[]) {
				const staleValue = entry.stale ?? nowMs;
				this.sql.exec(
					`INSERT OR REPLACE INTO revalidations (tag, revalidatedAt, stale, expire) VALUES (?, ?, ?, ?)`,
					entry.tag,
					staleValue,
					staleValue,
					entry.expire ?? null
				);
			}
		}
	}
}

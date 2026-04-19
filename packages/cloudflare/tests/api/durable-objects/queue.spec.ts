import type { QueueMessage } from "@opennextjs/aws/types/overrides.js";
import { runInDurableObject as runInDurableObjectUntyped } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DOQueueHandler } from "../../../src/api/durable-objects/queue.js";

const createDurableObjectQueueStub = (name = crypto.randomUUID()): DurableObjectStub<DOQueueHandler> => {
	const namespace = env.NEXT_CACHE_DO_QUEUE;
	if (!namespace) {
		throw new Error("NEXT_CACHE_DO_QUEUE binding is missing");
	}

	return namespace.get(namespace.idFromName(name)) as DurableObjectStub<DOQueueHandler>;
};

const runInQueueDurableObject = <R>(
	stub: DurableObjectStub<DOQueueHandler>,
	callback: (queue: DOQueueHandler, state: DurableObjectState) => R | Promise<R>
) =>
	runInDurableObjectUntyped(stub as DurableObjectStub, (queue, state) =>
		callback(queue as DOQueueHandler, state)
	);

const createHeaders = (cacheStatus = "REVALIDATED") => new Headers([["x-nextjs-cache", cacheStatus]]);

const createServiceFetch = ({
	fetchDuration = 0,
	statusCode = 200,
	headers = createHeaders(),
	rejectWith,
}: {
	fetchDuration?: number;
	statusCode?: number;
	headers?: Headers;
	rejectWith?: Error;
} = {}) =>
	vi.fn(async () => {
		if (fetchDuration > 0) {
			await new Promise((resolve) => setTimeout(resolve, fetchDuration));
		}
		if (rejectWith) {
			throw rejectWith;
		}
		return new Response(null, { status: statusCode, headers });
	});

const createControlledServiceFetch = () => {
	const resolvers: Array<() => void> = [];
	const fetch = vi.fn(
		() =>
			new Promise<Response>((resolve) => {
				resolvers.push(() => resolve(new Response(null, { status: 200, headers: createHeaders() })));
			})
	);

	return {
		fetch,
		resolveNext: () => resolvers.shift()?.(),
		resolveAll: () => {
			for (const resolve of resolvers.splice(0)) {
				resolve();
			}
		},
	};
};

const setServiceFetch = (queue: DOQueueHandler, fetch: ReturnType<typeof createServiceFetch>) => {
	queue.service = { fetch } as unknown as DOQueueHandler["service"];
};

const setDisableSQLite = (queue: DOQueueHandler) => {
	(queue as unknown as { disableSQLite: boolean }).disableSQLite = true;
};

const createMessage = (dedupId: string, lastModified = Date.now()): QueueMessage => ({
	MessageBody: { host: "test.local", url: "/test", eTag: "test", lastModified },
	MessageGroupId: "test.local/test",
	MessageDeduplicationId: dedupId,
});

const getTableRows = <Row extends Record<string, SqlStorageValue>>(state: DurableObjectState, tableName: string) =>
	state.storage.sql.exec<Row>(`SELECT * FROM ${tableName}`).toArray();

beforeEach(() => {
	process.env.__NEXT_PREVIEW_MODE_ID = "test";
	process.env.__NEXT_BUILD_ID = "test-build";
});

describe("DurableObjectQueue", () => {
	describe("successful revalidation", () => {
		it("should process a single revalidation", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10 });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, fetch);

				const firstRequest = await queue.revalidate(createMessage("id"));
				expect(firstRequest).toBeUndefined();
				expect(queue.ongoingRevalidations.size).toBe(1);
				expect(queue.ongoingRevalidations.has("id")).toBe(true);

				await queue.ongoingRevalidations.get("id");

				expect(queue.ongoingRevalidations.size).toBe(0);
				expect(queue.ongoingRevalidations.has("id")).toBe(false);
			});

			expect(fetch).toHaveBeenCalledWith("https://test.local/test", {
				method: "HEAD",
				headers: {
					"x-prerender-revalidate": "test",
					"x-isr": "1",
				},
				signal: expect.any(AbortSignal),
			});
		});

		it("should dedupe revalidations", async () => {
			const stub = createDurableObjectQueueStub();
			const controlledFetch = createControlledServiceFetch();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, controlledFetch.fetch);

				await queue.revalidate(createMessage("id"));
				await queue.revalidate(createMessage("id"));

				expect(queue.ongoingRevalidations.size).toBe(1);
				expect(queue.ongoingRevalidations.has("id")).toBe(true);

				controlledFetch.resolveAll();
				await Promise.all(queue.ongoingRevalidations.values());
			});

			expect(controlledFetch.fetch).toHaveBeenCalledTimes(1);
		});

		it("should block concurrency", async () => {
			const stub = createDurableObjectQueueStub();
			const controlledFetch = createControlledServiceFetch();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, controlledFetch.fetch);

				await queue.revalidate(createMessage("id"));
				await queue.revalidate(createMessage("id2"));
				await queue.revalidate(createMessage("id3"));
				await queue.revalidate(createMessage("id4"));
				await queue.revalidate(createMessage("id5"));

				const blockedReq = queue.revalidate(createMessage("id6"));

				expect(queue.ongoingRevalidations.size).toBe(queue.maxRevalidations);
				expect(queue.ongoingRevalidations.has("id6")).toBe(false);
				expect(Array.from(queue.ongoingRevalidations.keys())).toEqual(["id", "id2", "id3", "id4", "id5"]);

				controlledFetch.resolveNext();
				await blockedReq;

				controlledFetch.resolveAll();
				await Promise.all(queue.ongoingRevalidations.values());
				expect(queue.ongoingRevalidations.size).toBe(0);
			});

			expect(controlledFetch.fetch).toHaveBeenCalledTimes(6);
		});
	});

	describe("failed revalidation", () => {
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
		let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		});

		afterEach(() => {
			consoleErrorSpy.mockRestore();
			consoleWarnSpy.mockRestore();
		});

		it("should not put it in failed state for an incorrect 200", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10, headers: createHeaders("MISS") });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, fetch);

				await queue.revalidate(createMessage("id"));
				await queue.ongoingRevalidations.get("id");

				expect(queue.routeInFailedState.size).toBe(0);
			});
		});

		it("should not put it in failed state for a failed revalidation with 404", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10, statusCode: 404 });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, fetch);

				await queue.revalidate(createMessage("id"));
				await queue.ongoingRevalidations.get("id");

				expect(queue.routeInFailedState.size).toBe(0);
				expect(fetch).toHaveBeenCalledTimes(1);

				await queue.revalidate(createMessage("id"));
				await queue.ongoingRevalidations.get("id");

				expect(queue.routeInFailedState.size).toBe(0);
				expect(fetch).toHaveBeenCalledTimes(2);
			});
		});

		it("should put it in failed state if revalidation fails with 500", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10, statusCode: 500 });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, fetch);

				await queue.revalidate(createMessage("id"));
				await queue.ongoingRevalidations.get("id");

				expect(queue.routeInFailedState.size).toBe(1);
				expect(queue.routeInFailedState.has("id")).toBe(true);
				expect(fetch).toHaveBeenCalledTimes(1);

				await queue.revalidate(createMessage("id"));

				expect(queue.routeInFailedState.size).toBe(1);
				expect(fetch).toHaveBeenCalledTimes(1);
			});
		});

		it("should put it in failed state if revalidation fetch throws", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10, rejectWith: new Error("fetch error") });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, fetch);

				await queue.revalidate(createMessage("id"));
				await queue.ongoingRevalidations.get("id");

				expect(queue.routeInFailedState.size).toBe(1);
				expect(queue.routeInFailedState.has("id")).toBe(true);
				expect(queue.ongoingRevalidations.size).toBe(0);
				expect(fetch).toHaveBeenCalledTimes(1);

				await queue.revalidate(createMessage("id"));

				expect(queue.routeInFailedState.size).toBe(1);
				expect(fetch).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("addAlarm", () => {
		it("should not add an alarm if there are no failed states", async () => {
			const stub = createDurableObjectQueueStub();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler, state) => {
				await queue.addAlarm();
				expect(await state.storage.getAlarm()).toBeNull();
			});
		});

		it("should add an alarm if there are failed states", async () => {
			const stub = createDurableObjectQueueStub();
			const nextAlarmMs = Date.now() + 1000;

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler, state) => {
				queue.routeInFailedState.set("id", { msg: createMessage("id"), retryCount: 0, nextAlarmMs });

				await queue.addAlarm();

				expect(await state.storage.getAlarm()).toBe(nextAlarmMs);
			});
		});

		it("should not replace an alarm if one is already set", async () => {
			const stub = createDurableObjectQueueStub();
			const existingAlarm = Date.now() + 1000;

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler, state) => {
				await state.storage.setAlarm(existingAlarm);
				queue.routeInFailedState.set("id", {
					msg: createMessage("id"),
					retryCount: 0,
					nextAlarmMs: existingAlarm + 1000,
				});

				await queue.addAlarm();

				expect(await state.storage.getAlarm()).toBe(existingAlarm);
			});
		});

		it("should set the alarm to the lowest nextAlarm", async () => {
			const stub = createDurableObjectQueueStub();
			const nextAlarmMs = Date.now() + 1000;
			const firstAlarm = Date.now() + 500;

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler, state) => {
				queue.routeInFailedState.set("id", { msg: createMessage("id"), retryCount: 0, nextAlarmMs });
				queue.routeInFailedState.set("id2", {
					msg: createMessage("id2"),
					retryCount: 0,
					nextAlarmMs: firstAlarm,
				});

				await queue.addAlarm();

				expect(await state.storage.getAlarm()).toBe(firstAlarm);
			});
		});
	});

	describe("addToFailedState", () => {
		let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		});

		afterEach(() => {
			consoleErrorSpy.mockRestore();
		});

		it("should add a failed state", async () => {
			const stub = createDurableObjectQueueStub();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				await queue.addToFailedState(createMessage("id"));

				expect(queue.routeInFailedState.size).toBe(1);
				expect(queue.routeInFailedState.has("id")).toBe(true);
				expect(queue.routeInFailedState.get("id")?.retryCount).toBe(1);
			});
		});

		it("should add a failed state with the correct nextAlarm", async () => {
			const stub = createDurableObjectQueueStub();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				await queue.addToFailedState(createMessage("id"));

				expect(queue.routeInFailedState.get("id")?.nextAlarmMs).toBeGreaterThan(Date.now());
				expect(queue.routeInFailedState.get("id")?.retryCount).toBe(1);
			});
		});

		it("should add a failed state with the correct nextAlarm for a retry", async () => {
			const stub = createDurableObjectQueueStub();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				await queue.addToFailedState(createMessage("id"));
				await queue.addToFailedState(createMessage("id"));

				expect(queue.routeInFailedState.get("id")?.nextAlarmMs).toBeGreaterThan(Date.now());
				expect(queue.routeInFailedState.get("id")?.retryCount).toBe(2);
			});
		});

		it("should not add a failed state if it has been retried 6 times", async () => {
			const stub = createDurableObjectQueueStub();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				queue.routeInFailedState.set("id", {
					msg: createMessage("id"),
					retryCount: 6,
					nextAlarmMs: Date.now() + 1000,
				});

				await queue.addToFailedState(createMessage("id"));

				expect(queue.routeInFailedState.size).toBe(0);
			});
		});
	});

	describe("alarm", () => {
		it("should execute revalidations for expired events", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10 });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, fetch);
				queue.routeInFailedState.set("id", {
					msg: createMessage("id"),
					retryCount: 0,
					nextAlarmMs: Date.now() - 1000,
				});
				queue.routeInFailedState.set("id2", {
					msg: createMessage("id2"),
					retryCount: 0,
					nextAlarmMs: Date.now() - 1000,
				});

				await queue.alarm();

				expect(queue.routeInFailedState.size).toBe(0);
				expect(fetch).toHaveBeenCalledTimes(2);
			});
		});

		it("should execute revalidations for the next event to retry", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10 });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, fetch);
				queue.routeInFailedState.set("id", {
					msg: createMessage("id"),
					retryCount: 0,
					nextAlarmMs: Date.now() + 1000,
				});
				queue.routeInFailedState.set("id2", {
					msg: createMessage("id2"),
					retryCount: 0,
					nextAlarmMs: Date.now() + 500,
				});

				await queue.alarm();

				expect(queue.routeInFailedState.size).toBe(1);
				expect(fetch).toHaveBeenCalledTimes(1);
				expect(queue.routeInFailedState.has("id2")).toBe(false);
			});
		});

		it("should execute revalidations for the next event to retry and expired events", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10 });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler) => {
				setServiceFetch(queue, fetch);
				queue.routeInFailedState.set("id", {
					msg: createMessage("id"),
					retryCount: 0,
					nextAlarmMs: Date.now() + 1000,
				});
				queue.routeInFailedState.set("id2", {
					msg: createMessage("id2"),
					retryCount: 0,
					nextAlarmMs: Date.now() - 1000,
				});

				await queue.alarm();

				expect(queue.routeInFailedState.size).toBe(0);
				expect(fetch).toHaveBeenCalledTimes(2);
			});
		});
	});

	describe("disableSQLite", () => {
		it("should not write failed state to sql", async () => {
			const stub = createDurableObjectQueueStub();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler, state) => {
				setDisableSQLite(queue);

				await queue.addToFailedState(createMessage("id"));

				expect(getTableRows(state, "failed_state")).toEqual([]);
			});
		});

		it("should not read from the sqlite storage on checkSyncTable", async () => {
			const stub = createDurableObjectQueueStub();

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler, state) => {
				state.storage.sql.exec(
					"INSERT OR REPLACE INTO sync (id, lastSuccess, buildId) VALUES (?, ?, ?)",
					"test.local/test",
					Math.round(Date.now() / 1000) + 1000,
					process.env.__NEXT_BUILD_ID
				);
				setDisableSQLite(queue);

				expect(queue.checkSyncTable(createMessage("id"))).toBe(false);
			});
		});

		it("should not write to sql on successful revalidation", async () => {
			const stub = createDurableObjectQueueStub();
			const fetch = createServiceFetch({ fetchDuration: 10 });

			await runInQueueDurableObject(stub, async (queue: DOQueueHandler, state) => {
				setServiceFetch(queue, fetch);
				setDisableSQLite(queue);

				await queue.revalidate(createMessage("id"));
				await queue.ongoingRevalidations.get("id");

				expect(getTableRows(state, "sync")).toEqual([]);
			});
		});
	});
});

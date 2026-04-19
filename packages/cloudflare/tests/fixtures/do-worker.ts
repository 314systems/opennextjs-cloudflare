export { BucketCachePurge } from "../../src/api/durable-objects/bucket-cache-purge.js";
export { DOQueueHandler } from "../../src/api/durable-objects/queue.js";
export { DOShardedTagCache } from "../../src/api/durable-objects/sharded-tag-cache.js";

export default {
	fetch() {
		return new Response("ok");
	},
};

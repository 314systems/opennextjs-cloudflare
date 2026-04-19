declare global {
	interface CloudflareEnv {
		ASSETS?: Fetcher;
		IMAGES?: ImagesBinding;
		NEXTJS_ENV?: string;
		WORKER_SELF_REFERENCE?: Service;
		NEXT_INC_CACHE_KV?: KVNamespace;
		NEXT_INC_CACHE_KV_PREFIX?: string;
		NEXT_INC_CACHE_R2_BUCKET?: R2Bucket;
		NEXT_INC_CACHE_R2_PREFIX?: string;
		NEXT_TAG_CACHE_D1?: D1Database;
		NEXT_TAG_CACHE_KV?: KVNamespace;
		NEXT_TAG_CACHE_DO_SHARDED?: DurableObjectNamespace;
		NEXT_TAG_CACHE_DO_SHARDED_DLQ?: Queue;
		NEXT_CACHE_DO_QUEUE?: DurableObjectNamespace;
		NEXT_CACHE_DO_QUEUE_MAX_REVALIDATION?: string;
		NEXT_CACHE_DO_QUEUE_REVALIDATION_TIMEOUT_MS?: string;
		NEXT_CACHE_DO_QUEUE_RETRY_INTERVAL_MS?: string;
		NEXT_CACHE_DO_QUEUE_MAX_RETRIES?: string;
		NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE?: string;
		NEXT_CACHE_DO_PURGE?: DurableObjectNamespace;
		NEXT_CACHE_DO_PURGE_BUFFER_TIME_IN_SECONDS?: string;
		CACHE_PURGE_ZONE_ID?: string;
		CACHE_PURGE_API_TOKEN?: string;
		CF_WORKER_NAME?: string;
		CF_PREVIEW_DOMAIN?: string;
		CF_WORKERS_SCRIPTS_API_TOKEN?: string;
		CF_ACCOUNT_ID?: string;
	}
}

export {};

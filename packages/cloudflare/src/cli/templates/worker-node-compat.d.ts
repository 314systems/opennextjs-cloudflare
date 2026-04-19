declare module "node:async_hooks" {
	export class AsyncLocalStorage<T = unknown> {
		getStore(): T | undefined;
		run<R>(store: T, callback: () => R): R;
	}
}

declare module "node:process" {
	const process: {
		env: Record<string, string | undefined>;
	};

	export default process;
}

declare module "node:stream" {
	interface ReadableConstructor {
		new (...args: never[]): unknown;
		from(value: unknown): ReadableStream;
	}

	const Readable: ReadableConstructor;

	const stream: {
		Readable: typeof Readable;
	};

	export { Readable };
	export default stream;
}

declare const process: {
	env: Record<string, string | undefined>;
};

interface ImportMeta {
	url?: string;
}

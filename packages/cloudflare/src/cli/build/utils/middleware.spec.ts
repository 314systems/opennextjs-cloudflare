import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { BuildOptions } from "@opennextjs/aws/build/helper.js";
import { afterEach, describe, expect, test } from "vitest";

import { detectMiddlewareRuntime } from "./middleware.js";

const createdDirs: string[] = [];

function createProjectWithNextOutput(): string {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "opennext-middleware-"));
	createdDirs.push(projectDir);

	fs.mkdirSync(path.join(projectDir, ".next", "server"), { recursive: true });
	fs.writeFileSync(path.join(projectDir, "proxy.js"), "export function proxy() { return null; }\n");

	return projectDir;
}

function writeManifest(projectDir: string, fileName: string, content: unknown): void {
	const serverPath = path.join(projectDir, ".next", "server", fileName);
	fs.writeFileSync(serverPath, JSON.stringify(content));
}

function toBuildOptions(projectDir: string): BuildOptions {
	return {
		appBuildOutputPath: projectDir,
	} as BuildOptions;
}

afterEach(() => {
	for (const dir of createdDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("detectMiddlewareRuntime", () => {
	test("returns node for proxy.js (Node middleware) build output", () => {
		const projectDir = createProjectWithNextOutput();

		writeManifest(projectDir, "middleware-manifest.json", {
			middleware: {},
		});
		writeManifest(projectDir, "functions-config-manifest.json", {
			functions: {
				"/_middleware": {
					runtime: "nodejs",
					file: "proxy.js",
				},
			},
		});

		expect(detectMiddlewareRuntime(toBuildOptions(projectDir))).toBe("node");
	});

	test("returns edge when middleware manifest is present", () => {
		const projectDir = createProjectWithNextOutput();

		writeManifest(projectDir, "middleware-manifest.json", {
			middleware: {
				"/": {
					files: ["server/edge.js"],
				},
			},
		});
		writeManifest(projectDir, "functions-config-manifest.json", {
			functions: {
				"/_middleware": {
					runtime: "nodejs",
					file: "proxy.js",
				},
			},
		});

		expect(detectMiddlewareRuntime(toBuildOptions(projectDir))).toBe("edge");
	});

	test("returns none when no middleware is present", () => {
		const projectDir = createProjectWithNextOutput();

		writeManifest(projectDir, "middleware-manifest.json", {
			middleware: {},
		});
		writeManifest(projectDir, "functions-config-manifest.json", {
			functions: {},
		});

		expect(detectMiddlewareRuntime(toBuildOptions(projectDir))).toBe("none");
	});
});

import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import importPlugin from "eslint-plugin-import";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
	globalIgnores([
		"**/dist/**",
		"**/test-snapshots/**",
		"**/test-fixtures/**",
	]),
	{
		languageOptions: {
			globals: globals.node,
		},
	},
	js.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
	},
	{
		name: "open-next",
		plugins: {
			unicorn: eslintPluginUnicorn,
			"simple-import-sort": simpleImportSort,
			import: importPlugin,
		},
		rules: {
			"@typescript-eslint/ban-ts-comment": "warn",
			"unicorn/prefer-node-protocol": "error",
			"simple-import-sort/imports": "error",
			"simple-import-sort/exports": "error",
			"import/first": "error",
			"import/newline-after-import": "error",
			"import/no-duplicates": "error",
		},
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			"import/extensions": ["error", "always", { checkTypeImports: true }],
		},
	},
]);

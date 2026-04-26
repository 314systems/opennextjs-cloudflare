import { MathJaxFiraFont } from "@mathjax/mathjax-fira-font/mjs/svg.js";
import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
// @ts-expect-error: no types for rehype-mathjax
import rehypeMathjax from "rehype-mathjax";
import remarkMath from "remark-math";
/**
 * Compiles MDX source code into a React component.
 * ☢️ Danger: it's called evaluate because it evals JavaScript.
 */
export async function compileMdx(source: string) {
	// ☢️ Danger: it's called evaluate because it evals JavaScript.
	const { default: MDXContent, frontmatter } = await evaluate(source, {
		...runtime,
		baseUrl: import.meta.url,
		rehypePlugins: [
			[
				rehypeMathjax,
				{
					svg: {
						fontData: MathJaxFiraFont,
					},
				},
			],
		],
		remarkPlugins: [remarkMath],
	});

	return { MDXContent, frontmatter };
}

import { cache } from "react";
import { compileMdx } from "../lib/mdx";

const getMathDoc = cache(async () => {
	const source = String.raw`	
$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$

$$
\left[ -\frac{\hbar^2}{2m}\nabla^2 + V(\mathbf{r}) \right]\Psi(\mathbf{r}) = E\Psi(\mathbf{r})
$$
`;
	const { MDXContent } = await compileMdx(source);
	return { MDXContent };
});
export default function Home() {
	return (
		<main className="p-4">
			<h1 className="text-2xl font-bold mb-4">MathJax Example</h1>
			<div className="prose">
				{getMathDoc().then(({ MDXContent }) => (
					<MDXContent />
				))}
			</div>
		</main>
	);
}

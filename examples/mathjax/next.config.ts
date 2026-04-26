import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typescript: { ignoreBuildErrors: true },
	serverExternalPackages: ["@mathjax/src"],
};

initOpenNextCloudflareForDev();

export default nextConfig;

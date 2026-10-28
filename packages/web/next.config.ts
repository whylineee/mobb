import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "export",
  poweredByHeader: false,
  images: { unoptimized: true },
  devIndicators: false,
  transpilePackages: ["@agentwatch/shared"],
};
export default nextConfig;

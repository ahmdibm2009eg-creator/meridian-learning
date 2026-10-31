import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Test builds are isolated into .next-test (NEXT_DIST_DIR=1 → ".next-test")
  // so they never clobber the concurrently running dev server's .next cache.
  distDir: process.env.NEXT_DIST_DIR === "1" ? ".next-test" : ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  watchOptions: {
    pollIntervalMs: 1000,
  },
};

export default nextConfig;

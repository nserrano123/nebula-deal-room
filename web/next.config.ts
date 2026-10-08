import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra and pg run only on the server; keep them out of the bundle.
  serverExternalPackages: ["@mastra/core"],
};

export default nextConfig;

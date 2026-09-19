import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded Postgres used for local development loads its WASM from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

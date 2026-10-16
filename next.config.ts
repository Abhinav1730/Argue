import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  experimental: { optimizePackageImports: ["@phosphor-icons/react"] },
};
export default config;

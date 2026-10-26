import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  experimental: { cpus: 2 },
  transpilePackages: ["@pingo/core", "@pingo/ui"],
  serverExternalPackages: ["pg", "web-push"],
  poweredByHeader: false,
};
export default config;

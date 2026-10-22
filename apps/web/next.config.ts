import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@pingo/core", "@pingo/ui"],
  serverExternalPackages: ["pg", "web-push"],
  poweredByHeader: false,
};
export default config;

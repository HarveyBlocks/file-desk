import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Runtime content must never be copied into a deployment artifact.
  outputFileTracingExcludes: { "/*": ["**/data/**/*", "**/temp/**/*", "**/output/**/*"] },
  // Avoid generating resource pages at build time: data belongs to the running host.
  reactStrictMode: true,
};

export default config;

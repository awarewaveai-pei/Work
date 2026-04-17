import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // Public URL path behind Nginx (WordPress owns `/`).
  basePath: "/admin",
  // Keep file tracing scoped to this app (avoid parent monorepo lockfile warnings in Docker / CI).
  outputFileTracingRoot: path.join(__dirname)
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});

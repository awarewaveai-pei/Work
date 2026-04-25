import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // app.aware-wave.com routes to this container root via the system reverse proxy (Nginx in phase1).
  // basePath is not needed — routing is handled at the domain/edge layer.
  // Keep file tracing scoped to this app (avoid parent monorepo lockfile warnings in Docker / CI).
  outputFileTracingRoot: path.join(__dirname)
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});

import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // app.aware-wave.com proxies directly to this container root via Apache ProxyPass.
  // basePath is not needed — Apache handles the domain-level routing.
  // Keep file tracing scoped to this app (avoid parent monorepo lockfile warnings in Docker / CI).
  outputFileTracingRoot: path.join(__dirname)
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});

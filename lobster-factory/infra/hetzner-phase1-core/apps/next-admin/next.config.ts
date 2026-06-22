import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // app.aware-wave.com routes to this container root via the system reverse proxy (Nginx in phase1).
  // basePath is not needed — routing is handled at the domain/edge layer.
  // Keep file tracing scoped to this app (avoid parent monorepo lockfile warnings in Docker / CI).
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config) => {
    // ssh2 (wp-update SSH route) lazily require()s two OPTIONAL native accelerators —
    // `cpu-features` and a prebuilt `crypto/build/Release/sshcrypto.node` — inside try/catch,
    // falling back to pure JS when absent (which is always, on our node:20-alpine image).
    // webpack flags the unresolved optional requires as warnings on every build. They are
    // benign, so silence ONLY these two patterns so genuine warnings stay visible.
    // Deliberately NOT using serverExternalPackages: keeping ssh2 webpack-bundled preserves the
    // proven runtime (bundle + the Dockerfile's explicit node_modules/ssh2 copy) byte-for-byte;
    // this only filters log noise, it does not change bundling behaviour.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /ssh2/, message: /Can't resolve 'cpu-features'/ },
      { module: /ssh2/, message: /Can't resolve '\.\/crypto\/build\/Release\/sshcrypto\.node'/ },
    ];
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});

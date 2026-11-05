import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";
import { UNVERSIONED_PUBLIC_DIRS } from "./lib/public-asset-cache";

const nextConfig: NextConfig = {
  output: "standalone",
  // app.aware-wave.com routes to this container root via the system reverse proxy (Nginx in phase1).
  // basePath is not needed — routing is handled at the domain/edge layer.
  // Keep file tracing scoped to this app (avoid parent monorepo lockfile warnings in Docker / CI).
  outputFileTracingRoot: path.join(__dirname),
  // sg-deploy runs `npm run typecheck` (next typegen + tsc, the same route-type validation next build does) as a gate
  // before the image build and then passes NEXT_TYPECHECK_DONE=1, so the build skips its second, ~60s copy. Any
  // other build (local, CI) still checks.
  typescript: { ignoreBuildErrors: process.env.NEXT_TYPECHECK_DONE === "1" },
  eslint: { ignoreDuringBuilds: process.env.NEXT_TYPECHECK_DONE === "1" },
  // /vector-pro/*: VectorCraft's web build. On the host nginx serves it before a request reaches this app, so production
  // sets no VECTOR_PRO_DEV_ORIGIN and gets no rewrite. Locally it points at a static server (e.g. http://127.0.0.1:8766)
  // whose root holds what nginx's alias /srv/vector-pro/ holds: /vector-pro/current/x -> <origin>/current/x.
  // Our dock lives at /vector-pro-dock/ (public/), outside this prefix, so neither nginx nor this rewrite takes it.
  // The old Vector Editor retired 2026-11-05 (R0-PLAN C7.3): its page and file answer with the professional editor.
  async redirects() {
    return [
      { source: "/tools/vector-editor", destination: "/tools/vector-pro", permanent: true },
      { source: "/vector-editor.html", destination: "/tools/vector-pro", permanent: true },
    ];
  },
  // Our own editor modules and shared styles keep fixed, unversioned URLs (ES module imports between them can't carry a
  // build hash), and Cloudflare's 4 h browser TTL replaces Next's max-age=0 on them: after a deploy a browser kept the old
  // dock for hours, and could mix old and new modules. no-cache = revalidate every load (a 304 when unchanged); private:
  // these are login-gated, so no shared cache keeps them (Cloudflare keeps an origin `private`).
  async headers() {
    return UNVERSIONED_PUBLIC_DIRS.map((dir) => ({
      source: `/${dir}/:path*`,
      headers: [{ key: "Cache-Control", value: "private, no-cache" }],
    }));
  },
  async rewrites() {
    const origin = process.env.VECTOR_PRO_DEV_ORIGIN?.trim().replace(/\/+$/, "");
    return origin ? [{ source: "/vector-pro/:path*", destination: `${origin}/:path*` }] : [];
  },
  webpack: (config) => {
    // @workflows alias: makes packages/workflows importable from next-admin routes.
    // In Docker build the monorepo root is outside the build context, so sg-deploy
    // rsyncs packages/workflows/src/ into apps/next-admin/packages/workflows/src/.
    // Locally that subdirectory doesn't exist, so we fall back to the monorepo path.
    const fs = require("fs");
    const localPkg = path.join(__dirname, "packages/workflows/src");
    const monoPkg = path.join(__dirname, "../../../../packages/workflows/src");
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string> | undefined ?? {}),
      "@workflows": fs.existsSync(localPkg) ? localPkg : monoPkg,
    };

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

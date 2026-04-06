import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep file tracing scoped to this app (avoid parent monorepo lockfile warnings in Docker / CI).
  outputFileTracingRoot: path.join(__dirname)
};

export default nextConfig;

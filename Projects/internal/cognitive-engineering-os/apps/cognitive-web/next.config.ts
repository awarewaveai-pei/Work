import type { NextConfig } from "next";

const apiOrigin = process.env.COS_API_ORIGIN ?? "http://127.0.0.1:8420";
const nextConfig: NextConfig = {
  output: "standalone",
  rewrites: async () => [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }],
  // the first 示範分析 lived at a fixed address; links to it keep working (the demos now live at /projects/demo/<method>)
  redirects: async () => [{ source: "/projects/demo/iceberg", destination: "/projects/demo/systems.iceberg_model", permanent: true }],
};

export default nextConfig;

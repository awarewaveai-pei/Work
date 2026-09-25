import type { NextConfig } from "next";

const apiOrigin = process.env.COS_API_ORIGIN ?? "http://127.0.0.1:8420";
const nextConfig: NextConfig = {
  output: "standalone",
  rewrites: async () => [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }],
};

export default nextConfig;

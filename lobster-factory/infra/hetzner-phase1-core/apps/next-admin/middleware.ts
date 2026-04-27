import { NextResponse, type NextRequest } from "next/server";

const CLAIM_HEADERS = ["x-ops-claims-role", "x-user-role", "x-clerk-role"] as const;
const SIMULATED_HEADER = "x-ops-simulated-role";
const PROXY_AUTH_HEADER = "x-ops-proxy-auth";

function isValidRole(value: string | null): boolean {
  if (!value) return false;
  const role = value.trim().toLowerCase();
  return role === "owner" || role === "admin" || role === "operator" || role === "viewer";
}

function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production";
}

function hasTrustedProxyAuth(request: NextRequest): boolean {
  const expected = process.env.OPS_PROXY_SHARED_SECRET;
  if (!expected) return !isProductionLike();
  return request.headers.get(PROXY_AUTH_HEADER) === expected;
}

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);

  const trustedProxy = hasTrustedProxyAuth(request);
  const claimRole = headers.get("x-ops-claims-role") ?? headers.get("x-user-role") ?? headers.get("x-clerk-role");

  for (const header of CLAIM_HEADERS) headers.delete(header);
  if (!trustedProxy) headers.delete(SIMULATED_HEADER);

  if (trustedProxy && isValidRole(claimRole)) {
    headers.set("x-ops-claims-role", claimRole!.trim().toLowerCase());
  }

  return NextResponse.next({
    request: {
      headers,
    },
  });
}

export const config = {
  matcher: ["/api/ops/:path*", "/ops/:path*", "/api/ai/:path*"],
};

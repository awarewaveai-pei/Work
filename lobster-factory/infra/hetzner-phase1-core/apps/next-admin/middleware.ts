import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient, isSupabaseAuthConfigured } from "@/lib/supabase/ssr";
import type { OpsRole } from "@/lib/ops-contracts";

// Identity layer for the admin console (Supabase Auth, email+password).
// Flow: validate the Supabase session cookie → resolve role from the user's
// server-controlled app_metadata.ops_role → inject `x-ops-claims-role` so every existing
// RBAC consumer (lib/ops-role.ts) keeps working unchanged. No session → /login (pages) or
// 401 (APIs). Fails CLOSED: any auth-system failure denies access, never exposes the console.

const CLAIM_HEADERS = ["x-ops-claims-role", "x-user-role", "x-clerk-role"] as const;
const SIMULATED_HEADER = "x-ops-simulated-role";

// Server-to-server endpoints that authenticate with their own Bearer token at the route
// level (verifyIngestToken / Uptime-Kuma health). They must stay reachable without a
// browser session, so they skip the session gate here.
const PUBLIC_API_PATHS = new Set<string>([
  "/api/ops/summary",
  "/api/ops/inbox/health",
  "/api/ops/inbox/digest",
  "/api/ops/inbox/incidents",
]);

function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production";
}

function resolveRoleFromUser(appMetadata: Record<string, unknown> | undefined): OpsRole {
  const raw = String(appMetadata?.ops_role ?? "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "operator" || raw === "viewer") {
    return raw;
  }
  // Authenticated but no role assigned → least privilege.
  return "viewer";
}

function blockedResponse(request: NextRequest, reason: string): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized", reason }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public server-to-server endpoints (own Bearer auth) — skip the session gate.
  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Auth not configured: allow in dev (the simulated-role fallback in ops-role.ts still
  // works downstream), but fail CLOSED in production — never expose the console without a
  // working identity layer.
  if (!isSupabaseAuthConfigured()) {
    if (isProductionLike()) {
      return blockedResponse(request, "auth_not_configured");
    }
    return NextResponse.next();
  }

  const { supabase, response } = createSupabaseMiddlewareClient(request);

  let appMetadata: Record<string, unknown> | undefined;
  let authed = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      authed = true;
      appMetadata = data.user.app_metadata as Record<string, unknown> | undefined;
    }
  } catch {
    // Network / auth-server failure → fall through to fail-closed below.
  }

  if (!authed) {
    return blockedResponse(request, "unauthenticated");
  }

  const role = resolveRoleFromUser(appMetadata);

  // Strip any client-supplied identity headers (anti-spoof), then inject the server-resolved
  // role for downstream RBAC.
  const requestHeaders = new Headers(request.headers);
  for (const header of CLAIM_HEADERS) requestHeaders.delete(header);
  requestHeaders.delete(SIMULATED_HEADER);
  requestHeaders.set("x-ops-claims-role", role);

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  // Preserve any refreshed-session cookies the Supabase client wrote onto `response`.
  for (const cookie of response.cookies.getAll()) finalResponse.cookies.set(cookie);
  return finalResponse;
}

export const config = {
  // Protect the ENTIRE console (previous matcher only covered /ops/* + a few API prefixes,
  // leaving Dashboard "/", /build, /onboard, /ops-console publicly loadable). Exclude only:
  // Next static assets, the login page, and the auth + webhook endpoints (own auth).
  // PUBLIC_API_PATHS above further exempts the server-to-server Bearer endpoints under /api/ops/*.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth|api/webhooks).*)"],
};

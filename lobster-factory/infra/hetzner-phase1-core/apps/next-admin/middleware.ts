import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient, isSupabaseAuthConfigured } from "@/lib/supabase/ssr";
import type { OpsRole } from "@/lib/ops-contracts";

// Identity layer for the admin console (Supabase Auth, email+password).
// Browser flow: validate the Supabase session cookie → resolve role from the user's
// server-controlled app_metadata.ops_role → inject `x-ops-claims-role` so every existing
// RBAC consumer (lib/ops-role.ts) keeps working unchanged. No session → /login (pages) or
// 401 (APIs). Fails CLOSED.
//
// Server-to-server callers carry their OWN token (not a browser session) and must not be
// gated: webhooks + /api/internal/* are excluded in the matcher; the /api/ops/* Bearer
// endpoints are in PUBLIC_API_PATHS; the WP automation (wp-update / wp-report) authenticates
// with x-ops-sync-key. In ALL cases client-supplied identity headers are stripped first, so
// authorization on those routes comes only from their own token, never a spoofable header.

const CLAIM_HEADERS = ["x-ops-claims-role", "x-user-role", "x-clerk-role"] as const;
const SIMULATED_HEADER = "x-ops-simulated-role";
const SYNC_KEY_HEADER = "x-ops-sync-key";

// /api/ops/* endpoints that authenticate server-to-server with their own Bearer token
// (verifyIngestToken / Uptime-Kuma health probe) and carry no browser session.
const PUBLIC_API_PATHS = new Set<string>([
  "/api/ops/summary",
  "/api/ops/inbox/health",
  "/api/ops/inbox/digest",
  "/api/ops/inbox/incidents",
  "/api/ops/probe",
  // Public health endpoint (nginx has a dedicated no-auth location for it; used by smoke +
  // external uptime monitors). Its expensive SSH/GitHub probes are TTL-cached (see the route)
  // so public reachability is not a DoS lever.
  "/api/ops/repairs/health",
]);

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// WP plugin automation (update-client-wp-plugins.ps1 → wp-update / wp-report) authenticates
// server-to-server with x-ops-sync-key == OPS_PROXY_SHARED_SECRET. Honour it here so the
// automation isn't blocked by the session gate; the route enforces its own check too.
function hasValidSyncKey(request: NextRequest): boolean {
  const expected = process.env.OPS_PROXY_SHARED_SECRET;
  if (!expected) return false;
  const provided = request.headers.get(SYNC_KEY_HEADER);
  if (!provided) return false;
  return timingSafeEqualStr(provided, expected);
}

function resolveRoleFromUser(appMetadata: Record<string, unknown> | undefined): OpsRole {
  const raw = String(appMetadata?.ops_role ?? "").trim().toLowerCase();
  if (raw === "owner" || raw === "admin" || raw === "operator" || raw === "viewer") {
    return raw;
  }
  // Authenticated but no role assigned → least privilege.
  return "viewer";
}

function blockedResponse(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Anti-spoof: strip ALL client-supplied identity headers up-front, before any pass-through
  // decision. No path (public, sync-key, dev, or gated) may carry a spoofed role.
  const baseHeaders = new Headers(request.headers);
  for (const header of CLAIM_HEADERS) baseHeaders.delete(header);
  baseHeaders.delete(SIMULATED_HEADER);
  const passthrough = () => NextResponse.next({ request: { headers: baseHeaders } });

  // Server-to-server: own-Bearer /api/ops endpoints, or a valid x-ops-sync-key automation
  // call. Authorization is enforced by the route's own token check.
  if (PUBLIC_API_PATHS.has(pathname) || hasValidSyncKey(request)) {
    return passthrough();
  }

  // Auth not configured: explicit dev-only convenience (simulated-role fallback still works
  // downstream). Production OR unset NODE_ENV fails CLOSED.
  if (!isSupabaseAuthConfigured()) {
    if (isDevelopment()) return passthrough();
    return blockedResponse(request);
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
    // Network / auth-server failure → fail closed below.
  }

  if (!authed) {
    return blockedResponse(request);
  }

  const role = resolveRoleFromUser(appMetadata);
  baseHeaders.set("x-ops-claims-role", role);

  const finalResponse = NextResponse.next({ request: { headers: baseHeaders } });
  // Preserve any refreshed-session cookies the Supabase client wrote onto `response`.
  for (const cookie of response.cookies.getAll()) finalResponse.cookies.set(cookie);
  return finalResponse;
}

export const config = {
  // Protect the ENTIRE console. Exclude: Next static assets, the login page, and the
  // server-to-server endpoint families that carry their own auth (auth/webhooks/internal).
  // PUBLIC_API_PATHS + the x-ops-sync-key check above exempt the remaining /api/ops/*
  // server-to-server callers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth|api/webhooks|api/internal|tarot-frames).*)"],
};

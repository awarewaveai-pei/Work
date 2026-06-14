import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient, isSupabaseAuthConfigured } from "@/lib/supabase/ssr";
import { getFreshCachedRole, consumeStaleCachedRole, cacheValidatedRole } from "@/lib/supabase/session-cache";
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

// The @supabase/ssr session lives in cookie(s) named `sb-<ref>-auth-token`, chunked as
// `…-auth-token.0` / `.1` when large. Their combined value uniquely identifies the current
// token state and rotates on refresh — a stable, self-invalidating cache key.
const AUTH_COOKIE_RE = /^sb-.*-auth-token(\.\d+)?$/;
function readSessionCacheKey(request: NextRequest): string | null {
  const parts = request.cookies
    .getAll()
    .filter(c => AUTH_COOKIE_RE.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => `${c.name}=${c.value}`);
  return parts.length > 0 ? parts.join("|") : null;
}

// Distinguish "couldn't reach / was throttled by the auth server" (transient) from
// "the token is absent or invalid" (authoritative). Only transient failures may fall back to a
// recently-cached validation; a real auth rejection always fails closed.
function isTransientAuthError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; status?: number; message?: string };
  if (e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504) return true;
  if (e.name === "AuthRetryableFetchError" || e.name === "AuthUnknownError") return true;
  // Substring fallback only when there is NO authoritative HTTP status (status 0/undefined =
  // the request never got a real auth verdict). This prevents a genuine 4xx auth REJECTION whose
  // message happens to contain one of these words from being misclassified as transient.
  if (e.status === undefined || e.status === 0) {
    const msg = (e.message ?? "").toLowerCase();
    return msg.includes("rate limit") || msg.includes("fetch failed")
      || msg.includes("network") || msg.includes("timeout");
  }
  return false;
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

  const sessionKey = readSessionCacheKey(request);

  // Fast path: this exact token was validated over the network moments ago. Re-use that result
  // and skip the auth call. This collapses a page-load's parallel sub-requests into ~1 upstream
  // validation, which is what prevents the burst from tripping Cloudflare's per-IP rate limit on
  // the auth host (the root cause of logged-in users being bounced to /login).
  if (sessionKey) {
    const fresh = getFreshCachedRole(sessionKey);
    if (fresh !== null) {
      baseHeaders.set("x-ops-claims-role", fresh);
      return NextResponse.next({ request: { headers: baseHeaders } });
    }
  }

  const { supabase, response } = createSupabaseMiddlewareClient(request);

  let role: OpsRole | null = null;
  let refreshedCookies = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      role = resolveRoleFromUser(data.user.app_metadata as Record<string, unknown> | undefined);
      refreshedCookies = true;
      if (sessionKey) cacheValidatedRole(sessionKey, role);
    } else if (error && sessionKey && isTransientAuthError(error)) {
      // Auth server unreachable / throttled — don't punish a logged-in user. Trust the last
      // good validation for THIS token if it is still within the stale window and under cap.
      role = consumeStaleCachedRole(sessionKey);
    }
  } catch (err) {
    if (sessionKey && isTransientAuthError(err)) {
      role = consumeStaleCachedRole(sessionKey);
    }
    // Any other throw → role stays null → fail closed below.
  }

  if (role === null) {
    return blockedResponse(request);
  }

  baseHeaders.set("x-ops-claims-role", role);

  const finalResponse = NextResponse.next({ request: { headers: baseHeaders } });
  // Preserve any refreshed-session cookies the Supabase client wrote onto `response`.
  if (refreshedCookies) {
    for (const cookie of response.cookies.getAll()) finalResponse.cookies.set(cookie);
  }
  return finalResponse;
}

export const config = {
  // Protect the ENTIRE console. Exclude: Next static assets, the login page, and the
  // server-to-server endpoint families that carry their own auth (auth/webhooks/internal).
  // PUBLIC_API_PATHS + the x-ops-sync-key check above exempt the remaining /api/ops/*
  // server-to-server callers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth|api/webhooks|api/internal|tarot-frames|vector-editor.html).*)"],
};

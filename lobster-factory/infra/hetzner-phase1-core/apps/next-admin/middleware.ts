import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient, isSupabaseAuthConfigured, type RefreshedCookie } from "@/lib/supabase/ssr";
import { getFreshCachedRole, consumeStaleCachedRole, cacheValidatedRole, type CachedIdentity } from "@/lib/supabase/session-cache";
import type { OpsRole } from "@/lib/ops-contracts";
import { doorForHost, isAnonymousPath, isProductPath, portalHost, productPageOwner, routeOnProductDoor, type Door } from "@/lib/portal/doors";

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

const CLAIM_HEADERS = [
  "x-ops-claims-role", "x-user-role", "x-clerk-role",
  // Tenant identity — set only by this middleware; strip client-supplied values.
  "x-ops-user-kind", "x-ops-org-id", "x-ops-user-id",
] as const;
const SIMULATED_HEADER = "x-ops-simulated-role";
const SYNC_KEY_HEADER = "x-ops-sync-key";

// /api/ops/* endpoints that authenticate server-to-server with their own Bearer token
// (verifyIngestToken / Uptime-Kuma health probe) and carry no browser session.
export const PUBLIC_API_PATHS = new Set<string>([
  "/api/ops/summary",
  "/api/ops/inbox/health",
  "/api/ops/inbox/digest",
  "/api/ops/inbox/incidents",
  "/api/ops/probe",
  // Public health endpoint (nginx has a dedicated no-auth location for it; used by smoke +
  // external uptime monitors). Its expensive SSH/GitHub probes are TTL-cached (see the route)
  // so public reachability is not a DoS lever.
  "/api/ops/repairs/health",
  // Public intake door for FluentForm webhook → Supabase dual-write.
  // Auth is a narrow Bearer token (ONBOARDING_PUBLIC_INTAKE_TOKEN), not the session cookie.
  // Rate-limited to 5 req/10 min; never triggers builds.
  "/api/onboarding/intake-public",
  // Browser-origin public intake (no bearer token; rate-limited by global submit count).
  // Powers the public form at /intake — same data pipeline as intake-public.
  "/api/onboarding/intake-browser",
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

/** Extract tenant identity from app_metadata (server-controlled, not user-tamperable). */
function resolveTenantFromMeta(meta: Record<string, unknown> | undefined): Pick<CachedIdentity, "userKind" | "orgId"> {
  const userKind = String(meta?.user_kind ?? "").toLowerCase() === "client" ? "client" : "staff";
  const orgId = typeof meta?.org_id === "string" ? meta.org_id.trim() : "";
  return { userKind, orgId };
}

/** Inject identity headers. Centralised so fresh-cache, network, and stale paths all stay in sync. */
function applyIdentityHeaders(headers: Headers, identity: CachedIdentity): void {
  headers.set("x-ops-claims-role", identity.role);
  headers.set("x-ops-user-kind", identity.userKind);
  if (identity.orgId) headers.set("x-ops-org-id", identity.orgId);
  // the auth user id (ADR 018 §3): per-person grants such as social_brand_members key on it
  if (identity.userId) headers.set("x-ops-user-id", identity.userId);
}

// Exported (alongside the other pure helpers below) so verify-recent's tests can exercise
// them directly (critic finding M-4, 2026-08-29): the logic that took portal.aware-wave.com
// down live was, until this fix, covered by nothing but a comment. Next.js's build only treats
// `middleware` and `config` as special exports from this file -- extra named exports are inert
// for routing and exist purely for testability.
export function isApiPath(pathname: string): boolean {
  // Critic finding (2026-08-29, minor): the original check only matched "/api/", so
  // "/portal/api/*" fell through to the HTML redirect branch below and a fetch() caller would
  // try to JSON-parse a login page. Both API path families get a JSON error here.
  return pathname.startsWith("/api/") || pathname.startsWith("/portal/api/");
}

// Critic finding C-A (2026-08-29, Critical, confirmed LIVE): before next-admin had /portal/*
// routes deployed but nginx already rewrote portal.aware-wave.com traffic to /portal/*, the OLD
// middleware treated /portal/login as a protected path, redirected here, and this function built
// `?next=/portal/login`. The browser followed it, nginx rewrote it AGAIN, the old middleware
// still didn't recognise /portal/login as public, and each hop appended another layer of
// `next=` -- an amplifying redirect loop that eventually 502'd on URL length, hitting the SAME
// container that serves app.aware-wave.com. PORTAL_PUBLIC_PATHS below prevents this specific
// case going forward, but the real fix is at the invariant level: this function must never
// build a redirect target that can re-enter this same gate carrying MORE state than the request
// that produced it, regardless of what any routing layer in front of it does or doesn't agree
// with this code about.
export function blockedResponse(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.url);
  const alreadyLoginShaped = pathname === "/login" || pathname === "/portal/login";
  const alreadyCarriesNext = new URLSearchParams(search).has("next");
  const candidateNext = pathname + search;
  if (!alreadyLoginShaped && !alreadyCarriesNext && candidateNext.length <= 512) {
    loginUrl.searchParams.set("next", candidateNext);
  }
  return NextResponse.redirect(loginUrl);
}

// Critic finding C2 (2026-08-29, Critical): every consumer of this middleware's identity
// headers was written when "authenticated" meant "AwareWave employee" — ~120 admin-console
// routes/pages have no per-route role check because that assumption made one unnecessary.
// portal.aware-wave.com/signup is the first mechanism that ever hands a valid Supabase session
// to an outside stranger, which retroactively turns that old assumption into a privilege-
// escalation hole: a portal customer's session would otherwise sail straight through every
// /ops/* page and API as an authenticated-but-roleless "viewer". Fixing this at the ~120
// individual routes is the patch-shaped answer; this is the one choke-point fix instead —
// a client identity may only reach /portal/* (and /login, matcher-excluded) -- or, on a product
// door (ADR 018), that product's own paths: isClientOutsideDoor. Applied to BOTH
// paths this middleware can return success from (the fast cache path and the slow
// verify-then-cache path) so neither can skip it.
// Critic finding (2026-08-29, minor, mirrors M-A's nginx-side boundary bug): a bare "/portal"
// (no trailing slash) is neither "/portal/" nor does startsWith("/portal/") match it, so it
// would escape this check entirely. Matches isPortalPath below, not a separate definition.
export function isPortalPath(pathname: string): boolean {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}

/** Which door the request came through (ADR 018); hosts come from config in lib/portal/doors.ts. */
export function doorOf(request: NextRequest): Door {
  return doorForHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "");
}

/** A client identity may use only the paths of the door it is on: a product door's own paths, else /portal/*. */
export function isClientOutsideDoor(pathname: string, userKind: string, door: Door): boolean {
  if (userKind !== "client") return false;
  return door.kind === "product" ? !isProductPath(pathname, door.product) : !isPortalPath(pathname);
}

function clientForbiddenResponse(request: NextRequest, cookiesToCopy: RefreshedCookie[] = []): NextResponse {
  const { pathname } = request.nextUrl;
  if (isApiPath(pathname)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Codex second-opinion finding 2 (2026-08-29, CONFIRMED): building this URL from
  // `request.url` preserves whatever host the BLOCKED request arrived on (e.g.
  // app.aware-wave.com, since that is exactly the host this response exists to reject a
  // client identity from). The follow-up request would then hit isWrongHostForPortal() on
  // that same wrong host and 404 -- a redirect straight into a dead end. Build an ABSOLUTE
  // URL on the correct host instead, and use the browser-visible unprefixed path ("/launcher",
  // not "/portal/launcher") -- nginx's idempotent rewrite adds that prefix transparently, same
  // as every other browser-facing portal link in this codebase.
  const forbidden = NextResponse.redirect(new URL("/launcher", `https://${portalHost()}`));
  // Critic finding (2026-08-29, minor): the success path below applies any rotated session
  // cookies from Supabase's refresh onto its response; this early return didn't, so a client
  // identity blocked here right when their token happened to rotate could keep a stale
  // refresh token and get logged out on their next request. Mirror the same copy here.
  for (const cookie of cookiesToCopy) forbidden.cookies.set(cookie.name, cookie.value, cookie.options);
  return forbidden;
}

// Critic finding C3 (2026-08-29, Critical): Next.js file-based routing is host-agnostic --
// /portal/* resolves identically regardless of which hostname the request arrived on, and
// app.aware-wave.com and portal.aware-wave.com are proxied to the SAME next-admin container.
// Verified live: `curl -X POST https://app.aware-wave.com/portal/api/signup` reached this app
// (307, only because THIS middleware's matcher predates deployment -- the route itself has no
// host awareness at all). Deploying the /portal/* code is therefore sufficient to expose portal
// signup on the admin console's own public domain, independent of whether the "gated" DNS/cert/
// nginx steps for portal.aware-wave.com (design doc §7 steps 5-7) have happened yet. This check
// is the single choke point that closes that regardless of nginx config on either host.
const PORTAL_PUBLIC_PATHS = new Set<string>(["/portal/login", "/portal/signup", "/portal/api/signup"]);

export function isWrongHostForPortal(request: NextRequest): boolean {
  if (!isPortalPath(request.nextUrl.pathname)) return false;
  return doorOf(request).kind !== "portal" && !isDevelopment();
}

/** Same rule for a product's page prefix (e.g. /social): it answers only on that product's own door. Staff use the
 *  product at /tools/<product> on the staff door. */
export function isWrongHostForProductPage(request: NextRequest): boolean {
  const owner = productPageOwner(request.nextUrl.pathname);
  if (!owner || isDevelopment()) return false;
  const door = doorOf(request);

  return !(door.kind === "product" && door.product.key === owner.key);
}

// CSRF: a cookie-authenticated write must come from this app's own pages. Staging sites live on aware-wave.com,
// which is SAME-SITE to app.aware-wave.com, so the SameSite=Lax session cookie rides along on their POSTs -- a
// script on a client's staging WordPress could act as the logged-in operator. Only requests that reach the
// session gate are checked (see the call site): token-authenticated callers never rely on the cookie. Page POSTs
// are Next server actions: Next compares their Origin with the host itself but lets a request WITHOUT Origin
// through (next/dist/server/app-render/action-handler.js), so do not read that as fail-closed.
// A write is allowed only on positive same-origin evidence.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
function firstHeaderValue(request: NextRequest, name: string): string {
  return (request.headers.get(name) ?? "").split(",")[0].trim().toLowerCase();
}
export function isCrossSiteWrite(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
  if (!isApiPath(request.nextUrl.pathname)) return false;
  // Only "same-origin" counts: "none" is what a resubmitted form can carry (Chromium issue 40638997), and no
  // legitimate API write is typed into the address bar.
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin";
  // Browsers without Fetch Metadata: fall back to Origin (scheme + host). Neither header: a non-browser client
  // is fine without a session cookie (it gets 401 anyway); with one, it is an old browser -> refuse.
  const origin = request.headers.get("origin");
  if (!origin) return readSessionCacheKey(request) !== null;
  const host = firstHeaderValue(request, "x-forwarded-host") || firstHeaderValue(request, "host");
  const proto = firstHeaderValue(request, "x-forwarded-proto") || request.nextUrl.protocol.replace(/:$/, "");
  try {
    const o = new URL(origin);
    return o.host.toLowerCase() !== host || o.protocol.replace(/:$/, "") !== proto;
  } catch {
    return true; // "null" (sandboxed frame, file:, cross-origin redirect) or garbage from a browser context
  }
}

export async function middleware(request: NextRequest) {
  const door = doorOf(request);

  if (door.kind === "probe") {
    // Preserve compose's wget / -> /login and sg-deploy's real API smoke, without admitting staff pages.
    if (request.nextUrl.pathname === "/" && request.method === "GET") return blockedResponse(request);
    if (request.nextUrl.pathname !== "/api/ops/summary" || request.method !== "GET") {
      return new NextResponse(null, { status: 404 });
    }
  }

  if (door.kind === "none" || isWrongHostForPortal(request) || isWrongHostForProductPage(request)) {
    return new NextResponse(null, { status: 404 });
  }

  // A product door serves only its own paths (ADR 018 §2): other APIs 404, every other page path is served under the
  // product's page prefix. Every check below reads the path that will actually be served.
  let rewriteTo: string | null = null;
  if (door.kind === "product") {
    const route = routeOnProductDoor(request.nextUrl.pathname, door.product);
    if (route.action === "not_found") return new NextResponse(null, { status: 404 });
    if (route.action === "rewrite") rewriteTo = route.pathname;
  }
  const pathname = rewriteTo ?? request.nextUrl.pathname;

  // Anti-spoof: strip ALL client-supplied identity headers up-front, before any pass-through
  // decision. No path (public, sync-key, dev, or gated) may carry a spoofed role.
  const baseHeaders = new Headers(request.headers);
  for (const header of CLAIM_HEADERS) baseHeaders.delete(header);
  baseHeaders.delete(SIMULATED_HEADER);
  const forward = (headers: Headers) => rewriteTo
    ? NextResponse.rewrite(new URL(rewriteTo + request.nextUrl.search, request.url), { request: { headers } })
    : NextResponse.next({ request: { headers } });
  const passthrough = () => forward(baseHeaders);

  // A product's no-login paths (registry door.anonymous, e.g. the public smart link page): only on that product's door
  // (isWrongHostForProductPage above 404s them on every other door) and without any identity header.
  if (door.kind === "product" && isAnonymousPath(pathname, door.product)) {
    return passthrough();
  }

  // Portal's own pre-auth pages (no session exists yet by definition, same reasoning as the
  // admin console's own /login exclusion). Handled HERE inside the middleware body — NOT via a
  // matcher exclusion — specifically so isWrongHostForPortal() above still runs for them. A
  // matcher exclusion skips this whole function, which would leave these three routes reachable
  // on ANY host (see C3 note above isWrongHostForPortal) with zero check at all.
  if (PORTAL_PUBLIC_PATHS.has(pathname)) {
    return passthrough();
  }

  // Server-to-server: own-Bearer /api/ops endpoints, or a valid x-ops-sync-key automation
  // call. Authorization is enforced by the route's own token check.
  if (PUBLIC_API_PATHS.has(pathname) || hasValidSyncKey(request)) {
    return passthrough();
  }

  // Everything below authenticates by the session cookie: refuse a cross-site write before touching it.
  if (isCrossSiteWrite(request)) {
    // Visible in the container log so a wrongly blocked legitimate caller shows up; never log cookies.
    console.warn(`[csrf] blocked ${request.method} ${pathname} sec-fetch-site=${request.headers.get("sec-fetch-site") ?? "-"} origin=${request.headers.get("origin") ?? "-"}`);
    return NextResponse.json({ error: "cross_site_request_blocked" }, { status: 403 });
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
  // All three identity headers (role + tenant) are injected from the cache so client users are
  // never silently elevated to staff on the fast path.
  if (sessionKey) {
    const fresh = getFreshCachedRole(sessionKey);
    if (fresh !== null) {
      if (isClientOutsideDoor(pathname, fresh.userKind, door)) return clientForbiddenResponse(request);
      applyIdentityHeaders(baseHeaders, fresh);
      return forward(baseHeaders);
    }
  }

  const { supabase, refreshedCookies } = createSupabaseMiddlewareClient(request);

  let identity: CachedIdentity | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      const meta = data.user.app_metadata as Record<string, unknown> | undefined;
      const role = resolveRoleFromUser(meta);
      const { userKind, orgId } = resolveTenantFromMeta(meta);
      identity = { role, userKind, orgId, userId: data.user.id };
      if (sessionKey) cacheValidatedRole(sessionKey, identity);
    } else if (error && sessionKey && isTransientAuthError(error)) {
      // Auth server unreachable / throttled — don't punish a logged-in user. Trust the last
      // good validation for THIS token if it is still within the stale window and under cap.
      identity = consumeStaleCachedRole(sessionKey);
    }
  } catch (err) {
    if (sessionKey && isTransientAuthError(err)) {
      identity = consumeStaleCachedRole(sessionKey);
    }
    // Any other throw → identity stays null → fail closed below.
  }

  if (identity === null) {
    return blockedResponse(request);
  }
  if (isClientOutsideDoor(pathname, identity.userKind, door)) {
    return clientForbiddenResponse(request, refreshedCookies);
  }

  applyIdentityHeaders(baseHeaders, identity);

  const finalResponse = forward(baseHeaders);
  // Apply any refreshed-session cookies (see M-1 fix in lib/supabase/ssr.ts for why this is a
  // plain array, not a captured NextResponse reference).
  for (const cookie of refreshedCookies) finalResponse.cookies.set(cookie.name, cookie.value, cookie.options);
  return finalResponse;
}

export const config = {
  // Protect the ENTIRE console. Exclude: Next static assets, the login page, and the
  // server-to-server endpoint families that carry their own auth (auth/webhooks/internal).
  // PUBLIC_API_PATHS + the x-ops-sync-key check above exempt the remaining /api/ops/*
  // server-to-server callers.
  // `intake` excluded: the public form at /intake needs no session (auth is in intake-browser API route).
  // `/portal/*` is DELIBERATELY NOT excluded here (unlike `login`/`intake` above) -- all of it,
  // including the pre-auth login/signup pages, runs through middleware() so isWrongHostForPortal()
  // and the PORTAL_PUBLIC_PATHS passthrough inside the function body both execute (see C3 comment
  // on isWrongHostForPortal for why a matcher-level exclusion would have silently skipped the
  // host check). `/portal/launcher` etc. reach the normal session gate below and get
  // x-ops-user-kind/x-ops-org-id for lib/tenant-guard.ts's requireClientOrg().
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|intake|api/auth|api/webhooks|api/internal|tarot-frames|edge-masks/|vector-editor.html).*)"],
};

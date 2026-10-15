// Service-account HTTP client for the Cognitive OS API
// (Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py), reached over the shared
// lobster-net docker network as http://cognitive-os-api:8420 -- never a public domain (no nginx
// vhost fronts it for server-to-server calls; see that repo's docker-compose.yml).
//
// Auth: POST /auth/login sets a `Secure` session cookie (main.py's login(), ~L696). Node's built-in
// fetch has NO cookie jar at all (nothing to disable), so the Secure flag is a non-issue as long as
// no tough-cookie-based wrapper (e.g. the `fetch-cookie` npm package) is introduced later here --
// such a wrapper WOULD silently drop this cookie over the plain-http internal network because it
// honours Secure literally. The cookie value is extracted and re-attached by hand below; do not
// replace that with a cookie-jar library.
//
// Env (server-only):
//   COGNITIVE_OS_API_BASE_URL  default http://cognitive-os-api:8420 (internal docker hostname)
//   COGNITIVE_OS_TENANT_ID     the service tenant created by ai_lego/apps/cli/bootstrap_service_identity.py
//   COGNITIVE_OS_SERVICE_EMAIL / COGNITIVE_OS_SERVICE_PASSWORD  that tenant's service-account credentials

type CognitiveOsOk<T> = { ok: true; value: T };
type CognitiveOsErr = { ok: false; error: string; status?: number };
export type CognitiveOsResult<T> = CognitiveOsOk<T> | CognitiveOsErr;

const DEFAULT_BASE_URL = "http://cognitive-os-api:8420";
// The browser-facing origin -- deliberately a different constant from DEFAULT_BASE_URL above (that
// one is the internal docker hostname this module's own server-to-server calls use, never reachable
// from a browser). Consumed by app/api/cognitive-os/open/route.ts to build the redirect Location a
// human's browser actually follows.
export const COGNITIVE_OS_PUBLIC_URL = "https://cognitive.aware-wave.com";
// Server-side session TTL is 12h (main.py SESSION_TTL / login() max_age=12*3600). Re-login an hour
// early rather than racing a request against the exact expiry instant.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_SAFETY_MARGIN_MS = 60 * 60 * 1000;

interface CognitiveOsConfig {
  baseUrl: string;
  tenantId: string;
  email: string;
  password: string;
}

let cachedCookie: { value: string; expiresAt: number } | null = null;

function config(): CognitiveOsConfig | null {
  const tenantId = process.env.COGNITIVE_OS_TENANT_ID;
  const email = process.env.COGNITIVE_OS_SERVICE_EMAIL;
  const password = process.env.COGNITIVE_OS_SERVICE_PASSWORD;
  if (!tenantId || !email || !password) return null;
  const baseUrl = (process.env.COGNITIVE_OS_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  return { baseUrl, tenantId, email, password };
}

export function isCognitiveOsConfigured(): boolean {
  return config() !== null;
}

async function login(cfg: CognitiveOsConfig): Promise<CognitiveOsResult<string>> {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: cfg.tenantId, email: cfg.email, password: cfg.password }),
    });
  } catch {
    return { ok: false, error: "cognitive_os_network_error" };
  }
  if (!res.ok) return { ok: false, error: `cognitive_os_login_failed_${res.status}`, status: res.status };
  // fetch never manages cookies itself (see file header) -- extract the Set-Cookie name=value pair
  // by hand. `.split(";")[0]` is exactly the `Cookie:` header value a later request needs.
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie?.split(";")[0];
  if (!cookie?.startsWith("cognitive_os_session=")) return { ok: false, error: "cognitive_os_login_no_cookie" };
  return { ok: true, value: cookie };
}

async function sessionCookie(cfg: CognitiveOsConfig, forceRelogin: boolean): Promise<CognitiveOsResult<string>> {
  if (!forceRelogin && cachedCookie && Date.now() < cachedCookie.expiresAt) {
    return { ok: true, value: cachedCookie.value };
  }
  const result = await login(cfg);
  // `=== false`, never `!result.ok`: this repo's tsconfig has strict:false (strictNullChecks off),
  // under which TS does NOT narrow a discriminated union via negated-truthiness on a literal
  // boolean property (confirmed empirically) -- only an explicit `=== false`/`=== true` comparison
  // (or an `in`/type-predicate check) actually excludes the other member.
  if (result.ok === false) return result;
  cachedCookie = { value: result.value, expiresAt: Date.now() + SESSION_TTL_MS - SESSION_SAFETY_MARGIN_MS };
  return result;
}

/** Clears the in-memory session cache. Test-only escape hatch (module-level state persists across
 * requests in the same server process, which is the point in production but would leak between
 * test cases otherwise). */
export function resetCognitiveOsSessionCacheForTests(): void {
  cachedCookie = null;
}

/**
 * Authenticated JSON call against the Cognitive OS API. Retries ONCE with a forced re-login on a
 * 401 (the cached cookie looked unexpired but the server disagrees -- e.g. its identity.sqlite3 was
 * reset independently of this process's cache).
 */
export async function cognitiveOsFetch<T>(path: string, init?: RequestInit): Promise<CognitiveOsResult<T>> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "cognitive_os_not_configured" };

  const attempt = async (forceRelogin: boolean): Promise<CognitiveOsResult<T>> => {
    const cookieResult = await sessionCookie(cfg, forceRelogin);
    if (cookieResult.ok === false) return cookieResult;

    let res: Response;
    try {
      res = await fetch(`${cfg.baseUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}), Cookie: cookieResult.value },
      });
    } catch {
      return { ok: false, error: "cognitive_os_network_error" };
    }
    if (res.status === 401 && !forceRelogin) return attempt(true);

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // no body to parse; only matters below if !res.ok, where a missing detail just falls back.
    }
    if (!res.ok) {
      const detail = typeof json === "object" && json !== null && "detail" in json ? (json as { detail: unknown }).detail : json;
      return { ok: false, error: typeof detail === "string" ? detail : `cognitive_os_error_${res.status}`, status: res.status };
    }
    return { ok: true, value: json as T };
  };
  return attempt(false);
}

export interface CognitiveOsProject {
  project_id: string;
  tenant_id: string;
  workspace_id: string;
  name: string;
  purpose: string;
  data_classification: string;
  status: string;
  version: number;
  created_by_identity_id: string;
  created_at: string;
}

export function listCognitiveOsProjects(): Promise<CognitiveOsResult<CognitiveOsProject[]>> {
  return cognitiveOsFetch<CognitiveOsProject[]>("/projects");
}

/** 404 with detail `PROJECT_NOT_FOUND: ...` = no such project for this identity (main.py _project_or_404). */
export function getCognitiveOsProject(projectId: string): Promise<CognitiveOsResult<CognitiveOsProject>> {
  return cognitiveOsFetch<CognitiveOsProject>(`/projects/${encodeURIComponent(projectId)}`);
}

export function createCognitiveOsProject(payload: {
  name: string;
  purpose: string;
  data_classification: string;
}): Promise<CognitiveOsResult<CognitiveOsProject>> {
  return cognitiveOsFetch<CognitiveOsProject>("/projects", { method: "POST", body: JSON.stringify(payload) });
}

export interface CognitiveOsSource {
  source_id: string;
  project_id: string;
  tenant_id: string;
  title: string;
  media_type: string;
  data_classification: string;
  content_sha256: string;
  size_bytes: number;
  doi: string | null;
  authors: string[] | null;
  venue: string | null;
  published_at: string | null;
}

export function listCognitiveOsSources(projectId: string): Promise<CognitiveOsResult<CognitiveOsSource[]>> {
  return cognitiveOsFetch<CognitiveOsSource[]>(`/projects/${encodeURIComponent(projectId)}/sources`);
}

export interface CreateCognitiveOsSourcePayload {
  title: string;
  media_type: string;
  data_classification: string;
  content: string;
  doi?: string | null;
  authors?: string[] | null;
  venue?: string | null;
  published_at?: string | null;
}

export function createCognitiveOsSource(
  projectId: string,
  payload: CreateCognitiveOsSourcePayload,
): Promise<CognitiveOsResult<CognitiveOsSource>> {
  return cognitiveOsFetch<CognitiveOsSource>(`/projects/${encodeURIComponent(projectId)}/sources`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Step 1 of the cross-origin handoff (full rationale: ai_lego's store.py, handoff_code section).
 * Mints a single-use, 60s-lived code for the SERVICE tenant's own session -- never for whichever
 * next-admin operator clicked the link, since this module only ever authenticates as the service
 * identity in the first place (see this file's header). Consumed by app/api/cognitive-os/open/
 * route.ts, which redirects the operator's browser to redeem it directly against Cognitive OS's own
 * origin -- so the resulting session cookie is set by that origin, host-only, exactly like a normal
 * login, with no cross-domain Set-Cookie involved.
 */
export function mintCognitiveOsHandoff(projectId: string): Promise<CognitiveOsResult<{ code: string }>> {
  return cognitiveOsFetch<{ code: string }>("/auth/handoff/mint", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  });
}

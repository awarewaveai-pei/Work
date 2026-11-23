// Client page header health (SITE-FLOW-COMPLETION-PLAN.md §1-5 row "clients/[slug]/page.tsx:73", card SF-K; I1).
//
// A site built through the site flow (an `environments` row) is checked for identity: its /wp-json/ index must be a
// WordPress whose `home` is this environment's URL. A bare 200 is not enough: oracle.aware-wave.com answers 200 from
// the reading engine, which is not the WordPress. A client without an environments row keeps the old reachability
// check and says so ("僅連通").
//
// Traps:
// - Under construction (step 9 not done) the gate answers 503 for every path, /wp-json/ included: that is "not
//   confirmed", never "上線中".

export type ClientHealth =
  | { kind: "wp"; ok: boolean; statusCode: number | null; detail: string }
  | { kind: "reach"; ok: boolean; statusCode: number | null; detail: string };

const TIMEOUT_MS = 5000;

/** host + path without trailing slash; host lower-cased, without a leading www. or a trailing dot; null when not a URL. */
function siteKey(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase().replace(/^www\./, "").replace(/\.(?=:|$)/, "");
    return `${host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

async function timed<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Is the WordPress at `baseUrl` the one answering? (its REST index names this URL as home) */
export async function probeWordPressIdentity(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<ClientHealth> {
  const want = siteKey(baseUrl);
  if (!want) return { kind: "wp", ok: false, statusCode: null, detail: "環境網址無效" };
  try {
    return await timed(async (signal) => {
      const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/wp-json/`, { signal, headers: { accept: "application/json" } });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return { kind: "wp", ok: false, statusCode: res.status, detail: `WordPress 介面回 ${res.status}` };
      }
      const body: unknown = await res.json().catch(() => null);
      const home = body && typeof body === "object" && typeof (body as { home?: unknown }).home === "string" ? (body as { home: string }).home : null;
      if (!home) return { kind: "wp", ok: false, statusCode: res.status, detail: "回應的不是 WordPress" };
      if (siteKey(home) !== want) return { kind: "wp", ok: false, statusCode: res.status, detail: `WordPress 的網址與這個環境不一致（${home}）` };
      return { kind: "wp", ok: true, statusCode: res.status, detail: "回應的是這個 WordPress" };
    });
  } catch {
    return { kind: "wp", ok: false, statusCode: null, detail: "連不上" };
  }
}

/** Reachability only: any answer below 400. Says nothing about which site answered. */
export async function probeReachable(url: string, fetchImpl: typeof fetch = fetch): Promise<ClientHealth> {
  try {
    return await timed(async (signal) => {
      const res = await fetchImpl(url, { method: "HEAD", signal });
      const ok = res.status < 400;
      return { kind: "reach", ok, statusCode: res.status, detail: ok ? "僅連通：不確認回應的是哪個站" : `回 ${res.status}（僅連通檢查）` };
    });
  } catch {
    return { kind: "reach", ok: false, statusCode: null, detail: "連不上" };
  }
}

/**
 * The header badge checks the configured site URL. When a site-flow environment has that host, it gets the identity
 * check; otherwise (no environment, another host, environments unreadable) reachability only. Without a configured
 * URL, the first environment is checked for identity. null = nothing to check.
 */
export async function clientHealth(
  siteUrl: string | undefined,
  envBaseUrls: string[],
  fetchImpl: typeof fetch = fetch,
  envsUnreadable = false,
): Promise<ClientHealth | null> {
  const host = (u: string) => siteKey(u)?.split("/")[0] ?? null;
  const urls = envBaseUrls.filter((u) => siteKey(u));
  const env = siteUrl ? urls.find((u) => host(u) === host(siteUrl)) : urls[0];
  if (env) return probeWordPressIdentity(env, fetchImpl);
  if (!siteUrl) return null;
  const r = await probeReachable(siteUrl, fetchImpl);
  return envsUnreadable ? { ...r, detail: `${r.detail}（建站紀錄讀不到）` } : r;
}

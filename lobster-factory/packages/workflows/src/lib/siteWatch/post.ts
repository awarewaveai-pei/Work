// Calls next-admin's site-watch routes (all monitoring logic lives there; agency-os/docs/operations/
// SITE_WATCH_MASTER_PLAN.md §3.1). Same shape as ../schedules/postRunDue.ts: a dedicated
// bearer token — never OPS_INBOX_INGEST_TOKEN or SCHEDULE_INGEST_TOKEN — so a leak of one
// cannot forge calls on the endpoints the others guard.

export type SiteWatchDueResult = {
  ok: boolean;
  enabled: boolean;
  synced: number;
  due?: number;
  owed?: number;
  targets: string[];
};

export type SiteWatchRunStatus =
  | "kill_switch"
  | "not_found"
  | "leased"
  | "not_due"
  | "ran"
  | "stopped"
  | "lease_lost"
  | "renderer_unavailable";

export type SiteWatchRunResult = {
  ok: boolean;
  result: {
    targetId: string;
    status: SiteWatchRunStatus;
    runKey?: string;
    pages: Array<{ pageId: string; ok: boolean; failureCode: string | null; visual: string | null }>;
    notifications: Array<{ pageId: string; kind: string; phase: string; outcome: string }>;
    error?: string;
  };
};

export type SiteWatchCleanupResult = {
  ok: boolean;
  result: { claimed: boolean; purgedRows: number; deletedObjects: number; failedDeletes: number; skippedObjects: string | null };
};

// The run and cleanup routes declare maxDuration 300; wait a little longer than that so the route,
// not this client, decides when a run is over. (Cloudflare may still answer 524 at ~100s on the
// public URL; the route keeps running server-side and its lease makes that safe — plan §6.2 R9.)
const DUE_TIMEOUT_MS = 60_000;
const LONG_TIMEOUT_MS = 330_000;

/** The token is synced from ks-aw-01 only once site-watch is rolled out (plan §7 step 10d/e). */
export function siteWatchConfigured(): boolean {
  return !!process.env.SITE_WATCH_INGEST_TOKEN?.trim();
}

async function post<T>(path: string, timeoutMs: number): Promise<T> {
  const token = process.env.SITE_WATCH_INGEST_TOKEN?.trim();
  if (!token) throw new Error("SITE_WATCH_INGEST_TOKEN is required on Trigger worker");
  const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
  const res = await fetch(`${base}/api/internal/site-watch${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`site-watch ${path} ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

export function postSiteWatchDue(): Promise<SiteWatchDueResult> {
  return post<SiteWatchDueResult>("/due", DUE_TIMEOUT_MS);
}

export function postSiteWatchRun(targetId: string): Promise<SiteWatchRunResult> {
  return post<SiteWatchRunResult>(`/run/${encodeURIComponent(targetId)}`, LONG_TIMEOUT_MS);
}

export function postSiteWatchCleanup(): Promise<SiteWatchCleanupResult> {
  return post<SiteWatchCleanupResult>("/cleanup", LONG_TIMEOUT_MS);
}

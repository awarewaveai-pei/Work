// C24 real data (SOCIAL_MANAGER_PLAN.md §1b): the daily snapshot writes a real channel's days into social_metrics_daily
// and the 數據分析 loader shows them, against a real Postgres + PostgREST and Bluesky's public API. Run only by
// tests/e2e/social/metrics-real-db.sh, which starts both and sets METRICS_REST; skipped otherwise (npm test, deploy gate).
import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REST = process.env.METRICS_REST;
// the snapshot writes with a service-role token: only ever a throwaway PostgREST on this machine
if (REST && !["127.0.0.1", "localhost"].includes(new URL(REST).hostname)) throw new Error(`METRICS_REST must be local, got ${REST}`);
const A = "00000000-0000-0000-0000-00000000000a";
const TZ = "Asia/Taipei";

function serviceToken(secret: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

describe.skipIf(!REST)("metrics against a real database and Bluesky", () => {
  let proxy: http.Server;
  let lib: typeof import("../metrics");
  let time: typeof import("../time");
  let rows: () => Promise<number>;

  beforeAll(async () => {
    // supabase-js calls <url>/rest/v1/...; PostgREST serves at its root
    const target = new URL(REST as string);
    proxy = http.createServer((req, res) => {
      const up = http.request({ host: target.hostname, port: target.port, method: req.method, headers: req.headers,
        path: (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/" }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
      up.on("error", () => { res.writeHead(502); res.end(); });
      req.pipe(up);
    });
    await new Promise<void>((ok) => proxy.listen(0, "127.0.0.1", ok));
    process.env.SUPABASE_URL = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceToken(process.env.METRICS_JWT_SECRET as string);
    lib = await import("../metrics");
    time = await import("../time");
    const { getSupabaseWriteClient } = await import("@/lib/supabase-server");
    rows = async () => {
      const { count, error } = await getSupabaseWriteClient()!.from("social_metrics_daily").select("day", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    };
  });
  afterAll(() => new Promise<void>((ok) => proxy?.close(() => ok())));

  it("a snapshot writes the channel's days; the page loader shows yesterday with Bluesky's follower count", async () => {
    const first = await lib.runMetricsSnapshot();
    expect(first.errors).toEqual([]);
    expect(first.accounts).toBe(1);
    expect(first.days).toBeGreaterThanOrEqual(lib.BACKFILL_DAYS);
    const stored = await rows();
    expect(stored).toBe(first.days);

    // the same days fetched again overwrite, not duplicate
    const again = await lib.runMetricsSnapshot();
    expect(again.errors).toEqual([]);
    expect(await rows()).toBe(stored);

    const page = await lib.loadAnalytics(A, TZ, null, 7);
    const yesterday = time.addDays(time.zoned(new Date(), TZ).date, -1);
    expect(page.accounts.map((a) => a.platform)).toEqual(["bluesky"]);
    expect(page.latestDay).toBe(yesterday);
    expect(page.empty).toEqual([]);
    // the count Bluesky gives right now (Soulful's channel is new: a real 0 must stay 0, not become null)
    const profile = await (await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(page.accounts[0].handle ?? "")}`)).json() as { followersCount: number };
    expect(page.kpis.followers.value).toBe(profile.followersCount);
    expect(page.kpis.posts.value).not.toBeNull();
    expect(page.kpis.engagement.value).not.toBeNull();
    // Bluesky gives no reach or impressions: null with the reason, never 0
    expect(page.kpis.reach.value).toBeNull();
    expect(page.kpis.impressions.value).toBeNull();
    expect(page.gaps).toEqual([{ account_id: page.accounts[0].id, fields: ["reach", "impressions"], reason: "Bluesky 不提供觸及和曝光數" }]);
    console.log(`[C24 real] ${yesterday} followers=${page.kpis.followers.value} posts7d=${page.kpis.posts.value} engagement7d=${page.kpis.engagement.value} rows=${stored}`);
  }, 120_000);
});

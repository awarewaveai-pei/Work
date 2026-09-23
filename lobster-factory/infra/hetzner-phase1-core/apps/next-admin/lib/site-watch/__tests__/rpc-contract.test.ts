// Every site_watch_* RPC the code calls must exist in migration 0091 with exactly the parameter names
// the code sends. PostgREST resolves a function by its named arguments, so one renamed or missing key
// is PGRST202 at runtime — invisible to tsc, to the SQL harness (it calls positionally) and to unit
// tests that fake the store. WORKLOG 0055: two weeks of silent downtime from exactly this class.
//
// Keys are recorded from real calls through a fake client and read back through a JSON round trip —
// what supabase-js actually puts on the wire (an undefined-valued key is dropped there, and would be
// just as fatal as a misspelt one).
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { runDailyCleanup } from "@/lib/site-watch/cleanup";
import { acceptLatestAsBaseline, updateConfig } from "@/lib/site-watch/console";
import type { SiteWatchObjects } from "@/lib/site-watch/objects";
import { createSupabaseStore, type CheckRecord, type PageStateRow } from "@/lib/site-watch/store";

const NEXT_ADMIN = path.resolve(__dirname, "../../..");
const MIGRATION = path.resolve(NEXT_ADMIN, "../../../../packages/db/migrations/0091_site_watch.sql");
// Everywhere a site_watch_* RPC may be called from. Scanned, so a new call site cannot hide from this test.
const CALLER_ROOTS = ["lib/site-watch", "app/api/internal/site-watch", "app/api/ops/clients/[slug]/site-watch"];

function declaredFunctions(): Map<string, string[]> {
  const sql = readFileSync(MIGRATION, "utf8");
  const out = new Map<string, string[]>();
  for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(site_watch_[a-z_]+)\(([\s\S]*?)\)\s*RETURNS/g)) {
    // An overload would make PostgREST's named-argument resolution ambiguous; 0091 defines each once.
    expect(out.has(m[1]), `${m[1]} is defined twice in 0091`).toBe(false);
    const params = m[2].split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
    out.set(m[1], params.sort());
  }
  return out;
}

function sourceFiles(dir: string): string[] {
  const abs = path.join(NEXT_ADMIN, dir);
  return readdirSync(abs).flatMap((name) => {
    const p = path.join(abs, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path.join(dir, name));
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

/** Function names passed as a string literal to any `rpc(` / `.rpc<T>(` call in the caller roots. */
function calledInSource(): Set<string> {
  const names = new Set<string>();
  for (const f of CALLER_ROOTS.flatMap(sourceFiles)) {
    for (const m of readFileSync(f, "utf8").matchAll(/\brpc(?:<[^>]*>)?\(\s*"(site_watch_[a-z_]+)"/g)) names.add(m[1]);
  }
  return names;
}

type Recorded = { fn: string; keys: string[] };

function fakeClient(rpcData: (fn: string) => unknown, tables: Record<string, unknown> = {}) {
  const calls: Recorded[] = [];
  // Any query-builder chain (.select().eq()…) resolves to the table's canned row.
  const chain = (table: string): unknown => {
    const result = { data: tables[table] ?? null, error: null };
    const builder: unknown = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(result);
        return () => builder;
      },
    });
    return builder;
  };
  const sb = {
    rpc(fn: string, args?: Record<string, unknown>) {
      const onTheWire = args === undefined ? {} : (JSON.parse(JSON.stringify(args)) as Record<string, unknown>);
      calls.push({ fn, keys: Object.keys(onTheWire).sort() });
      return Promise.resolve({ data: rpcData(fn), error: null });
    },
    from: (table: string) => chain(table),
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

const PAGE: PageStateRow = {
  target_id: "00000000-0000-0000-0000-000000000001",
  page_id: "aaaaaaaaaaaaaaaa",
  kind: "availability",
  page_url: "https://a.example.com",
  failure_streak: 2,
  last_failure_code: "http_5xx",
  last_message: "HTTP 500",
  episode_id: "00000000-0000-0000-0000-0000000000e1",
  alert_state: "pending",
  recovery_state: "none",
  recovery_reason: null,
  incident_id: null,
  baseline_set_at: null,
  baseline_sha256: null,
  owed_since: "2026-09-23T00:00:00Z",
  updated_at: "2026-09-23T00:00:00Z",
};

const CHECK: CheckRecord = {
  targetId: PAGE.target_id,
  gen: 1,
  runKey: "sw-x-d20260923",
  pageId: PAGE.page_id,
  pageUrl: PAGE.page_url,
  ok: false,
  httpStatus: 500,
  failureCode: "http_5xx",
  finalUrl: null,
  consoleErrorCount: 0,
  pageErrorCount: 0,
  errorsSample: [],
  timingMs: 100,
  visual: null,
  visualNote: null,
  diffRatio: null,
  evidenceKey: null,
  diffKey: null,
  skippedBuckets: 0,
  message: "HTTP 500",
  baselineSha256: null,
};

/** Drive every RPC-calling entry point once; returns what reached the wire. */
async function exerciseAllCallers(): Promise<Recorded[]> {
  const t = PAGE.target_id;
  const rpcData = (fn: string): unknown =>
    fn === "site_watch_update_config" ? [{ id: t, version: 2 }] : fn === "site_watch_claim_daily_cleanup" ? true : null;
  const { sb, calls } = fakeClient(rpcData, {
    site_watch_targets: { id: t },
    site_watch_results: { evidence_key: `site-watch/${t}/${PAGE.page_id}/evidence/x.jpg` },
  });

  const store = createSupabaseStore(sb);
  await store.touchHeartbeat(true);
  await store.syncTargets();
  await store.pendingNotificationTargets();
  await store.claim(t, 300);
  await store.renew(t, 1, 300);
  await store.release(t, 1);
  await store.recordCheck(CHECK);
  await store.completeRun(t, 1, CHECK.runKey, new Date("2026-09-22T22:00:00Z"));
  await store.retirePages(t, 1, [PAGE.page_id]);
  await store.attachIncident(t, 1, PAGE, "00000000-0000-0000-0000-0000000000f1");
  await store.notifyBegin(t, 1, PAGE, "alert");
  await store.notifyFinish(t, 1, PAGE, "alert", "sent");
  await store.resolveForRecovery(t, 1, PAGE);

  await updateConfig(sb, t, { expectedVersion: 1, enabled: true, frequency: "daily", hourUtc: 22 }, "owner:test");
  const objects: SiteWatchObjects = {
    put: async () => true,
    get: async () => Buffer.from("jpeg"),
    list: async () => [],
    remove: async () => true,
  };
  await acceptLatestAsBaseline(sb, objects, t, PAGE.page_id);
  await runDailyCleanup(sb, null, new Date("2026-09-23T00:00:00Z"));
  return calls.filter((c) => c.fn.startsWith("site_watch_"));
}

describe("site_watch RPC contract (code ↔ migration 0091)", () => {
  it("the migration parse found the real function set", () => {
    const declared = declaredFunctions();
    expect(declared.size).toBeGreaterThan(15);
    expect(declared.get("site_watch_record_check")).toHaveLength(21); // the widest signature parsed whole
    expect(declared.get("site_watch_sync_targets")).toEqual([]);
    for (const [fn, params] of declared) {
      for (const p of params) expect([fn, p, p.startsWith("p_")]).toEqual([fn, p, true]);
    }
  });

  it("every RPC called in source is exercised by this test (a new call site cannot slip past)", async () => {
    const exercised = new Set((await exerciseAllCallers()).map((c) => c.fn));
    const inSource = calledInSource();
    expect(inSource.size).toBeGreaterThan(10);
    expect([...inSource].filter((fn) => !exercised.has(fn)).sort()).toEqual([]);
  });

  it("every call names a function 0091 defines, with exactly its parameter names", async () => {
    const declared = declaredFunctions();
    const calls = await exerciseAllCallers();
    expect(calls.length).toBeGreaterThan(10);
    for (const c of calls) {
      expect([c.fn, declared.has(c.fn)]).toEqual([c.fn, true]);
      expect([c.fn, c.keys]).toEqual([c.fn, declared.get(c.fn)]);
    }
  });
});

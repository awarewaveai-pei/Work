// C9 daily cleanup: once per UTC day; result rows > 30 days; objects nothing references any more.
// "Never delete what we cannot account for" is the rule every case below pins.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { runDailyCleanup } from "@/lib/site-watch/cleanup";
import type { SiteWatchObjects } from "@/lib/site-watch/objects";

const ORG = "00000000-0000-0000-0000-0000000000aa";
const PAGE = "aaaaaaaaaaaaaaaa";
const OTHER_PAGE = "bbbbbbbbbbbbbbbb";
const NOW = new Date("2026-09-23T03:00:00Z");
const DAY = 24 * 3600 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ev = (name: string, page = PAGE) => `site-watch/${ORG}/${page}/evidence/${name}`;

function fakeSb(opts: { claim?: boolean; results?: unknown[]; baselines?: unknown[] } = {}) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "site_watch_claim_daily_cleanup") return { data: opts.claim ?? true, error: null };
    if (fn === "site_watch_purge_results") return { data: 4, error: null };
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });
  const tables: Record<string, unknown[]> = { site_watch_results: opts.results ?? [], site_watch_page_state: opts.baselines ?? [] };
  const from = (table: string) => {
    const result = { data: tables[table], error: null };
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "or", "eq", "not"]) builder[m] = () => builder;
    builder.range = async () => result;
    return builder;
  };
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc };
}

function objects(listed: Array<{ key: string; lastModified: Date | null }> | null, removeOk = true) {
  const removed: string[] = [];
  const o: SiteWatchObjects = {
    put: async () => true,
    get: async () => null,
    list: vi.fn(async () => listed),
    remove: vi.fn(async (k: string) => (removed.push(k), removeOk)),
  };
  return { o, removed };
}

describe("runDailyCleanup", () => {
  it("already ran today: touches nothing", async () => {
    const { sb, rpc } = fakeSb({ claim: false });
    const { o } = objects([]);
    expect(await runDailyCleanup(sb, o, NOW)).toEqual({ claimed: false, purgedRows: 0, deletedObjects: 0, failedDeletes: 0, skippedObjects: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(o.list).not.toHaveBeenCalled();
  });

  it("purges result rows with the 30-day retention even without a bucket (retention is a promise)", async () => {
    const { sb, rpc } = fakeSb();
    const res = await runDailyCleanup(sb, null, NOW);
    expect(rpc).toHaveBeenCalledWith("site_watch_purge_results", { p_days: 30 });
    expect(res).toMatchObject({ claimed: true, purgedRows: 4, skippedObjects: "storage_unconfigured" });
  });

  it("a failed listing is reported, not treated as an empty bucket", async () => {
    const { sb } = fakeSb();
    expect((await runDailyCleanup(sb, objects(null).o, NOW)).skippedObjects).toBe("list_failed");
  });

  it("deletes only old, unreferenced, well-formed objects; keeps everything it cannot account for", async () => {
    const referenced = ev("ref.jpg");
    const { sb } = fakeSb({
      results: [{ evidence_key: referenced, diff_key: null }],
      // one embed as object, one as array: both shapes arrive at runtime
      baselines: [
        { page_id: PAGE, site_watch_targets: { organization_id: ORG } },
        { page_id: "cccccccccccccccc", site_watch_targets: [{ organization_id: ORG }] },
      ],
    });
    const listed = [
      { key: ev("orphan-old.jpg"), lastModified: ago(2 * DAY) }, // delete
      { key: referenced, lastModified: ago(40 * DAY) }, // keep: still referenced
      { key: ev("orphan-young.jpg"), lastModified: ago(3600 * 1000) }, // keep: may be a write in flight
      { key: ev("orphan-no-date.jpg"), lastModified: null }, // keep: age unknown
      { key: "site-watch/not-a-uuid/x/evidence/y.jpg", lastModified: ago(90 * DAY) }, // keep: not our layout
      { key: `site-watch/${ORG}/${PAGE}/baseline.jpg`, lastModified: ago(90 * DAY) }, // keep: live baseline
      { key: `site-watch/${ORG}/cccccccccccccccc/baseline.jpg`, lastModified: ago(90 * DAY) }, // keep: live (array embed)
      { key: `site-watch/${ORG}/${OTHER_PAGE}/baseline.jpg`, lastModified: ago(2 * DAY) }, // delete: no live baseline
    ];
    const { o, removed } = objects(listed);
    const res = await runDailyCleanup(sb, o, NOW);
    expect(removed.sort()).toEqual([ev("orphan-old.jpg"), `site-watch/${ORG}/${OTHER_PAGE}/baseline.jpg`].sort());
    expect(res).toMatchObject({ deletedObjects: 2, failedDeletes: 0 });
  });

  it("a delete that fails is counted and simply found again tomorrow", async () => {
    const { sb } = fakeSb();
    const { o } = objects([{ key: ev("orphan.jpg"), lastModified: ago(2 * DAY) }], false);
    expect(await runDailyCleanup(sb, o, NOW)).toMatchObject({ deletedObjects: 0, failedDeletes: 1 });
  });
});

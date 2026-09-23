// runTarget with fake deps: lease/claim/complete ordering, kill switch (matrix #5), monitor failures
// never recorded as site failures (C5), and the visual branches. The fenced SQL behind each store
// call is proven separately by the harness; here the question is what the runner decides to call.
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { RendererUnavailable, type SnapshotResult } from "@/lib/site-watch/rendererClient";
import { runTarget, type ObjectStore, type RunnerDeps } from "@/lib/site-watch/runner";
import { bucketFor } from "@/lib/site-watch/runKey";
import type { CheckRecord, PageStateRow, SiteWatchStore, TargetRow } from "@/lib/site-watch/store";

const TID = "00000000-0000-0000-0000-0000000000t1";
const ORG = { id: "00000000-0000-0000-0000-0000000000aa", slug: "shop-a", name: "Shop A", status: "active", siteUrl: "https://shop.example.com/" };
const NOW = new Date("2026-09-23T22:05:00Z");
const KEY = bucketFor(TID, "daily", 22, NOW)!.key;

function target(over: Partial<TargetRow> = {}): TargetRow {
  return {
    id: TID, organization_id: ORG.id, enabled: true, frequency: "daily", hour_utc: 22,
    last_completed_run_key: null, last_completed_bucket_start: null, version: 1, updated_by: null, updated_at: "", ...over,
  };
}

function snap(over: Partial<SnapshotResult> = {}): SnapshotResult {
  return {
    ok: true, status: 200, finalUrl: "https://shop.example.com/", failureCode: null, detail: null,
    consoleErrors: [], pageErrors: [], screenshotBase64: null, screenshotBytes: 0, screenshotSkipped: "too_large", timingMs: 900, ...over,
  };
}

function fakeStore(over: Record<string, unknown> = {}) {
  const base = {
    loadTarget: vi.fn(async () => ({ target: target(), org: ORG })),
    claim: vi.fn(async () => 7),
    retirePages: vi.fn(async () => 0),
    pageStates: vi.fn(async (): Promise<PageStateRow[]> => []),
    renew: vi.fn(async () => 300),
    recordCheck: vi.fn(async (_r: CheckRecord): Promise<string> => "recorded"),
    completeRun: vi.fn(async () => true),
    release: vi.fn(async () => {}),
    notifyBegin: vi.fn(async () => true),
    notifyFinish: vi.fn(async () => true),
    upsertIncident: vi.fn(async () => "i1"),
    attachIncident: vi.fn(async () => true),
    resolveForRecovery: vi.fn(async () => "pending_send"),
  };
  return { ...base, ...over } as unknown as SiteWatchStore & typeof base;
}

/** The CheckRecord the run wrote (exactly one per page). */
const recorded = (s: { recordCheck: { mock: { calls: Array<[CheckRecord]> } } }, i = 0): CheckRecord => s.recordCheck.mock.calls[i]![0];

function deps(store: SiteWatchStore, over: Partial<RunnerDeps> = {}): RunnerDeps & { snapshot: ReturnType<typeof vi.fn> } {
  return {
    store,
    snapshot: vi.fn(async () => snap()),
    objects: null,
    notifier: null,
    publicUrl: "https://app.aware-wave.com",
    enabled: () => true,
    now: () => NOW,
    ...over,
  } as RunnerDeps & { snapshot: ReturnType<typeof vi.fn> };
}

const jpeg = (rgb: number) =>
  sharp({ create: { width: 100, height: 100, channels: 3, background: { r: rgb, g: rgb, b: rgb } } }).jpeg().toBuffer();

describe("runTarget", () => {
  it("matrix #5: kill switch off = nothing loaded, claimed or rendered", async () => {
    const store = fakeStore();
    const d = deps(store, { enabled: () => false });
    expect((await runTarget(TID, d)).status).toBe("kill_switch");
    expect(store.loadTarget).not.toHaveBeenCalled();
    expect(store.claim).not.toHaveBeenCalled();
    expect(d.snapshot).not.toHaveBeenCalled();
  });

  it("due: claims, renews before the page, records once, completes once with the bucket, releases", async () => {
    const store = fakeStore();
    const d = deps(store);
    const r = await runTarget(TID, d);
    expect(r.status).toBe("ran");
    expect(r.runKey).toBe(KEY);
    expect(store.renew.mock.invocationCallOrder[0]).toBeLessThan(d.snapshot.mock.invocationCallOrder[0]);
    expect(store.recordCheck).toHaveBeenCalledTimes(1);
    expect(recorded(store)).toMatchObject({ targetId: TID, gen: 7, runKey: KEY, ok: true, visual: "skipped", visualNote: "too_large" });
    expect(store.completeRun).toHaveBeenCalledTimes(1);
    expect(store.completeRun).toHaveBeenCalledWith(TID, 7, KEY, bucketFor(TID, "daily", 22, NOW)!.start);
    expect(store.release).toHaveBeenCalledWith(TID, 7);
  });

  it("someone else holds the lease: skip, and release nothing (there is no generation of ours)", async () => {
    const store = fakeStore({ claim: vi.fn(async () => null) });
    expect((await runTarget(TID, deps(store))).status).toBe("leased");
    expect(store.release).not.toHaveBeenCalled();
  });

  it("same bucket already completed: no snapshot, but owed notifications still run", async () => {
    const owed = { target_id: TID, page_id: "aaaaaaaaaaaaaaaa", kind: "availability", page_url: "x", failure_streak: 2, last_failure_code: "http_5xx", last_message: null, episode_id: "e", alert_state: "pending", recovery_state: "none", recovery_reason: null, incident_id: "i", baseline_set_at: null, baseline_sha256: null, owed_since: "x", updated_at: "x" } as PageStateRow;
    const store = fakeStore({
      loadTarget: vi.fn(async () => ({ target: target({ last_completed_run_key: KEY }), org: ORG })),
      pageStates: vi.fn(async () => [owed]),
    });
    const d = deps(store);
    const r = await runTarget(TID, d);
    expect(r.status).toBe("not_due");
    expect(d.snapshot).not.toHaveBeenCalled();
    expect(r.notifications).toEqual([{ pageId: "aaaaaaaaaaaaaaaa", kind: "availability", phase: "alert", outcome: "skipped" }]);
  });

  it("C5: renderer down is not a site failure — nothing recorded, run left incomplete for the same bucket to retry", async () => {
    const store = fakeStore();
    const d = deps(store, { snapshot: vi.fn(async () => { throw new RendererUnavailable("http_503:busy"); }) });
    const r = await runTarget(TID, d);
    expect(r.status).toBe("renderer_unavailable");
    expect(r.error).toContain("http_503:busy");
    expect(store.recordCheck).not.toHaveBeenCalled();
    expect(store.completeRun).not.toHaveBeenCalled();
    expect(store.release).toHaveBeenCalledTimes(1);
  });

  it("a fenced write means another executor took over: stop, never complete, still release", async () => {
    const store = fakeStore({ recordCheck: vi.fn(async () => "fenced") });
    expect((await runTarget(TID, deps(store))).status).toBe("lease_lost");
    expect(store.completeRun).not.toHaveBeenCalled();
    expect(store.release).toHaveBeenCalledTimes(1);
  });

  it("losing the lease at renew (before the page) or at retire stops before any rendering", async () => {
    for (const over of [{ renew: vi.fn(async () => null) }, { retirePages: vi.fn(async () => -1) }]) {
      const store = fakeStore(over);
      const d = deps(store);
      expect((await runTarget(TID, d)).status).toBe("lease_lost");
      expect(d.snapshot).not.toHaveBeenCalled();
      expect(store.release).toHaveBeenCalledTimes(1);
    }
  });

  it("kill switch turned off mid-run: the page is not started, the run stays incomplete, no notifications", async () => {
    let calls = 0;
    const store = fakeStore();
    const d = deps(store, { enabled: () => calls++ === 0 });
    const r = await runTarget(TID, d);
    expect(r.status).toBe("stopped");
    expect(d.snapshot).not.toHaveBeenCalled();
    expect(store.completeRun).not.toHaveBeenCalled();
    expect(store.pageStates).toHaveBeenCalledTimes(1); // the run's own read, not the notification step
  });

  it("a switched-off target renders nothing but still delivers its owed closing message (I3)", async () => {
    const closing = { target_id: TID, page_id: "aaaaaaaaaaaaaaaa", kind: "availability", page_url: "x", failure_streak: 0, last_failure_code: null, last_message: null, episode_id: "e", alert_state: "sent", recovery_state: "pending_send", recovery_reason: "disabled", incident_id: "i", baseline_set_at: null, baseline_sha256: null, owed_since: "x", updated_at: "x" } as PageStateRow;
    const store = fakeStore({
      loadTarget: vi.fn(async () => ({ target: target({ enabled: false }), org: ORG })),
      pageStates: vi.fn(async () => [closing]),
    });
    const d = deps(store);
    const r = await runTarget(TID, d);
    expect(d.snapshot).not.toHaveBeenCalled();
    expect(store.retirePages).not.toHaveBeenCalled();
    expect(r.notifications).toEqual([{ pageId: "aaaaaaaaaaaaaaaa", kind: "availability", phase: "recovery", outcome: "skipped" }]);
  });

  it("an unexpected error propagates (Trigger run fails loudly) and the lease is still released", async () => {
    const store = fakeStore({ recordCheck: vi.fn(async () => { throw new Error("site_watch_db:record_check:boom"); }) });
    await expect(runTarget(TID, deps(store))).rejects.toThrow("boom");
    expect(store.release).toHaveBeenCalledTimes(1);
  });

  it("a site failure keeps its screenshot as evidence and skips the visual comparison", async () => {
    const puts: string[] = [];
    const objects: ObjectStore = { put: async (k) => (puts.push(k), true), get: async () => null };
    const shot = (await jpeg(40)).toString("base64");
    const store = fakeStore();
    await runTarget(TID, deps(store, { objects, snapshot: vi.fn(async () => snap({ status: 503, failureCode: "http_5xx", detail: "HTTP 503", screenshotBase64: shot, screenshotSkipped: null })) }));
    const rec = recorded(store);
    expect(rec).toMatchObject({ ok: false, failureCode: "http_5xx", message: "HTTP 503", visual: null });
    expect(rec.evidenceKey).toMatch(new RegExp(`^site-watch/${ORG.id}/[0-9a-f]{16}/evidence/.+\\.jpg$`));
    expect(puts).toEqual([rec.evidenceKey]);
  });

  it("first good screenshot becomes the baseline; a later different one is a diff with evidence + diff images", async () => {
    const white = await jpeg(255);
    const black = await jpeg(0);
    const stored = new Map<string, Buffer>();
    const objects: ObjectStore = { put: async (k, b) => (stored.set(k, b), true), get: async (k) => stored.get(k) ?? null };

    const store1 = fakeStore();
    await runTarget(TID, deps(store1, { objects, snapshot: vi.fn(async () => snap({ screenshotBase64: white.toString("base64"), screenshotSkipped: null })) }));
    const first = recorded(store1);
    expect(first.visual).toBe("baseline_created");
    expect(first.baselineSha256).toMatch(/^[0-9a-f]{64}$/);

    const visualRow = { target_id: TID, page_id: first.pageId, kind: "visual", baseline_set_at: "2026-09-22T22:05:00Z" } as PageStateRow;
    const store2 = fakeStore({ pageStates: vi.fn(async () => [visualRow]) });
    await runTarget(TID, deps(store2, { objects, snapshot: vi.fn(async () => snap({ screenshotBase64: black.toString("base64"), screenshotSkipped: null })) }));
    const second = recorded(store2);
    expect(second.visual).toBe("diff");
    expect(second.diffRatio).toBeGreaterThan(0.9);
    expect(stored.has(second.evidenceKey)).toBe(true);
    expect(stored.has(second.diffKey)).toBe(true);
  });

  it("no private bucket: availability still runs, visual recorded as storage_unconfigured", async () => {
    const store = fakeStore();
    await runTarget(TID, deps(store, { objects: null, snapshot: vi.fn(async () => snap({ screenshotBase64: (await jpeg(128)).toString("base64"), screenshotSkipped: null })) }));
    expect(recorded(store)).toMatchObject({ ok: true, visual: "skipped", visualNote: "storage_unconfigured" });
  });
});

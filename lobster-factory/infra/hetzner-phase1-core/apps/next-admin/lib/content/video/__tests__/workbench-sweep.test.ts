/**
 * workbench-sweep: a workbench object is deleted only when old AND unreferenced; everything else is kept.
 * R2 transport and supabase are mocked; the age and reference guards are the ones mutation-checked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { r2ListObjects, r2DeleteObject, isR2Configured, getSupabaseWriteClient } = vi.hoisted(() => ({
  r2ListObjects: vi.fn(), r2DeleteObject: vi.fn(), isR2Configured: vi.fn(), getSupabaseWriteClient: vi.fn(),
}));
vi.mock("../../../storage/r2", () => ({ r2ListObjects, r2DeleteObject, isR2Configured }));
vi.mock("../../../supabase-server", () => ({ getSupabaseWriteClient }));

const { sweepWorkbenchOrphans, MAX_DELETES_PER_RUN, R2_CALL_TIMEOUT_MS } = await import("../workbench-sweep");

const NOW = new Date("2026-11-05T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);
const k = (n: string) => `video/workbench/org/${n}.mp4`;

// capped = the response is a full PostgREST page of version rows of some OTHER key in the slice (the asked key is cut off).
function fakeDb(referenced: Set<string>, opts: { error?: boolean; rowAppearsOnRecheck?: string; capped?: boolean } = {}) {
  let calls = 0;
  return {
    from: () => ({
      select: () => ({
        in: (_c: string, keys: string[]) => ({
          limit: (n: number) => {
            calls++;
            if (opts.error) return Promise.resolve({ data: null, error: { message: "boom" } });
            if (opts.capped) return Promise.resolve({ data: Array.from({ length: n }, () => ({ object_key: "video/workbench/org/other.mp4" })), error: null });
            const hit = keys.filter((x) => referenced.has(x) || (calls > 1 && x === opts.rowAppearsOnRecheck));
            return Promise.resolve({ data: hit.map((object_key) => ({ object_key })), error: null });
          },
        }),
      }),
    }),
  };
}

beforeEach(() => {
  isR2Configured.mockReturnValue(true);
  r2DeleteObject.mockResolvedValue({ ok: true });
});
afterEach(() => vi.clearAllMocks());

const list = (objects: { key: string; lastModified: Date | null }[]) => r2ListObjects.mockResolvedValue({ ok: true, objects });
const exhaustive = (r: Awaited<ReturnType<typeof sweepWorkbenchOrphans>>) =>
  expect(r.referenced + r.young + r.deleted + r.failed + r.deferred).toBe(r.checked);

describe("sweepWorkbenchOrphans", () => {
  it("lists only the workbench prefix and deletes an old unreferenced object", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set()));
    list([{ key: k("a"), lastModified: hoursAgo(30) }]);
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r2ListObjects).toHaveBeenCalledWith("lobster-videos", "video/workbench/");
    expect(r2DeleteObject).toHaveBeenCalledWith("lobster-videos", k("a"), { timeoutMs: R2_CALL_TIMEOUT_MS });
    expect(r).toMatchObject({ ok: true, checked: 1, deleted: 1, referenced: 0, young: 0, failed: 0, deferred: 0 });
    exhaustive(r);
  });

  it("keeps an object re-uploaded after the listing (fresh age read right before DELETE)", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set()));
    list([{ key: k("a"), lastModified: hoursAgo(30) }]);
    r2ListObjects.mockResolvedValueOnce({ ok: true, objects: [{ key: k("a"), lastModified: hoursAgo(30) }] })
      .mockResolvedValueOnce({ ok: true, objects: [{ key: k("a"), lastModified: hoursAgo(0) }] });
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, checked: 1, young: 1, deleted: 0 });
    exhaustive(r);
  });

  it("keeps every key of a lookup slice whose answer hit the row cap (incomplete = referenced)", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set(), { capped: true }));
    list([{ key: k("a"), lastModified: hoursAgo(30) }]);
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, checked: 1, referenced: 1, deleted: 0 });
    exhaustive(r);
  });

  it("keeps an old object that a media_assets row references", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set([k("a")])));
    list([{ key: k("a"), lastModified: hoursAgo(30) }]);
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(r).toMatchObject({ checked: 1, referenced: 1, deleted: 0 });
    exhaustive(r);
  });

  it("keeps a young object and one with unknown age", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set()));
    list([{ key: k("a"), lastModified: hoursAgo(1) }, { key: k("b"), lastModified: null }]);
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(r).toMatchObject({ checked: 2, young: 2, deleted: 0 });
    exhaustive(r);
  });

  it("never counts or deletes a key outside the prefix", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set()));
    list([{ key: "video/some-title/9x16.mp4", lastModified: hoursAgo(99) }, { key: k("a"), lastModified: hoursAgo(30) }]);
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r2DeleteObject).toHaveBeenCalledTimes(1);
    expect(r2DeleteObject).toHaveBeenCalledWith("lobster-videos", k("a"), { timeoutMs: R2_CALL_TIMEOUT_MS });
    expect(r.checked).toBe(1);
  });

  it("fails closed: a lookup error deletes nothing", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set(), { error: true }));
    list([{ key: k("a"), lastModified: hoursAgo(30) }]);
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.deleted).toBe(0);
  });

  it("keeps an object whose row appeared between the first lookup and the delete", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set(), { rowAppearsOnRecheck: k("a") }));
    list([{ key: k("a"), lastModified: hoursAgo(30) }]);
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r2DeleteObject).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, referenced: 1, failed: 0, deleted: 0 });
    exhaustive(r);
  });

  it(`caps deletes at ${MAX_DELETES_PER_RUN} per run and reports the rest as deferred`, async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set()));
    list(Array.from({ length: MAX_DELETES_PER_RUN + 5 }, (_, i) => ({ key: k(`o${i}`), lastModified: hoursAgo(30) })));
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r).toMatchObject({ deleted: MAX_DELETES_PER_RUN, deferred: 5 });
    exhaustive(r);
  });

  it("defers keys not reached before the time budget; ok stays true", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set()));
    list(Array.from({ length: 5 }, (_, i) => ({ key: k(`t${i}`), lastModified: hoursAgo(30) })));
    let t = 0;
    const r = await sweepWorkbenchOrphans(NOW, { budgetMs: 2, clock: () => t++ });
    expect(r2DeleteObject).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: true, deleted: 1, deferred: 4, failed: 0 });
    exhaustive(r);
  });

  it("counts a failed R2 delete as failed, not deleted", async () => {
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set()));
    r2DeleteObject.mockResolvedValue({ ok: false, error: "r2_delete_failed_500" });
    list([{ key: k("a"), lastModified: hoursAgo(30) }]);
    const r = await sweepWorkbenchOrphans(NOW);
    expect(r).toMatchObject({ ok: false, failed: 1, deleted: 0 });
    exhaustive(r);
  });

  it("skips with ok:true when R2 is not configured, and reports a list failure as ok:false", async () => {
    isR2Configured.mockReturnValue(false);
    expect(await sweepWorkbenchOrphans(NOW)).toMatchObject({ ok: true, skipped: expect.any(String), deleted: 0 });
    expect(r2ListObjects).not.toHaveBeenCalled();
    isR2Configured.mockReturnValue(true);
    getSupabaseWriteClient.mockReturnValue(fakeDb(new Set()));
    r2ListObjects.mockResolvedValue({ ok: false, error: "r2_list_failed_500" });
    expect(await sweepWorkbenchOrphans(NOW)).toMatchObject({ ok: false, error: "r2_list_failed_500" });
  });
});

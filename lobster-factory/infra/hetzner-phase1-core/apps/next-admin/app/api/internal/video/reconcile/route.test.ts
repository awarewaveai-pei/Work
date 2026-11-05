import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const reconcileVideos = vi.hoisted(() => vi.fn(async () => ({ ok: true, checked: 0, orphanUnattributable: 0 })));
const sweepWorkbenchOrphans = vi.hoisted(() => vi.fn(async (): Promise<{ ok: boolean; deleted?: number }> => ({ ok: true, deleted: 0 })));
vi.mock("@/lib/content/video/reconcile", () => ({ reconcileVideos }));
vi.mock("@/lib/content/video/workbench-sweep", () => ({ sweepWorkbenchOrphans }));

const { POST } = await import("./route");
const KEY = "ops-sync-test-key-long-enough";
const req = (key?: string) => new NextRequest("http://127.0.0.1:3002/api/internal/video/reconcile", {
  method: "POST", headers: key ? { "x-ops-sync-key": key } : {},
});

afterEach(() => {
  delete process.env.OPS_PROXY_SHARED_SECRET;
  reconcileVideos.mockClear();
  sweepWorkbenchOrphans.mockClear();
});

describe("POST /api/internal/video/reconcile", () => {
  it("fails closed when the secret is unset", async () => {
    expect((await POST(req(KEY))).status).toBe(401);
    expect(reconcileVideos).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong key and runs for the right one", async () => {
    process.env.OPS_PROXY_SHARED_SECRET = KEY;
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("wrong"))).status).toBe(401);
    expect(reconcileVideos).not.toHaveBeenCalled();
    expect((await POST(req(KEY))).status).toBe(200);
    expect(reconcileVideos).toHaveBeenCalledTimes(1);
  });

  it("returns the sweep counts with the reconcile result; a sweep failure is a 500 that keeps the reconcile body", async () => {
    process.env.OPS_PROXY_SHARED_SECRET = KEY;
    expect(await (await POST(req(KEY))).json()).toMatchObject({ ok: true, workbenchSweep: { ok: true, deleted: 0 } });
    sweepWorkbenchOrphans.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(req(KEY));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, checked: 0, workbenchSweep: { ok: false, error: "boom" } });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const reconcileVideos = vi.hoisted(() => vi.fn(async () => ({ ok: true, checked: 0, orphanUnattributable: 0 })));
vi.mock("@/lib/content/video/reconcile", () => ({ reconcileVideos }));

const { POST } = await import("./route");
const KEY = "ops-sync-test-key-long-enough";
const req = (key?: string) => new NextRequest("http://127.0.0.1:3002/api/internal/video/reconcile", {
  method: "POST", headers: key ? { "x-ops-sync-key": key } : {},
});

afterEach(() => {
  delete process.env.OPS_PROXY_SHARED_SECRET;
  reconcileVideos.mockClear();
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
});

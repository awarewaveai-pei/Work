// POST /api/content/cover-preview (K24): the image-route gate refuses an unauthorized role, and an imageUrl that is not
// a data: image or our own designs bucket is refused before any read or fetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ allowed: true, r2Reads: 0 }));
vi.mock("@/lib/entitlements/grant", () => ({ withFeature: (_k: string, h: (r: Request) => Promise<Response>) => h }));
vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: m.allowed ? "owner" : "viewer" }), canCreateAiImageJob: () => m.allowed }));
vi.mock("@/lib/storage/r2", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage/r2")>()),
  getDesignObjectByUrl: async () => { m.r2Reads++; return { ok: false, error: "x" }; },
}));
import { POST } from "./route";

const net = vi.fn(async () => new Response("x"));
beforeEach(() => { m.allowed = true; m.r2Reads = 0; net.mockClear(); vi.stubGlobal("fetch", net); });
afterEach(() => { vi.unstubAllGlobals(); });

const post = (body: object) => POST(new Request("https://app.aware-wave.com/api/content/cover-preview", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));

describe("POST /api/content/cover-preview", () => {
  it("an unauthorized role is refused", async () => {
    m.allowed = false;
    expect((await post({ title: "標題" })).status).toBe(403);
  });

  it.each(["https://example.com/a.png", "https://pub-a88b06f569bd41a3b9e27e29644d520e.r2.dev.attacker.tld/designs/x.png", "http://169.254.169.254/x"])(
    "an outside imageUrl is refused without reading it: %s", async (imageUrl) => {
      const res = await post({ title: "標題", imageUrl });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("image_url_not_allowed");
      expect(net).not.toHaveBeenCalled();
      expect(m.r2Reads).toBe(0);
    });
});

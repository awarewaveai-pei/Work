import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const m = vi.hoisted(() => ({ get: vi.fn(), gen: vi.fn() }));
vi.mock("@/lib/storage/r2", async (orig) => ({ ...(await orig<typeof import("@/lib/storage/r2")>()), getDesignObjectByUrl: m.get }));
vi.mock("@/lib/studio/image-provider", async (orig) => ({ ...(await orig<typeof import("@/lib/studio/image-provider")>()), generateImage: m.gen }));
const gate = vi.hoisted(() => ({ asked: 0 }));
vi.mock("@/lib/entitlements/grant", () => ({
  withFeature: (_k: string, h: (r: Request, g: unknown, c: unknown) => Promise<Response>) => (r: Request, c: unknown) => { gate.asked++; return h(r, { kind: "internal" }, c); },
}));

import { POST, nearestAspect } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/tools/studio/fabric-print", {
  method: "POST",
  headers: { "content-type": "application/json", "x-ops-user-kind": "client", "x-ops-org-id": "org-1" },
  body: JSON.stringify(body),
}));
const BASE = "https://pub-test.r2.dev";
const PHOTO = `${BASE}/designs/2026-11/pose.png`;
const DESIGN = `${BASE}/designs/2026-11/design.png`;
const BOX = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
const png = (w: number, h: number, c: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

beforeEach(() => {
  vi.stubEnv("POD_DESIGNS_ENABLED", "true");
  vi.stubEnv("R2_DESIGNS_PUBLIC_BASE", BASE);
  m.get.mockReset();
  gate.asked = 0;
  m.gen.mockReset().mockResolvedValue({ ok: true, image: "data:image/png;base64,QUJD", seed: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/tools/studio/fabric-print", () => {
  it("the pose photo must be a saved designs-bucket asset, whatever the engine", async () => {
    for (const photo of ["data:image/png;base64,AAAA", "https://evil.example/x.png", `${BASE}.evil.example/designs/x.png`]) {
      const res = await post({ photo, design: DESIGN, engine: "ai" });
      expect(res.status, photo).toBe(400);
    }
    expect(m.gen).not.toHaveBeenCalled();
    expect(m.get).not.toHaveBeenCalled();
  });

  it("ai (default): edits the photo with gpt-image-2.5 at the photo's own ratio, charging the caller's grant", async () => {
    m.get.mockResolvedValue({ ok: true, body: await png(80, 120, { r: 250, g: 250, b: 250 }), contentType: "image/png" });
    const res = await post({ photo: PHOTO, design: DESIGN, designScale: 0.8, garmentColor: "black" });
    expect(await res.json()).toMatchObject({ ok: true, engine: "ai", image: "data:image/png;base64,QUJD" });
    expect(m.gen).toHaveBeenCalledTimes(1);
    const [params, grant] = m.gen.mock.calls[0];
    expect(params).toMatchObject({ model: "openai-25-edit", aspectRatio: "2:3", referenceImages: [PHOTO, DESIGN], costLog: { route: "tools/studio/fabric-print" } });
    expect(params.prompt).toContain("about 48% of the chest width");
    expect(params.prompt).toContain("do not lighten, darken, invert or recolour");
    expect(grant).toEqual({ kind: "internal" });
    expect(gate.asked).toBe(1);
  });

  it("ai: a design must be an upload or our own asset; a failed generation reaches the browser as ok:false", async () => {
    expect((await post({ photo: PHOTO, design: "https://evil.example/d.png" })).status).toBe(400);
    m.get.mockResolvedValue({ ok: true, body: await png(80, 120, { r: 250, g: 250, b: 250 }), contentType: "image/png" });
    m.gen.mockResolvedValue({ ok: false, error: "no_credits" });
    const res = await post({ photo: PHOTO, design: DESIGN });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: false, code: "no_credits", error: "點數不足。" });
  });

  it("code: refuses a box outside the photo before reading anything", async () => {
    const res = await post({ photo: PHOTO, design: DESIGN, engine: "code", box: { x: 0.8, y: 0.1, w: 0.5, h: 0.5 } });
    expect(res.status).toBe(400);
    expect(m.get).not.toHaveBeenCalled();
  });

  it("code: prints the design onto the photo inside the box and leaves the rest of the photo", async () => {
    const photo = await png(100, 100, { r: 250, g: 250, b: 250 });
    const design = await png(10, 10, { r: 20, g: 40, b: 200 });
    m.get.mockImplementation(async (url: string) => ({ ok: true, body: url === PHOTO ? photo : design, contentType: "image/png" }));
    const res = await post({ photo: PHOTO, design: DESIGN, engine: "code", box: BOX });
    const json = (await res.json()) as { ok: boolean; image: string; engine: string };
    expect(json.ok).toBe(true);
    expect(json.engine).toBe("code");
    expect(m.gen).not.toHaveBeenCalled();
    expect(gate.asked).toBe(0); // the free preview asks no feature grant
    const raw = await sharp(Buffer.from(json.image.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number, c: number) => raw.data[(y * raw.info.width + x) * raw.info.channels + c];
    expect(at(50, 50, 2)).toBeGreaterThan(150); // blue ink in the box
    expect(at(50, 50, 0)).toBeLessThan(80);
    expect(at(5, 5, 0)).toBeGreaterThan(240); // corner untouched (white)
  });
});

describe("nearestAspect", () => {
  it("picks the ratio closest to the photo", () => {
    expect(nearestAspect(1696, 2528)).toBe("2:3");
    expect(nearestAspect(1000, 1000)).toBe("1:1");
    expect(nearestAspect(1920, 1080)).toBe("16:9");
    expect(nearestAspect(800, 1000)).toBe("4:5");
  });
});

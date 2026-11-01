import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/storage/r2", async (orig) => ({ ...(await orig<typeof import("@/lib/storage/r2")>()), getDesignObjectByUrl: m.get }));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/tools/studio/fabric-print", {
  method: "POST",
  headers: { "content-type": "application/json", "x-ops-user-kind": "client", "x-ops-org-id": "org-1" },
  body: JSON.stringify(body),
}));
const PHOTO = "https://pub-test.r2.dev/designs/2026-11/pose.png";
const DESIGN = "https://pub-test.r2.dev/designs/2026-11/design.png";
const BOX = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
const png = (w: number, h: number, c: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

beforeEach(() => { vi.stubEnv("POD_DESIGNS_ENABLED", "true"); m.get.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/tools/studio/fabric-print", () => {
  it("refuses a box outside the photo before reading anything", async () => {
    const res = await post({ photo: PHOTO, design: DESIGN, box: { x: 0.8, y: 0.1, w: 0.5, h: 0.5 } });
    expect(res.status).toBe(400);
    expect(m.get).not.toHaveBeenCalled();
  });

  it("the pose photo must be a saved asset, not an inline upload", async () => {
    const res = await post({ photo: "data:image/png;base64,AAAA", design: DESIGN, box: BOX });
    expect(res.status).toBe(400);
    expect(m.get).not.toHaveBeenCalled();
  });

  it("a url the bucket guard refuses is reported, not fetched elsewhere", async () => {
    m.get.mockResolvedValue({ ok: false, error: "not_a_designs_asset" });
    const res = await post({ photo: "https://evil.example/x.png", design: DESIGN, box: BOX });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("not_a_designs_asset");
  });

  it("prints the design onto the photo inside the box and leaves the rest of the photo", async () => {
    const photo = await png(100, 100, { r: 250, g: 250, b: 250 });
    const design = await png(10, 10, { r: 20, g: 40, b: 200 });
    m.get.mockImplementation(async (url: string) => ({ ok: true, body: url === PHOTO ? photo : design, contentType: "image/png" }));
    const res = await post({ photo: PHOTO, design: DESIGN, box: BOX });
    const json = (await res.json()) as { ok: boolean; image: string };
    expect(json.ok).toBe(true);
    const raw = await sharp(Buffer.from(json.image.split(",")[1], "base64")).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => raw.data[(y * raw.info.width + x) * raw.info.channels + 2];
    expect(at(50, 50)).toBeGreaterThan(150); // blue ink in the box
    expect(raw.data[(50 * raw.info.width + 50) * raw.info.channels]).toBeLessThan(80);
    expect(at(5, 5)).toBeGreaterThan(240); // corner untouched (white)
    expect(raw.data[(5 * raw.info.width + 5) * raw.info.channels]).toBeGreaterThan(240);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { POST } from "./route";

// valid PNG base64 data URL input (200×200 solid block)
async function pngDataUrl(): Promise<string> {
  const buf = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/tools/image/process", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// operator role via claims header — deterministic regardless of NODE_ENV.
const OP = { "x-ops-claims-role": "operator" };

describe("POST /api/tools/image/process — gates", () => {
  beforeEach(() => vi.stubEnv("POD_DESIGNS_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("503 when feature flag is off", async () => {
    vi.stubEnv("POD_DESIGNS_ENABLED", "false");
    const res = await POST(makeRequest({ mode: "canvas", image: "x" }, OP));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("pod_designs_disabled");
  });

  it("403 for a viewer / unauthenticated role", async () => {
    const res = await POST(makeRequest({ mode: "canvas", image: await pngDataUrl() })); // no role header → viewer
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden_role");
  });

  it("400 on unknown mode", async () => {
    const res = await POST(makeRequest({ mode: "bogus", image: await pngDataUrl() }, OP));
    expect(res.status).toBe(400);
  });

  it("400 when image is not a valid data URL", async () => {
    const res = await POST(makeRequest({ mode: "web", image: "not-a-data-url", preset: "web-square" }, OP));
    expect(res.status).toBe(400);
  });

  it("400 on invalid web preset / print destination", async () => {
    const img = await pngDataUrl();
    const r1 = await POST(makeRequest({ mode: "web", image: img, preset: "nope" }, OP));
    expect(r1.status).toBe(400);
    const r2 = await POST(makeRequest({ mode: "print", image: img, destination: "nope" }, OP));
    expect(r2.status).toBe(400);
  });
});

describe("POST /api/tools/image/process — bake modes", () => {
  beforeEach(() => vi.stubEnv("POD_DESIGNS_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("web → sRGB WebP data URL", async () => {
    const res = await POST(makeRequest({ mode: "web", image: await pngDataUrl(), preset: "web-square" }, OP));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.mime).toBe("image/webp");
    expect(j.image.startsWith("data:image/webp;base64,")).toBe(true);
    expect(j.filename).toBe("web-square.webp");
  });

  it("print tgc → sRGB PNG data URL (no OutputIntent needed)", async () => {
    const res = await POST(makeRequest({ mode: "print", image: await pngDataUrl(), destination: "tgc" }, OP));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.mime).toBe("image/png");
    expect(j.filename).toBe("print-tgc.png");
    // verify the returned bytes are a real sRGB PNG sized to TGC bleed box
    const out = Buffer.from(j.image.split(",")[1], "base64");
    const m = await sharp(out).metadata();
    expect(m.format).toBe("png");
    expect(m.width).toBe(898);
    expect(m.height).toBe(1500);
  });

  it("print tw-local (CMYK) → ok:false output_intent_not_deployed (deploy gate, not 500)", async () => {
    const res = await POST(makeRequest({ mode: "print", image: await pngDataUrl(), destination: "tw-local" }, OP));
    expect(res.status).toBe(200); // NOT a 500
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.code).toBe("output_intent_not_deployed");
  });

  it("canvas → echoes the validated image back", async () => {
    const img = await pngDataUrl();
    const res = await POST(makeRequest({ mode: "canvas", image: img }, OP));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.image).toBe(img);
  });

  it("garbage colorGrade does not 500 the web bake [defense-in-depth]", async () => {
    const res = await POST(
      makeRequest(
        { mode: "web", image: await pngDataUrl(), preset: "web-tarot", colorGrade: { hue: "x", saturation: null } },
        OP,
      ),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

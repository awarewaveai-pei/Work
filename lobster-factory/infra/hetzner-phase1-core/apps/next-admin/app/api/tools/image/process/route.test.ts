import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MAX_CONVERSIONS, POST } from "./route";

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

  it("413 when image exceeds the size ceiling", async () => {
    const huge = "data:image/png;base64," + "A".repeat(12_000_001);
    const res = await POST(makeRequest({ mode: "web", image: huge, preset: "web-square" }, OP));
    expect(res.status).toBe(413);
  });

  it("valid prefix + garbage base64 payload → ok:false bake_failed (caught, not 500)", async () => {
    const res = await POST(
      makeRequest({ mode: "web", image: "data:image/png;base64,@@@@notvalid", preset: "web-square" }, OP),
    );
    expect(res.status).toBe(200); // caught, not 500
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.code).toBe("bake_failed");
  });

  it("mpc (CMYK) also hits the OutputIntent deploy gate (same as tw-local)", async () => {
    const res = await POST(makeRequest({ mode: "print", image: await pngDataUrl(), destination: "mpc" }, OP));
    expect(res.status).toBe(200);
    expect((await res.json()).code).toBe("output_intent_not_deployed");
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

  it("web-original keeps a 3:2 source as 3:2", async () => {
    const buf = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 20, g: 40, b: 60 } },
    })
      .png()
      .toBuffer();
    const image = `data:image/png;base64,${buf.toString("base64")}`;
    const res = await POST(makeRequest({ mode: "web", image, preset: "web-original" }, OP));
    const j = await res.json();
    const out = Buffer.from(j.image.split(",")[1], "base64");
    const meta = await sharp(out).metadata();
    expect(j.ok).toBe(true);
    expect(j.filename).toBe("web-original.webp");
    expect([meta.width, meta.height]).toEqual([300, 200]);
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

  it("canvas → echoes the validated image back with the REAL mime (not hardcoded png)", async () => {
    const img = await pngDataUrl();
    const res = await POST(makeRequest({ mode: "canvas", image: img }, OP));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.image).toBe(img);
    expect(j.mime).toBe("image/png");
    expect(j.filename).toBe("canvas.png");
  });

  it("canvas with a webp input reports image/webp, NOT image/png [critic Major]", async () => {
    const buf = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .webp()
      .toBuffer();
    const img = `data:image/webp;base64,${buf.toString("base64")}`;
    const res = await POST(makeRequest({ mode: "canvas", image: img }, OP));
    const j = await res.json();
    expect(j.mime).toBe("image/webp");
    expect(j.filename).toBe("canvas.webp");
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

describe("POST /api/tools/image/process — concurrency cap", () => {
  beforeEach(() => vi.stubEnv("POD_DESIGNS_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a conversion past the cap with 429 and frees the slot when one finishes", async () => {
    const image = await pngDataUrl();
    const web = () => POST(makeRequest({ mode: "web", image, preset: "web-tarot" }, OP));
    // start MAX_CONVERSIONS + 1 at once: each reaches the counter before any conversion (sharp, awaited) finishes
    const results = await Promise.all(Array.from({ length: MAX_CONVERSIONS + 1 }, web));
    const codes = results.map((r) => r.status).sort();
    expect(codes.filter((c) => c === 429)).toHaveLength(1);
    expect((await results.find((r) => r.status === 429)!.json()).code).toBe("busy");
    // every slot is released (finally), so the next one runs
    expect((await web()).status).toBe(200);
  });

  it("canvas pass-through is not counted", async () => {
    const image = await pngDataUrl();
    const res = await Promise.all(Array.from({ length: MAX_CONVERSIONS + 2 }, () => POST(makeRequest({ mode: "canvas", image }, OP))));
    expect(res.every((r) => r.status === 200)).toBe(true);
  });
});

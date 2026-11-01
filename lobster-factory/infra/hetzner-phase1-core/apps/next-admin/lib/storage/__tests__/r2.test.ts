import { describe, expect, it } from "vitest";
import { buildDesignKey, extensionForMime, parseImageDataUrl, sha256Hex } from "../r2";

describe("parseImageDataUrl", () => {
  it("parses a valid png data url", () => {
    const buf = Buffer.from("hello");
    const parsed = parseImageDataUrl(`data:image/png;base64,${buf.toString("base64")}`);
    expect(parsed).not.toBeNull();
    expect(parsed!.mime).toBe("image/png");
    expect(parsed!.buffer.equals(buf)).toBe(true);
  });

  it("accepts jpeg and webp, rejects everything else", () => {
    const b64 = Buffer.from("x").toString("base64");
    expect(parseImageDataUrl(`data:image/jpeg;base64,${b64}`)?.mime).toBe("image/jpeg");
    expect(parseImageDataUrl(`data:image/webp;base64,${b64}`)?.mime).toBe("image/webp");
    expect(parseImageDataUrl(`data:image/gif;base64,${b64}`)).toBeNull();
    expect(parseImageDataUrl(`data:text/html;base64,${b64}`)).toBeNull();
    expect(parseImageDataUrl("not a data url")).toBeNull();
  });
});

describe("buildDesignKey", () => {
  it("builds designs/YYYY-MM/<uuid>.<ext> keys", () => {
    const key = buildDesignKey("image/png", new Date(Date.UTC(2026, 5, 11)));
    expect(key).toMatch(/^designs\/2026-06\/[0-9a-f-]{36}\.png$/);
  });

  it("builds an mp4 key for uploaded video (designs/YYYY-MM/<uuid>.mp4)", () => {
    const key = buildDesignKey("video/mp4", new Date(Date.UTC(2026, 5, 23)));
    expect(key).toMatch(/^designs\/2026-06\/[0-9a-f-]{36}\.mp4$/);
  });

  it("returns null for unsupported mime", () => {
    expect(buildDesignKey("image/gif")).toBeNull();
  });
});

describe("extensionForMime", () => {
  it("maps the supported mimes (incl. uploaded mp4)", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("video/mp4")).toBe("mp4");
    expect(extensionForMime("image/svg+xml")).toBeNull();
  });
});

describe("sha256Hex", () => {
  it("matches a known vector", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

// 2026-11-01: a designs-bucket public url ending in ../../<bucket>/objects/<key> made the R2 API read ANOTHER bucket.
describe("an object request never leaves its own bucket", () => {
  it("isSafeObjectKey refuses dot, empty and control segments, accepts minted keys", async () => {
    const { isSafeObjectKey } = await import("../r2");
    expect(isSafeObjectKey("designs/2026-11/0b9e6f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png")).toBe(true);
    for (const k of ["../x", "designs/../../other/objects/k", "designs/./x", "designs//x", "/x", "", "a\b", "a\nb"]) {
      expect(isSafeObjectKey(k), k).toBe(false);
    }
  });

  it("getDesignObjectByUrl names only minted design keys and fetches nothing for the rest", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("R2_API_TOKEN", "t");
    vi.stubEnv("R2_ACCOUNT_ID", "acc");
    vi.stubEnv("R2_DESIGNS_PUBLIC_BASE", "https://pub-test.r2.dev");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("img", { status: 200 }));
    try {
      const { getDesignObjectByUrl } = await import("../r2");
      const base = "https://pub-test.r2.dev";
      for (const u of [
        `${base}/../../site-watch/objects/org/page.jpg`,
        `${base}/%2E%2E/%2E%2E/site-watch/objects/k`,
        `${base}/%2e%2e%2f%2e%2e%2fsite-watch%2fobjects%2fk`,
        `${base}/designs/2026-11/not-a-uuid.png`,
        `${base}/video/x/y.mp4`,
        `${base}/designs/2026-11/%E0.png`,
        "https://pub-test.r2.dev.evil.example/designs/2026-11/0b9e6f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png",
      ]) {
        expect((await getDesignObjectByUrl(u, 1000)).ok, u).toBe(false);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      const ok = await getDesignObjectByUrl(`${base}/designs/2026-11/0b9e6f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png`, 1000);
      expect(ok.ok).toBe(true);
      expect(String(fetchSpy.mock.calls[0][0])).toBe(
        "https://api.cloudflare.com/client/v4/accounts/acc/r2/buckets/lobster-designs/objects/designs/2026-11/0b9e6f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png");
    } finally {
      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

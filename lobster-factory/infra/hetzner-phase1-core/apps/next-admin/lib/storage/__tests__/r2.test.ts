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

  it("returns null for unsupported mime", () => {
    expect(buildDesignKey("image/gif")).toBeNull();
  });
});

describe("extensionForMime", () => {
  it("maps the three supported mimes", () => {
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
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

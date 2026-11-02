import { describe, it, expect } from "vitest";
import { buildSemanticFilename, buildSemanticBase, buildUniqueFilename, extOf, extOfDataUrl } from "../semantic-filename";

describe("buildUniqueFilename (mockup downloads, 2026-11-02)", () => {
  const now = new Date(2026, 10, 2, 15, 30, 12);
  it("semantic name + local stamp + random tag, extension from the data URL", () => {
    expect(
      buildUniqueFilename({ product: "商品圖", subject: "老虎", style: "平拍", track: "white" }, extOfDataUrl("data:image/jpeg;base64,xx", "png"), "mockup", now, () => 0.5),
    ).toBe("商品圖-老虎-平拍-white-20261102-153012-i000.jpg");
  });
  it("two downloads of the same setup differ; empty meta uses the fallback base", () => {
    const a = buildUniqueFilename({}, "png", "mockup", now, () => 0.1);
    const b = buildUniqueFilename({}, "png", "mockup", now, () => 0.2);
    expect(a).not.toBe(b);
    expect(a.startsWith("mockup-20261102-153012-")).toBe(true);
  });
  it("extOfDataUrl falls back for non-image or remote URLs", () => {
    expect(extOfDataUrl("https://x/y.png", "jpg")).toBe("jpg");
    expect(extOfDataUrl("data:image/webp;base64,xx", "png")).toBe("webp");
  });
});

describe("buildSemanticFilename", () => {
  it("joins 產品-主圖名稱-風格-軌 with the given extension", () => {
    expect(
      buildSemanticFilename(
        { product: "塔羅卡", subject: "月亮女神", style: "水彩", track: "網頁" },
        "webp",
        "fallback.webp",
      ),
    ).toBe("塔羅卡-月亮女神-水彩-網頁.webp");
  });

  it("drops empty/undefined segments", () => {
    expect(buildSemanticFilename({ product: "T-shirt", style: "Watercolor" }, "png", "x.png")).toBe(
      "T-shirt-Watercolor.png",
    );
  });

  it("sanitises path separators and reserved chars to dashes (slash is NOT a path)", () => {
    expect(
      buildSemanticFilename({ product: "a/b", subject: "c:d*e", style: 'f"g<h>' }, "png", "x.png"),
    ).toBe("a-b-c-d-e-f-g-h.png");
  });

  it("collapses whitespace and repeated dashes, trims edges", () => {
    expect(
      buildSemanticFilename({ product: "  lotus   flower  ", subject: "--mandala--" }, "png", "x.png"),
    ).toBe("lotus-flower-mandala.png");
  });

  it("returns the fallback when every segment is empty", () => {
    expect(
      buildSemanticFilename({ product: "  ", subject: "///", style: "" }, "webp", "web-square.webp"),
    ).toBe("web-square.webp");
    expect(buildSemanticFilename({}, "png", "design.png")).toBe("design.png");
  });

  it("strips ASCII control chars (un-saveable on Windows)", () => {
    // BEL (0x07) + NUL (0x00) between letters → stripped to dash separators
    const subject = "a" + String.fromCharCode(7) + "b" + String.fromCharCode(0) + "c";
    expect(buildSemanticFilename({ subject }, "png", "f.png")).toBe("a-b-c.png");
  });

  it("drops content-less segments (dot-only / punctuation-only) instead of forming '.-.-.'", () => {
    expect(buildSemanticFilename({ subject: ". . .", style: "水彩" }, "png", "f.png")).toBe("水彩.png");
    // dots inside a real segment are normalised, never left as a leading dot
    expect(buildSemanticFilename({ subject: "v1.2.3" }, "png", "f.png")).toBe("v1-2-3.png");
  });

  it("truncates on code points so a surrogate pair is never split", () => {
    const out = buildSemanticFilename({ subject: "a".repeat(119) + "😀" }, "png", "f.png");
    // no lone high surrogate immediately before the extension
    expect(out).not.toMatch(/[\uD800-\uDBFF]\.png$/);
  });

  it("returns base with no trailing dot when ext is empty", () => {
    expect(buildSemanticFilename({ subject: "hi" }, "", "fb.png")).toBe("hi");
  });

  it("caps the base length under filesystem limits", () => {
    const long = "x".repeat(300);
    const out = buildSemanticFilename({ subject: long }, "png", "f.png");
    expect(out.endsWith(".png")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(124); // 120 base + ".png"
  });
});

describe("buildSemanticBase", () => {
  it("returns the extension-less base, or undefined when empty", () => {
    expect(buildSemanticBase({ product: "塔羅卡", subject: "月亮" })).toBe("塔羅卡-月亮");
    expect(buildSemanticBase({})).toBeUndefined();
    expect(buildSemanticBase({ subject: "///" })).toBeUndefined();
  });
});

describe("extOf", () => {
  it("pulls the extension off a server filename", () => {
    expect(extOf("web-square.webp", "bin")).toBe("webp");
    expect(extOf("print-tgc.pdf", "bin")).toBe("pdf");
  });

  it("falls back when there is no usable extension", () => {
    expect(extOf(undefined, "webp")).toBe("webp");
    expect(extOf("noext", "webp")).toBe("webp");
    expect(extOf("trailingdot.", "webp")).toBe("webp");
    expect(extOf(".hidden", "webp")).toBe("webp"); // leading dot only → not an extension
  });
});

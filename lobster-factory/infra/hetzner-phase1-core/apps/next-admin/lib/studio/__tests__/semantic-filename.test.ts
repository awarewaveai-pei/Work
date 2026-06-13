import { describe, it, expect } from "vitest";
import { buildSemanticFilename, extOf } from "../semantic-filename";

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
    expect(buildSemanticFilename({ product: "  ", subject: "///", style: "" }, "webp", "web-square.webp")).toBe(
      "web-square.webp",
    );
    expect(buildSemanticFilename({}, "png", "design.png")).toBe("design.png");
  });

  it("caps the base length under filesystem limits", () => {
    const long = "x".repeat(300);
    const out = buildSemanticFilename({ subject: long }, "png", "f.png");
    expect(out.endsWith(".png")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(124); // 120 base + ".png"
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
  });
});

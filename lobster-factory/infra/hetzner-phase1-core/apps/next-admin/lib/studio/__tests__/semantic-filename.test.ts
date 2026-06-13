import { describe, it, expect } from "vitest";
import { buildSemanticFilename, buildSemanticBase, extOf } from "../semantic-filename";

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

  it("strips ASCII control chars (un-saveable on Windows)", () => {
    expect(buildSemanticFilename({ subject: "abc" }, "png", "f.png")).toBe("a-b-c.png");
  });

  it("drops content-less segments (dot-only / punctuation-only) instead of forming '.-.-.'", () => {
    expect(buildSemanticFilename({ subject: ". . .", style: "水彩" }, "png", "f.png")).toBe("水彩.png");
    // dots inside a real segment are normalised, never left as a leading dot
    expect(buildSemanticFilename({ subject: "v1.2.3" }, "png", "f.png")).toBe("v1-2-3.png");
  });

  it("truncates on code points so a surrogate pair is never split", () => {
    const out = buildSemanticFilename({ subject: "a".repeat(119) + "😀" }, "png", "f.png");
    // last base char must be the whole emoji or the trimmed 'a', never a lone surrogate
    expect(out).not.toMatch(/[\uD800-\uDBFF]\./); // no high surrogate immediately before ".png"
  });

  it("returns base with no trailing dot when ext is empty", () => {
    expect(buildSemanticFilename({ subject: "hi" }, "", "fb.png")).toBe("hi");
  });

  it("buildSemanticBase returns the extension-less base, or undefined when empty", () => {
    expect(buildSemanticBase({ product: "塔羅卡", subject: "月亮" })).toBe("塔羅卡-月亮");
    expect(buildSemanticBase({})).toBeUndefined();
    expect(buildSemanticBase({ subject: "///" })).toBeUndefined();
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

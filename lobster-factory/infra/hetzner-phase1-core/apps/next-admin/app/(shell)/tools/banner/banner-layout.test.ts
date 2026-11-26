// Card R2-A (named tests a-d): the layout engine -- no two boxes overlap and all are inside the canvas at every size and
// placement; a position control always moves its element (even over an old AI answer's coordinates); the automatic
// title has no lone-character line and is legible on 3:1; the reflection grows with its length and stays in the canvas.
import { describe, expect, it } from "vitest";
import { applySemantic, layoutBanner, REF_PX, type LayoutMeasure } from "./banner-layout";
import { DEFAULT_CTA_SHADOW, DEFAULT_TEXT_SHADOW, type BannerFields, type ElemBox, type ElemPositions } from "./banner-layers";

// The 10 sizes of the tool (BannerStudio PRESETS). After R2-B moves them to banner-state.ts, import PRESETS from there so
// a new size (2:1) is covered here automatically.
const SIZES: Record<string, { w: number; h: number }> = {
  r9x16: { w: 1080, h: 1920 }, r2x3: { w: 1000, h: 1500 }, r3x4: { w: 1080, h: 1440 }, r4x5: { w: 1080, h: 1350 },
  r1x1: { w: 1080, h: 1080 }, r4x3: { w: 1200, h: 900 }, r3x2: { w: 1200, h: 800 }, r16x9: { w: 1920, h: 1080 },
  r191x1: { w: 1200, h: 630 }, r3x1: { w: 1920, h: 640 },
};

// CJK = a square em, anything else 0.55 em; pictures by name
const measure: LayoutMeasure = {
  text: (font, t) => {
    const px = Number(/(\d+)px/.exec(font)?.[1] ?? REF_PX);
    return Array.from(t).reduce((sum, c) => sum + (/[　-鿿豈-￯]/.test(c) ? px : px * 0.55), 0);
  },
  image: (src) => ({ product: { w: 800, h: 1000 }, slim: { w: 300, h: 900 }, logo: { w: 400, h: 160 } } as Record<string, { w: number; h: number }>)[src] ?? null,
};

const base: BannerFields = {
  bgMode: "color", bgColor: "#1e293b", gradFrom: "#000000", gradTo: "#ffffff", gradAngle: "135",
  bgImage: null, bgImageHasProduct: false, dimOverlay: false, dimOverlayOpacity: 0.3,
  productImage: null, productPos: "right", productScale: 0.6,
  headline: "不會畫畫也能被療癒", subtext: "週末兩小時，跟著老師畫出第一幅作品", textColor: "#ffffff", fontFamily: "Noto Sans TC", headlineFont: "",
  accentColor: "#fbbf24", accentHighlight: false, letterSpacing: 0, headlineSize: 64, subtextSize: 32,
  textPos: "center", textAlignH: "center", textScrim: false, textScrimOpacity: 0.4, textOutline: false, brandBar: false, balanceTitle: false,
  ctaText: "立即報名", ctaBg: "#ff5a5f", ctaTextColor: "#ffffff",
  badgeText: "", badgeStyle: "pill", badgeColor: "#e11d48", badgePos: "tl", badgeScale: 1,
  showPrice: false, priceNow: "", priceWas: "", trustType: "none", trustStars: 5, trustText: "",
  bgImgScale: 1, bgImgX: 0, bgImgY: 0,
  textShadow: DEFAULT_TEXT_SHADOW, ctaShadow: DEFAULT_CTA_SHADOW, badgeShadow: null,
  headlineWeight: 700, bodyWeight: 400, headlineLineHeight: 1.16, bodyLineHeight: 1.32, bodyLetterSpacing: 0,
  kinsoku: true, cjkSpacing: true,
};
const everything: BannerFields = {
  ...base, typeAuto: true, productImage: "product", logoImage: "logo",
  badgeText: "限時優惠", showPrice: true, priceNow: "NT$590", priceWas: "NT$890", trustType: "reviews",
  grounding: { reflection: { enabled: true, height: 0.35 } },
};

const overlap = (a: ElemBox, b: ElemBox) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const inside = (a: ElemBox, s: { w: number; h: number }) => a.x >= -0.5 && a.y >= -0.5 && a.x + a.w <= s.w + 0.5 && a.y + a.h <= s.h + 0.5;

describe("(a) the automatic layout never overlaps and stays inside", () => {
  it("10 sizes x badge tl/tr x logo 4 corners x product 4 places (wide and slim picture) x text top/center/bottom", () => {
    const bad: string[] = [];
    for (const productImage of ["product", "slim"])
    for (const [key, size] of Object.entries(SIZES))
      for (const badgePos of ["tl", "tr"] as const)
        for (const logoPos of ["tl", "tr", "bl", "br"] as const)
          for (const productPos of ["center", "left", "right", "bottom-right"] as const)
            for (const textPos of ["top", "center", "bottom"] as const) {
              const L = layoutBanner({ ...everything, productImage, badgePos, logoPos, productPos, textPos }, size, measure);
              const named: [string, ElemBox][] = [
                ...(["headline", "subtext", "price", "cta", "trust", "badge", "logo"] as const).map((k) => [k, L.boxes[k]!] as [string, ElemBox]),
                ["product", L.product!.box], ["reflection", L.product!.reflection!],
              ];
              const at = `${productImage} ${key} badge=${badgePos} logo=${logoPos} product=${productPos} text=${textPos}`;
              for (const [n, b] of named) {
                if (!b) { bad.push(`${at}: ${n} missing`); continue; }
                if (!inside(b, size)) bad.push(`${at}: ${n} outside ${JSON.stringify(b)}`);
              }
              for (let i = 0; i < named.length; i++)
                for (let j = i + 1; j < named.length; j++) {
                  const [n1, b1] = named[i], [n2, b2] = named[j];
                  if (n1 === "product" && n2 === "reflection") continue; // one group: the mirror touches the product
                  if (b1 && b2 && overlap(b1, b2)) bad.push(`${at}: ${n1} x ${n2}`);
                }
            }
    expect(bad.slice(0, 20)).toEqual([]);
  });
});

describe("(b) a position control moves its element over an old AI answer's coordinates", () => {
  // the old multi-size answer pinned every element
  const pinned: ElemPositions = {
    headline: { x: 0.5, y: 0.3 }, subtext: { x: 0.5, y: 0.42 }, cta: { x: 0.5, y: 0.55 },
    product: { x: 0.5, y: 0.75 }, badge: { x: 0.15, y: 0.08 }, logo: { x: 0.15, y: 0.92 },
  };
  const st = { ...everything, showPrice: false, trustType: "none" as const, positions: pinned };
  const size = SIZES.r4x5;
  const box = (f: BannerFields, k: "badge" | "headline" | "product") => layoutBanner(f, size, measure).boxes[k]!;
  it.each([
    ["badgePos", { badgePos: "tr" }, "badge"],
    ["textPos", { textPos: "bottom" }, "headline"],
    ["productPos", { productPos: "left" }, "product"],
  ] as const)("%s", (_n, patch, k) => {
    const before = box(st, k);
    expect(box({ ...st, ...patch }, k)).toEqual(before);                       // a plain patch: the pin wins (the bug)
    expect(box(applySemantic(st, patch as Partial<BannerFields>), k)).not.toEqual(before); // applySemantic: it moves
    expect(applySemantic(st, patch as Partial<BannerFields>).positions?.headline !== undefined).toBe(k !== "headline");
  });
});

describe("(c) automatic title size", () => {
  const f: BannerFields = { ...base, typeAuto: true };
  it.each(["r4x5", "r1x1", "r3x1"])("%s: no lone-character line", (key) => {
    const h = layoutBanner(f, SIZES[key], measure).headline!;
    if (h.lines.length > 1) for (const ln of h.lines) expect(Array.from(ln.map((r) => r.text).join("")).length).toBeGreaterThan(1);
  });
  it("3:1: the title is at least 12% of the banner's height", () => {
    const h = layoutBanner(f, SIZES.r3x1, measure).headline!;
    expect(h.box.h).toBeGreaterThanOrEqual(SIZES.r3x1.h * 0.12);
  });
});

describe("(d) reflection length", () => {
  it("a centred product's reflection grows from 0.35 to 1.0 and stays inside", () => {
    const size = SIZES.r4x5;
    let last = 0;
    for (let k = 35; k <= 100; k += 5) {
      const L = layoutBanner({ ...base, productImage: "product", productPos: "center", textPos: "top",
        grounding: { reflection: { enabled: true, height: k / 100 } } }, size, measure);
      const r = L.product!.reflection!;
      expect(inside(r, size)).toBe(true);
      expect(r.h).toBeGreaterThan(last);
      last = r.h;
    }
  });
});

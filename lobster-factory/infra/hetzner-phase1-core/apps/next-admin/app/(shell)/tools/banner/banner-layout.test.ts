// Card R2-A (named tests a-d): the layout engine -- no two boxes overlap and all are inside the canvas at every size and
// placement; a position control always moves its element (even over an old AI answer's coordinates); the automatic
// title has no lone-character line and is legible on 3:1; the reflection grows with its length and stays in the canvas.
import { describe, expect, it } from "vitest";
import { applySemantic, layoutBanner, REF_PX, type LayoutMeasure } from "./banner-layout";
import { DEFAULT_CTA_SHADOW, DEFAULT_TEXT_SHADOW, type BannerFields, type ElemBox, type ElemKey, type ElemPositions } from "./banner-layers";
import { INIT, PRESETS, TEMPLATES, applyLayout, enterSize, templatePatch, type PresetKey, type State } from "./banner-state";

// Every size of the tool: a new preset is covered by the overlap matrix automatically.
const SIZES: Record<string, { w: number; h: number }> = PRESETS;

// CJK = a square em, anything else 0.55 em; pictures by name
const measure: LayoutMeasure = {
  text: (font, t) => {
    const px = Number(/(\d+)px/.exec(font)?.[1] ?? REF_PX);
    return Array.from(t).reduce((sum, c) => sum + (/[　-鿿豈-￯]/.test(c) ? px : px * 0.55), 0);
  },
  image: (src) => ({ product: { w: 800, h: 1000 }, slim: { w: 300, h: 900 }, logo: { w: 400, h: 160 }, tallLogo: { w: 100, h: 400 } } as Record<string, { w: number; h: number }>)[src] ?? null,
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
  it("every size x badge tl/tr x logo 4 corners x product 4 places (wide and slim picture) x logo wide / tall x text top/center/bottom", () => {
    const bad: string[] = [];
    for (const productImage of ["product", "slim"])
    for (const logoImage of ["logo", "tallLogo"])
    for (const [key, size] of Object.entries(SIZES))
      for (const badgePos of ["tl", "tr"] as const)
        for (const logoPos of ["tl", "tr", "bl", "br"] as const)
          for (const productPos of ["center", "left", "right", "bottom-right"] as const)
            for (const textPos of ["top", "center", "bottom"] as const) {
              const L = layoutBanner({ ...everything, productImage, logoImage, badgePos, logoPos, productPos, textPos }, size, measure);
              const named: [string, ElemBox][] = [
                ...(["headline", "subtext", "price", "cta", "trust", "badge", "logo"] as const).map((k) => [k, L.boxes[k]!] as [string, ElemBox]),
                ["product", L.product!.box], ["reflection", L.product!.reflection!],
              ];
              const at = `${productImage} ${logoImage} ${key} badge=${badgePos} logo=${logoPos} product=${productPos} text=${textPos}`;
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

describe("R2-B2: every position button and template moves its element over a drag (applyLayout)", () => {
  // every element dragged into the far bottom-left corner -- nowhere an automatic placement puts it
  const corner: ElemPositions = Object.fromEntries(
    (["headline", "subtext", "price", "cta", "trust", "product", "badge", "logo"] as const).map((k) => [k, { x: 0.02, y: 0.98 }]));
  const dragged: State = { ...INIT, ...(everything as Partial<State>), typeAuto: true, positions: corner } as State;
  const boxOf = (st: State, k: ElemKey) => layoutBanner(st, PRESETS[st.preset], measure).boxes[k];
  const buttons: [string, Partial<State>, ElemKey][] = [
    ...(["top", "center", "bottom"] as const).map((v) => [`文字 ${v}`, { textPos: v }, "headline"] as [string, Partial<State>, ElemKey]),
    ...(["left", "center", "right"] as const).map((v) => [`對齊 ${v}`, { textAlignH: v }, "headline"] as [string, Partial<State>, ElemKey]),
    ...(["tl", "tr"] as const).map((v) => [`徽章 ${v}`, { badgePos: v }, "badge"] as [string, Partial<State>, ElemKey]),
    ...(["center", "left", "right", "bottom-right"] as const).map((v) => [`產品 ${v}`, { productPos: v }, "product"] as [string, Partial<State>, ElemKey]),
    ...TEMPLATES.map((t) => [`模板 ${t.key}`, templatePatch(t, "r4x5"), "headline"] as [string, Partial<State>, ElemKey]),
  ];
  it.each(buttons)("%s", (_n, patch, k) => {
    for (const preset of ["r4x5", "r16x9"] as PresetKey[]) {
      const st = { ...dragged, preset };
      const before = boxOf(st, k)!;
      const after = applyLayout(st, patch);
      expect(after.positions[k]).toBeUndefined();
      expect(boxOf(after, k)).not.toEqual(before);
    }
  });

  it("on the main size, a size tweak that inherits the field loses that drag; one that sets the field keeps it", () => {
    const st: State = { ...dragged, positions: {}, multiSizes: ["r16x9", "r1x1"], sizeOverrides: {
      r16x9: { positions: { badge: { x: 0.02, y: 0.98 }, logo: { x: 0.9, y: 0.9 } } },
      r1x1: { badgePos: "tl", positions: { badge: { x: 0.02, y: 0.98 } } },
    } };
    const next = applyLayout(st, { badgePos: "tr" });
    expect(next.sizeOverrides.r16x9?.positions).toEqual({ logo: { x: 0.9, y: 0.9 } });
    expect(next.sizeOverrides.r1x1?.positions).toEqual({ badge: { x: 0.02, y: 0.98 } });
  });

  it("while a size is tweaked only that size's drag goes (the main design's stays)", () => {
    const st = enterSize({ ...dragged, multiSizes: ["r16x9"] }, "r16x9");
    const next = applyLayout(st, { productPos: "left" });
    expect(next.positions.product).toBeUndefined();
    expect(next.editingSize?.main.positions?.product).toEqual({ x: 0.02, y: 0.98 });
  });

  it("an opener keeps its fixed title size; any other template turns 自動字級 back on", () => {
    const opener = TEMPLATES.find((t) => t.group === "opener")!, plain = TEMPLATES.find((t) => !t.group)!;
    const o = applyLayout(dragged, templatePatch(opener, "r4x5"));
    expect(o.typeAuto).toBe(false);
    expect(o.headlineSize).toBe(Math.round(Math.min(1080 * 0.1, 1350 * 0.15)));
    expect(applyLayout(o, templatePatch(plain, "r4x5"))).toMatchObject({ typeAuto: true, balanceTitle: false, brandBar: false });
  });
});

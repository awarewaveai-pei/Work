// Card R2-A (named tests a-d): the layout engine -- no two boxes overlap and all are inside the canvas at every size and
// placement; a position control always moves its element (even over an old AI answer's coordinates); the automatic
// title has no lone-character line (R4: its size range is tested in R4-A); the reflection grows and stays in the canvas.
import { describe, expect, it } from "vitest";
import { applySemantic, areaOnCanvas, layoutBanner, reservedAreas, LOGO_AUTO, LOGO_CLEAR, LOGO_TITLE, REF_PX, type LayoutMeasure } from "./banner-layout";
import { DEFAULT_CTA_SHADOW, DEFAULT_TEXT_SHADOW, type BannerFields, type ElemBox, type ElemKey, type ElemPositions } from "./banner-layers";
import { INIT, PRESETS, RATIO_PRESET, TEMPLATES, applyLayout, enterSize, templatePatch, variantOf, withSizeBackgrounds, type PresetKey, type State } from "./banner-state";
import { COMPOSITION, TEXT_SHARE_MAX, type LayoutSize } from "./composition";
import { SUB_RATIO, titleRange } from "./field-ranges";
import { shapeLayout } from "./banner-design";
import { sizeFileName } from "./steps/export-files";

// Every size of the tool: a new preset is covered by the overlap matrix automatically.
const SIZES: Record<string, LayoutSize> = PRESETS;

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
  it("every size x badge tl/tr x logo 4 corners x product 4 places (wide and slim picture, drawn / baked into the AI scene) x logo wide / tall x text top/center/bottom", () => {
    const bad: string[] = [];
    // R3-D: a product baked into the AI background is not drawn, but its area stays reserved -- the text keeps clear of it
    for (const baked of [false, true])
    for (const productImage of ["product", "slim"])
    for (const logoImage of ["logo", "tallLogo"])
    for (const [key, size] of Object.entries(SIZES))
      for (const badgePos of ["tl", "tr"] as const)
        for (const logoPos of ["tl", "tr", "bl", "br"] as const)
          for (const productPos of ["center", "left", "right", "bottom-right"] as const)
            for (const textPos of ["top", "center", "bottom"] as const) {
              const bg = baked ? { bgMode: "ai" as const, bgImage: "scene", bgImageHasProduct: true } : {};
              const L = layoutBanner({ ...everything, ...bg, productImage, logoImage, badgePos, logoPos, productPos, textPos }, size, measure);
              if (L.product?.drawn === baked || (baked && L.boxes.product)) bad.push(`baked=${baked}: product drawn=${L.product?.drawn}`);
              // R3-A: the logo counts with its clear space (25% of its height on every side)
              const lb = L.boxes.logo!, c = lb ? lb.h * LOGO_CLEAR : 0;
              const named: [string, ElemBox][] = [
                ...(["headline", "subtext", "price", "cta", "trust", "badge"] as const).map((k) => [k, L.boxes[k]!] as [string, ElemBox]),
                ["logo+clear", lb && { x: lb.x - c, y: lb.y - c, w: lb.w + 2 * c, h: lb.h + 2 * c }],
                ["product", L.product!.box], ["reflection", L.product!.reflection!],
              ];
              const at = `${baked ? "baked " : ""}${productImage} ${logoImage} ${key} badge=${badgePos} logo=${logoPos} product=${productPos} text=${textPos}`;
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

describe("R3-D: the product area a generation is asked for = the area the layout keeps once the product is baked in", () => {
  it.each(Object.keys(SIZES))("%s, every product place: same box before (drawn, what the prompt gets) and after baking", (key) => {
    for (const productPos of ["center", "left", "right", "bottom-right"] as const) {
      const f: BannerFields = { ...everything, productPos };
      const asked = reservedAreas(layoutBanner(f, SIZES[key], measure));
      const after = layoutBanner({ ...f, bgMode: "ai", bgImage: "scene", bgImageHasProduct: true }, SIZES[key], measure);
      expect(asked.product).not.toBeNull();
      expect(reservedAreas(after)).toEqual(asked);
      expect(after.product!.box).toEqual(asked.product);
      expect(after.product!.drawn).toBe(false);
    }
  });
});

// Codex on R3-D (R3-E): a baked-in product's reserved area follows THE PICTURE, not productPos -- (F1) the background
// dragged / zoomed moves the product with it; (F2) a size whose composite failed crops the main size's picture, so its
// product is where the main picture's product lands on that size. The text keeps clear of that box.
describe("R3-E: a baked product's reserved area = where the product is in the picture as drawn", () => {
  const pics: Record<string, { w: number; h: number }> = { scene45: { w: 864, h: 1080 }, scene916: { w: 1080, h: 1920 } };
  const m2: LayoutMeasure = { text: measure.text, image: (src) => pics[src] ?? measure.image(src) };
  const area = { x0: 0.55, y0: 0.35, x1: 0.92, y1: 0.85 }; // asked for at the right of a 4:5 picture
  const bakedF: BannerFields = { ...everything, productPos: "right", bgMode: "ai", bgImage: "scene45", bgImageHasProduct: true, bgProductArea: area };
  const clear = (L: ReturnType<typeof layoutBanner>) => (["headline", "subtext", "price", "cta", "trust"] as const)
    .filter((k) => L.boxes[k] && overlap(L.boxes[k]!, L.product!.box));
  // Codex on R3-E (F3): the product picture removed after baking -- the product is still in the background, so its area
  // stays reserved (the background decides, not productImage)
  it("F3: product picture removed -> the baked product's area is still reserved, text clear of it", () => {
    const size = SIZES.r4x5, L = layoutBanner({ ...bakedF, productImage: null }, size, m2);
    expect(L.product?.box).toEqual(areaOnCanvas(area, pics.scene45, bakedF, size.w, size.h));
    expect(L.product!.drawn).toBe(false);
    expect(clear(L)).toEqual([]);
  });
  it("F1: the background dragged / zoomed -> the reserved box moves / grows with the picture; text keeps clear", () => {
    const size = SIZES.r4x5;
    const still = layoutBanner(bakedF, size, m2).product!.box;
    expect(still).toEqual(areaOnCanvas(area, pics.scene45, bakedF, size.w, size.h));
    const moved = layoutBanner({ ...bakedF, bgImgX: -0.3 }, size, m2);
    expect(moved.product!.box.x).toBeCloseTo(still.x - 0.3 * size.w, 5);
    expect(clear(moved)).toEqual([]);
    const zoomed = layoutBanner({ ...bakedF, bgImgScale: 1.4 }, size, m2);
    expect(zoomed.product!.box.w).toBeGreaterThan(still.w);
    expect(clear(zoomed)).toEqual([]);
    // productPos no longer decides it: a left button press does not move the reservation off the product
    expect(layoutBanner({ ...bakedF, productPos: "left" }, size, m2).product!.box).toEqual(still);
  });
  it("F2: a size whose composite failed uses the main picture -> its reservation is the main product on that size", () => {
    const st: State = { ...INIT, ...bakedF, preset: "r4x5", multiSizes: ["r9x16", "r16x9", "r1x1"], typeAuto: true } as State;
    const done = withSizeBackgrounds(st, { r4x5: { image: "scene45", area }, r9x16: { image: "scene916", area: { x0: 0.2, y0: 0.55, x1: 0.8, y1: 0.95 } } },
      ["r4x5", "r9x16", "r16x9", "r1x1"]);
    for (const k of ["r16x9", "r1x1"] as const) { // failed: no picture of their own
      const v = variantOf(done, k), size = SIZES[k];
      expect(v).toMatchObject({ bgImage: "scene45", bgProductArea: area });
      const L = layoutBanner(v, size, m2);
      expect(L.product!.box).toEqual(areaOnCanvas(area, pics.scene45, v, size.w, size.h));
      expect(L.product!.drawn).toBe(false);
      expect(clear(L)).toEqual([]);
    }
    const own = layoutBanner(variantOf(done, "r9x16"), SIZES.r9x16, m2);
    expect(own.product!.box).toEqual(areaOnCanvas({ x0: 0.2, y0: 0.55, x1: 0.8, y1: 0.95 }, pics.scene916, BASE_PLACE, SIZES.r9x16.w, SIZES.r9x16.h));
    expect(clear(own)).toEqual([]);
  });
});
const BASE_PLACE = { bgImgScale: 1, bgImgX: 0, bgImgY: 0 };

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
});

// R4-A (PLAN-R4 §1 #2-3, t1/T1-measure.md 決定 1-2): the automatic title stays in its size's range (36-57 px as shown at
// displayW), the subtitle is title / 1.25; each size is in its composition group; 9:16 keeps Meta Reels' bands.
describe("R4-A: title range, composition groups, 9:16 safe bands", () => {
  // the T1 run's words and product (中央, 60%)
  const t1: BannerFields = { ...base, typeAuto: true, headline: "用香氣與色彩，療癒疲憊的心", subtext: "精油芳療×藝術治療體驗課｜立即報名",
    ctaText: "", productImage: "product", productPos: "center", productScale: 0.6 };
  it.each(Object.keys(SIZES).filter((k) => k !== "r16x9"))("%s (its group's layout): title in its range, subtitle = title / 1.25; never above the range", (key) => {
    const size = SIZES[key], r = titleRange(size.w, size.displayW);
    const L = layoutBanner({ ...t1, ...COMPOSITION[size.group].layout }, size, measure);
    expect(L.headlineSize).toBeGreaterThanOrEqual(r.min);
    expect(L.headlineSize).toBeLessThanOrEqual(r.max);
    expect(L.subtextSize).toBe(Math.round(L.headlineSize / SUB_RATIO));
    for (const productPos of ["center", "left", "right", "bottom-right"] as const)
      for (const textPos of ["top", "center", "bottom"] as const) {
        const hs = layoutBanner({ ...t1, productPos, textPos }, size, measure).headlineSize;
        expect(hs).toBeGreaterThanOrEqual(r.min);
        expect(hs).toBeLessThanOrEqual(r.max);
      }
  });
  // Supervisor's rule (R4-A follow-up): the floor wins over the layout's proportions -- too-long words first widen the
  // text column beside the product (55% -> at most 65%), and only then shrink, with belowMin set for the page's notice.
  it("r16x9 社群 + T1 words, card layout: title >= its floor, or belowMin set with the text column <= 65% of the width", () => {
    const size = SIZES.r16x9, r = titleRange(size.w, size.displayW);
    const L = layoutBanner({ ...t1, ...COMPOSITION.card.layout }, size, measure);
    const right = Math.max(...(["headline", "subtext"] as const).map((k) => L.boxes[k]!.x + L.boxes[k]!.w));
    expect(L.headlineSize >= r.min || (L.belowMin === r.min && L.textShare === TEXT_SHARE_MAX && right <= size.w * TEXT_SHARE_MAX + 0.5)).toBe(true);
    for (const k of ["headline", "subtext"] as const) expect(inside(L.boxes[k]!, size)).toBe(true);
    // words that fit at the floor: no flag, the composition's own share
    const short = layoutBanner({ ...t1, ...COMPOSITION.card.layout, headline: "療癒心", subtext: "立即報名" }, size, measure);
    expect(short).toMatchObject({ belowMin: null, textShare: COMPOSITION.card.textShare });
    expect(short.headlineSize).toBeGreaterThanOrEqual(r.min);
  });
  it("the column widens before the title shrinks: a size whose words fit only wider keeps the floor with a share > 55%", () => {
    // 1.91:1 (link card, floor 87 px): a title that needs the wider column
    const size = SIZES.r191x1, r = titleRange(size.w, size.displayW);
    const words = { ...t1, ...COMPOSITION.card.layout, subtext: "" };
    const found = ["用香氣與色彩療癒心", "用香氣與色彩療癒疲憊", "用香氣與色彩，療癒疲憊的心", "用香氣與色彩，療癒疲憊的心與身體"]
      .map((headline) => layoutBanner({ ...words, headline }, size, measure))
      .find((L) => L.textShare > COMPOSITION.card.textShare && L.belowMin === null);
    expect(found?.headlineSize).toBeGreaterThanOrEqual(r.min);
  });
  it("each size's group and shown width (16:9 = 社群 card at 393 + Hero web at 1920; ?ratio=16:9 opens 社群)", () => {
    const groups = Object.fromEntries(Object.entries(PRESETS).map(([k, p]) => [k, `${p.group} ${p.displayW}`]));
    expect(groups).toEqual({
      r9x16: "phone 393", r2x3: "phone 393", r3x4: "phone 393", r4x5: "phone 393", r1x1: "phone 393",
      r4x3: "card 700", r16x9: "card 393", r191x1: "card 500", r2x1: "card 500",
      r16x9hero: "web 1920", r3x1: "web 1920", r3x2: "web 700",
    });
    expect(RATIO_PRESET["16:9"]).toBe("r16x9");
    expect(sizeFileName("r16x9", "png")).toBe("banner-16x9.png");
    expect(sizeFileName("r16x9hero", "png")).toBe("banner-16x9-hero.png");
  });
  it("a size of another group starts from its group's layout; the same group inherits the main size's; the AI default = the table", () => {
    const st: State = { ...INIT, preset: "r4x5", textPos: "bottom", textAlignH: "right", productPos: "left", multiSizes: ["r9x16", "r16x9hero", "r4x3"] };
    expect(variantOf(st, "r9x16")).toMatchObject({ textPos: "bottom", textAlignH: "right", productPos: "left" });
    expect(variantOf(st, "r16x9hero")).toMatchObject(COMPOSITION.web.layout);
    expect(variantOf(st, "r4x3")).toMatchObject(COMPOSITION.card.layout);
    expect(variantOf({ ...st, sizeOverrides: { r4x3: { textPos: "top" } } }, "r4x3").textPos).toBe("top");
    expect(INIT).toMatchObject(COMPOSITION.phone.layout);
    for (const k of Object.keys(PRESETS) as PresetKey[]) expect(shapeLayout(k)).toEqual(COMPOSITION[PRESETS[k].group].layout);
  });
  it("9:16: every text block / badge / logo at or below 14% of the height, the product (and reflection) within the top 65%", () => {
    const size = SIZES.r9x16, bad: string[] = [];
    for (const productPos of ["center", "left", "right", "bottom-right"] as const)
      for (const textPos of ["top", "center", "bottom"] as const)
        for (const f of [t1, everything]) {
          const L = layoutBanner({ ...f, productPos, textPos, logoPos: "bl" }, size, measure);
          for (const k of ["headline", "subtext", "price", "cta", "trust", "badge", "logo"] as const) {
            const b = L.boxes[k];
            if (b && (b.y < size.h * 0.14 - 0.5 || b.y + b.h > size.h * 0.65 + 0.5)) bad.push(`${productPos}/${textPos}: ${k} ${Math.round(b.y)}-${Math.round(b.y + b.h)}`);
          }
          const p = L.product!, bottom = Math.max(p.box.y + p.box.h, p.reflection ? p.reflection.y + p.reflection.h : 0);
          if (p.box.y < size.h * 0.14 - 0.5 || bottom > size.h * 0.65 + 0.5) bad.push(`${productPos}/${textPos}: product ${Math.round(p.box.y)}-${Math.round(bottom)}`);
        }
    expect(bad).toEqual([]);
  });
  it("phone default: words on top, the product under them centred on the lower-right thirds crossing where it fits", () => {
    const size = SIZES.r4x5, L = layoutBanner({ ...t1, ...COMPOSITION.phone.layout }, size, measure), p = L.product!.box;
    expect(L.boxes.headline!.y).toBeLessThan(size.h / 3);
    expect(p.y).toBeGreaterThan(L.boxes.subtext!.y + L.boxes.subtext!.h);
    expect(p.x + p.w / 2).toBeCloseTo(Math.min(size.w * 2 / 3, size.w * 0.95 - p.w / 2), 0);
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

// Card R3-A 一3: 圖二 (9:16, centred, a full-width comma at the end of line 1) drew the line one em past the column --
// the comma hung past the edge (ぶら下げ) and the block width was clamped to the column, so neither the automatic size
// nor a size set by hand noticed. Every drawn line must be inside the text column, at every size, both ways.
describe("R3-A 一3: no title line is drawn past the text column or the canvas", () => {
  const fig2: BannerFields = { ...base, headline: "用香氣與色彩，療癒疲憊的心", subtext: "精油調香結合藝術創作，一堂課找回內在平靜",
    badgeText: "名額有限", badgePos: "tr", trustType: "guarantee", trustText: "專業芳療師與藝術治療師帶領" };
  const outside = (f: BannerFields, key: string) => {
    const size = SIZES[key], L = layoutBanner(f, size, measure), h = L.headline!;
    const x0 = L.padX - 0.5, x1 = size.w - L.padX + 0.5;
    const ax = f.textAlignH === "left" ? h.box.x : f.textAlignH === "right" ? h.box.x + h.box.w : h.box.x + h.box.w / 2;
    const tall = h.box.y < -0.5 || h.box.y + h.box.h > size.h + 0.5 ? [`${key} ${f.typeAuto ? "auto" : f.headlineSize}: title ${Math.round(h.box.y)}..${Math.round(h.box.y + h.box.h)} past the height`] : [];
    return tall.concat(h.lineWs.flatMap((lw, i) => {
      const lx = f.textAlignH === "left" ? ax : f.textAlignH === "right" ? ax - lw : ax - lw / 2;
      return lx < x0 || lx + lw > x1 ? [`${key} ${f.typeAuto ? "auto" : f.headlineSize} ${f.textAlignH} ls=${f.letterSpacing} line ${i}: ${Math.round(lx)}..${Math.round(lx + lw)} col ${x0 + 0.5}..${x1 - 0.5}`] : [];
    }));
  };
  it("11 sizes x 自動字級 and set sizes 40..600 x alignment x letter spacing x balance", () => {
    const bad: string[] = [];
    for (const key of Object.keys(SIZES))
      for (const textAlignH of ["left", "center", "right"] as const)
        for (const letterSpacing of [0, 8])
          for (const balanceTitle of [false, true]) {
            bad.push(...outside({ ...fig2, textAlignH, letterSpacing, balanceTitle, typeAuto: true }, key));
            for (let hs = 40; hs <= 600; hs += 5) bad.push(...outside({ ...fig2, textAlignH, letterSpacing, balanceTitle, typeAuto: false, headlineSize: hs }, key));
          }
    expect(bad.slice(0, 10)).toEqual([]);
  });
  it("a set size that fits is drawn as set; one that does not is drawn smaller and the layout says which", () => {
    const at = (hs: number) => layoutBanner({ ...fig2, typeAuto: false, headlineSize: hs }, SIZES.r9x16, measure);
    expect(at(120).headlineSize).toBe(120);
    const big = at(600);
    expect(big.headlineSize).toBeLessThan(600);
    expect(big.headline!.size).toBe(big.headlineSize);
  });
});

// Codex on R3-A (F2): a size set by hand shrank only for the title / subtitle / stack height, so a price / button / trust
// row (sized from the title) ran past the canvas -- 600x600, title 600 px, NT$999 drew the price at ~468 px. Same
// inRoom as the automatic type: every block of the stack inside the text column.
// (F3) at the smallest size a subtitle with no space (a long URL) was one line past the column: a word wider than the
// column breaks between characters, so every drawn line is within the column at the floor too.
describe("R3-A Codex F2 / F3: every text block inside the column, a size set by hand and at the floor too", () => {
  const sizes = { ...SIZES, sq600: { w: 600, h: 600, ratio: "1:1", displayW: 393, group: "phone" } as LayoutSize };
  const colOf = (L: ReturnType<typeof layoutBanner>) => [L.padX - 0.5, L.w - L.padX + 0.5] as const;
  it("F2: price / button / trust rows stay in the column at every size, title 40..600 px by hand", () => {
    const f: BannerFields = { ...base, typeAuto: false, showPrice: true, priceNow: "NT$999", priceWas: "NT$1,999", trustType: "reviews" };
    const bad: string[] = [];
    for (const [key, size] of Object.entries(sizes))
      for (let hs = 40; hs <= 600; hs += 20) {
        const L = layoutBanner({ ...f, headlineSize: hs, subtextSize: Math.round(hs / 2) }, size, measure), [x0, x1] = colOf(L);
        for (const k of ["headline", "subtext", "price", "cta", "trust"] as const) {
          const b = L.boxes[k]!;
          if (b.x < x0 || b.x + b.w > x1) bad.push(`${key} hs=${hs} ${k}: ${Math.round(b.x)}..${Math.round(b.x + b.w)} col ${x0 + 0.5}..${x1 - 0.5}`);
        }
      }
    expect(bad.slice(0, 10)).toEqual([]);
    const L = layoutBanner({ ...f, trustType: "none", ctaText: "", headlineSize: 600, priceNow: "NT$999", priceWas: "" }, sizes.sq600, measure);
    expect(L.headlineSize).toBeLessThan(600);
  });
  it("F3: a subtitle that is one long URL is broken inside the column, automatic and by hand, at every size", () => {
    const url = "https://example.com/products/aromatherapy-art-workshop/registration?utm_source=banner&utm_campaign=weekend";
    const f: BannerFields = { ...base, subtext: url };
    const bad: string[] = [];
    for (const [key, size] of Object.entries(sizes))
      for (const typing of [{ typeAuto: true }, { typeAuto: false, headlineSize: 600, subtextSize: 300 }]) {
        const L = layoutBanner({ ...f, ...typing }, size, measure), [x0, x1] = colOf(L), sub = L.subtext!;
        const lw = (t: string) => measure.text(`400 ${REF_PX}px Noto Sans TC`, t) * sub.size / REF_PX;
        if (sub.lines.join("") !== url) bad.push(`${key}: characters lost`);
        for (const ln of sub.lines) if (lw(ln) > x1 - x0) bad.push(`${key} ${typing.typeAuto ? "auto" : "hand"}: ${Math.round(lw(ln))} > ${Math.round(x1 - x0)}`);
      }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});

// Card R3-A 二: the logo's height by the rule at every size -- automatic = min(short side x 10%, title px x 1.5), set by
// hand = short side x logoScale -- so it keeps the same proportion on every size (within the pixel rounding).
describe("R3-A 二: logo size rule", () => {
  const withLogo: BannerFields = { ...base, logoImage: "logo", typeAuto: true };
  it.each(Object.keys(SIZES))("%s: automatic = min(10% short side, 1.5 x title); by hand = logoScale x short side", (key) => {
    const size = SIZES[key], short = Math.min(size.w, size.h);
    const L = layoutBanner(withLogo, size, measure);
    expect(Math.abs(L.boxes.logo!.h - Math.min(short * LOGO_AUTO, L.headlineSize * LOGO_TITLE))).toBeLessThanOrEqual(1);
    const noTitle = layoutBanner({ ...withLogo, headline: "" }, size, measure);
    expect(Math.abs(noTitle.boxes.logo!.h - short * LOGO_AUTO)).toBeLessThanOrEqual(1);
    const hand = layoutBanner({ ...withLogo, logoAuto: false, logoScale: 0.08 }, size, measure);
    expect(Math.abs(hand.boxes.logo!.h - short * 0.08)).toBeLessThanOrEqual(1);
  });
});

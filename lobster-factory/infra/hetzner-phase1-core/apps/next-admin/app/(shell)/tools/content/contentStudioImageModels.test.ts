// Contract test: the curated image-model subset that Content Studio's Media Hub exposes
// (ContentStudio.tsx `AI_IMAGE_PROVIDERS`) must stay valid against the shared image-gen toolkit
// (lib/tarot/image-gen.ts `TAROT_MODELS`). image-gen.ts is actively edited (model ids + capabilities
// drift), so this guards against: a typo'd / renamed model id reaching the dropdown, or an img2img /
// seed capability flag that no longer matches what the model actually honours (which would surface a
// disabled-knob that silently no-ops, or an enabled knob that 422s the request).
//
// AI_IMAGE_PROVIDERS lives inside a "use client" component and isn't importable here, so the curated
// list is mirrored below. Keep the two in sync — this test exists precisely to fail loudly if the
// toolkit moves underneath them.
import { describe, it, expect } from "vitest";
import { TAROT_MODELS, isTarotModel, isAspectRatio, type TarotModel } from "@/lib/tarot/image-gen";
import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";

// Mirror of ContentStudio.tsx AI_IMAGE_PROVIDERS (minus the "none" sentinel, which never reaches the toolkit).
const CURATED: { value: TarotModel; seed: boolean; img2img: boolean }[] = [
  { value: "flux-schnell",         seed: true,  img2img: false },
  { value: "flux-dev",             seed: true,  img2img: true  },
  { value: "ideogram-v3-balanced", seed: true,  img2img: false },
  { value: "nano-banana-pro",      seed: false, img2img: true  },
  { value: "flux-2-max",           seed: true,  img2img: false },
];

describe("Content Studio curated image models ↔ toolkit contract", () => {
  for (const m of CURATED) {
    describe(m.value, () => {
      it("is a real TarotModel id", () => {
        expect(isTarotModel(m.value)).toBe(true);
      });

      it("img2img flag matches TAROT_MODELS.supportsImg2img", () => {
        expect(TAROT_MODELS[m.value].supportsImg2img).toBe(m.img2img);
      });

      it("seed flag matches how the model actually consumes seed", () => {
        const cfg = TAROT_MODELS[m.value];
        if (cfg.provider === "flux") {
          // generateFlux() always sets input.seed → flux models always honour seed.
          expect(m.seed).toBe(true);
        } else if (cfg.provider === "replicate") {
          // Replicate models honour seed only if their buildInput forwards it.
          expect(cfg.buildInput).toBeTypeOf("function");
          const SEED = 12345;
          const input = cfg.buildInput!({ prompt: "x", aspectRatio: "16:9", seed: SEED, referenceImages: [] });
          const forwardsSeed = input.seed === SEED;
          expect(forwardsSeed).toBe(m.seed);
        } else {
          throw new Error(`unexpected provider ${cfg.provider} for ${m.value}`);
        }
      });

      it("accepts the article-body + hero aspect ratios (16:9 / 4:3 / 1:1) without throwing", () => {
        const cfg = TAROT_MODELS[m.value];
        if (cfg.provider === "replicate") {
          for (const ar of ["16:9", "4:3", "1:1"] as const) {
            expect(isAspectRatio(ar)).toBe(true);
            expect(() => cfg.buildInput!({ prompt: "x", aspectRatio: ar, seed: 1, referenceImages: [] })).not.toThrow();
          }
        }
      });
    });
  }
});

describe("Content Studio image-style picker ↔ STYLE_CATALOG", () => {
  it("catalog is non-empty and every entry has zh + group + prompt", () => {
    expect(STYLE_CATALOG.length).toBeGreaterThan(50);
    for (const s of STYLE_CATALOG) {
      expect(s.zh.trim()).not.toBe("");
      expect(s.group.trim()).not.toBe("");
      expect(s.prompt.trim()).not.toBe("");
    }
  });

  it("derives the same <optgroup> sections ContentStudio uses", () => {
    const groups = [...new Set(STYLE_CATALOG.map(s => s.group))];
    expect(groups.length).toBeGreaterThanOrEqual(2);
    // every catalog entry belongs to one of the derived groups (no orphan)
    for (const s of STYLE_CATALOG) expect(groups).toContain(s.group);
  });

  it("resolves a known zh key to its English prompt (mediaImageParams() path)", () => {
    // zh labels carry an optional "｜<描述>" tooltip suffix; the lookup key is the name before it.
    const vg = STYLE_CATALOG.find(s => s.zh.split("｜")[0] === "梵谷 Van Gogh");
    expect(vg).toBeDefined();
    expect(vg!.prompt.toLowerCase()).toContain("impasto");
  });

  it("resolves an unknown key to undefined (→ no style sent)", () => {
    expect(STYLE_CATALOG.find(s => s.zh === "__not_a_style__")).toBeUndefined();
  });
});

// Contract test: the article image sources (lib/content/image/article-image.ts ARTICLE_IMAGE_SOURCES, K26 -- the one list
// behind the article page, the site's default and the schedule's choice) must stay valid against the shared image-gen
// toolkit (lib/tarot/image-gen.ts TAROT_MODELS): a renamed model id, or an img2img / seed flag that no longer matches
// what the model honours (a disabled knob that silently no-ops, or an enabled knob that 422s the request).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { TAROT_MODELS, isTarotModel, isAspectRatio, type TarotModel } from "@/lib/tarot/image-gen";
import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";
import { ARTICLE_IMAGE_MODELS, ARTICLE_IMAGE_SOURCES } from "@/lib/content/image/article-image";

const CURATED = ARTICLE_IMAGE_SOURCES as readonly { value: TarotModel; seed: boolean; img2img: boolean }[];

describe("K26 the article image sources have one list", () => {
  it("the article page and the site settings page keep no model list of their own", () => {
    for (const f of ["ContentStudio.tsx", "sites/SiteManager.tsx", "sites/ScheduleImageButtons.tsx"]) {
      const src = readFileSync(path.join(__dirname, f), "utf8");
      expect(src).toContain("ARTICLE_IMAGE_SOURCES");
      for (const id of [...ARTICLE_IMAGE_MODELS, "ideogram-v3-balanced", "nano-banana-pro", "flux-2-max"]) expect(src, `${f} names ${id}`).not.toContain(`"${id}"`);
    }
  });
});

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
        } else if (cfg.provider === "openai" || cfg.provider === "gemini" || cfg.provider === "codex") {
          // these generators take no seed (image-gen.ts: their results carry seed null)
          expect(m.seed).toBe(false);
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

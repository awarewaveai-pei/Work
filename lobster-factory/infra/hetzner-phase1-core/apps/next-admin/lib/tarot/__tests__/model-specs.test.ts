import { describe, expect, it } from "vitest";
import { MODEL_SPECS } from "../model-specs";
import { TAROT_MODELS } from "../image-gen";
import { TAROT_CARDS, buildCardPrompt } from "@/app/(shell)/tools/tarot/cards";

// A long style whose detail starts at a marker, so everything before the marker is "content".
const STYLE = "In the style of Van Gogh. STYLEDETAIL thick impasto oil, short rhythmic forceful directional brushstrokes, palette-knife buildup, tactile layered pigment, swirling skies.";
// FLUX schnell reads 256 T5 tokens and cuts the rest silently; T5 spends at least one token per word plus
// punctuation, so 160 words (~1.6 tokens per word) keeps the pose and scene inside what the model reads.
const CONTENT_WORDS = 160;

describe("model specs", () => {
  it("send the locked deck preview only to an identity-reference model", () => {
    for (const [m, s] of Object.entries(MODEL_SPECS)) expect(s.usesDeckPreview, m).toBe(s.referenceRole === "character");
  });

  it("keep every content-first model's pose and scene within the words schnell reads, for all 78 cards", () => {
    const over: string[] = [];
    for (const heroKind of [undefined, "animal-upright", "animal-natural"] as const)
      for (const c of TAROT_CARDS) {
        const p = buildCardPrompt(c, { styleResolved: STYLE, subject: "blue cute cat", heroKind, order: "content-first" });
        const content = p.slice(0, p.indexOf("STYLEDETAIL"));
        expect(content.startsWith("In the style of Van Gogh") || content.includes("in the style of Van Gogh"), c.name).toBe(true);
        const words = content.split(/\s+/).filter(Boolean).length;
        if (words > CONTENT_WORDS) over.push(`${c.name} ${heroKind ?? "person"} ${words}`);
      }
    expect(over).toEqual([]);
  });

  it("puts the scene before the style detail in content-first order and after it otherwise", () => {
    const fool = TAROT_CARDS[0];
    const first = buildCardPrompt(fool, { styleResolved: STYLE, order: "content-first" });
    const second = buildCardPrompt(fool, { styleResolved: STYLE });
    expect(first.indexOf("white rose")).toBeLessThan(first.indexOf("STYLEDETAIL"));
    expect(second.indexOf("white rose")).toBeGreaterThan(second.indexOf("STYLEDETAIL"));
  });

  it("never lets Nano Banana Pro fall back to another vendor's model", () => {
    const input = TAROT_MODELS["nano-banana-pro"].buildInput!({ prompt: "x", aspectRatio: "2:3", seed: 1, referenceImages: [] });
    expect(input.allow_fallback_model).toBe(false);
  });
});

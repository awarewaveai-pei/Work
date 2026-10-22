import { describe, expect, it } from "vitest";
import { MODEL_SPECS } from "../model-specs";
import { TAROT_MODELS } from "../image-gen";
import { TAROT_CARDS, buildCardPrompt } from "@/app/(shell)/tools/tarot/cards";
import { STYLE_CATALOG } from "@/app/(shell)/tools/tarot/tarotStyles";

// content-first opens with the anchor + the first technique sentence (the brief); the rest starts at the marker.
const BRIEF = "thick impasto oil, short rhythmic forceful directional brushstrokes, palette-knife buildup";
const STYLE = `In the style of Van Gogh. ${BRIEF}. STYLEDETAIL tactile layered pigment, swirling skies.`;
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
        expect(content.startsWith(`In the style of Van Gogh: ${BRIEF}`) || content.includes(`in the style of Van Gogh: ${BRIEF}`), c.name).toBe(true);
        expect(p.split(/in the style of Van Gogh/i).length - 1, c.name).toBe(1);
        const words = content.split(/\s+/).filter(Boolean).length;
        if (words > CONTENT_WORDS) over.push(`${c.name} ${heroKind ?? "person"} ${words}`);
      }
    expect(over).toEqual([]);
  });

  it("never splits a word when a long user style has no comma in its opening (Codex 2026-10-22)", () => {
    // Character 90 falls inside "granulating", a word no card scene uses.
    const style = "luminous translucent watercolor washes with soft blooming borders and many layered tones granulating pigment particles over damp paper surfaces";
    const p = buildCardPrompt(TAROT_CARDS[0], { styleResolved: style, order: "content-first" });
    // A mid-word cut leaves "acros" + "s": the whole word is then missing from the prompt.
    for (const w of style.split(" ")) expect(p, w).toMatch(new RegExp(`\\b${w}\\b`, "i"));
  });

  it("orders two picked presets by sentence kind, so a cut drops composition and mood first (Codex 2026-10-23)", () => {
    const [a, b] = [STYLE_CATALOG[0], STYLE_CATALOG[1]];
    const sa = a.prompt.replace(/[.\s]+$/, "").split(". ");
    const sb = b.prompt.replace(/[.\s]+$/, "").split(". ");
    const p = buildCardPrompt(TAROT_CARDS[0], { style: `${a.zh}, ${b.zh}`, order: "content-first" });
    // The 1200-char style cap may drop the end of the second preset; compare only the sentences that made it in.
    const present = (ts: string[]) => ts.filter((t) => p.includes(t));
    const palettes = present([sa[3], sb[3]]);
    const late = present([sa[1], sb[1], sa[4], sb[4]]);
    expect(palettes.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(0);
    // Every palette (index 3) comes before every composition (index 1) or mood (index 4).
    for (const pal of palettes) for (const l of late) expect(p.indexOf(pal), `${pal} | ${l}`).toBeLessThan(p.indexOf(l));
  });

  it("puts the scene before the style detail in content-first order and after it otherwise", () => {
    const fool = TAROT_CARDS[0];
    const first = buildCardPrompt(fool, { styleResolved: STYLE, order: "content-first" });
    const second = buildCardPrompt(fool, { styleResolved: STYLE });
    expect(first.indexOf("snowy mountains")).toBeLessThan(first.indexOf("STYLEDETAIL"));
    expect(second.indexOf("snowy mountains")).toBeGreaterThan(second.indexOf("STYLEDETAIL"));
  });

  it("never lets Nano Banana Pro fall back to another vendor's model", () => {
    const input = TAROT_MODELS["nano-banana-pro"].buildInput!({ prompt: "x", aspectRatio: "2:3", seed: 1, referenceImages: [] });
    expect(input.allow_fallback_model).toBe(false);
  });
});

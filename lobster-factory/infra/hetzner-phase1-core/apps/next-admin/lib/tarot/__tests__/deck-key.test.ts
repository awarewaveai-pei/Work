import { describe, expect, it } from "vitest";
import { DECK_KEY_RE, tarotDeckKey } from "../deck-key";

// Same deck → same key (the panel finds its batches); any change to what is generated → a different key.
describe("tarotDeckKey", () => {
  const base = { model: "flux-schnell", aspectRatio: "2:3", seed: 42, prompts: ["fool in mucha style", "magician in mucha style"] };
  it("is stable for the same deck and differs when the seed, model or any prompt differs", async () => {
    const k = await tarotDeckKey(base);
    expect(k).toMatch(DECK_KEY_RE);
    expect(await tarotDeckKey({ ...base, prompts: [...base.prompts] })).toBe(k);
    expect(await tarotDeckKey({ ...base, seed: 43 })).not.toBe(k);
    expect(await tarotDeckKey({ ...base, model: "flux-dev" })).not.toBe(k);
    expect(await tarotDeckKey({ ...base, prompts: ["fool in klimt style", base.prompts[1]] })).not.toBe(k);
  });
});

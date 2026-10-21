import { describe, expect, it, vi } from "vitest";
import { translateForDeck, needsEnglish } from "./translate";
import { TAROT_CARDS, buildCardPrompt } from "../../app/(shell)/tools/tarot/cards";

describe("translateForDeck", () => {
  it("a non-English subject is translated once and reused for every card in the deck", async () => {
    const translate = vi.fn(async () => "a fluffy orange cat");
    const en = await translateForDeck({ subject: "一隻橘色的貓", style: "watercolor, soft light" }, translate);
    const prompts = TAROT_CARDS.map((card) => buildCardPrompt(card, { styleResolved: en.style, subject: en.subject }));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(prompts).toHaveLength(78);
    expect(prompts.every((p) => !needsEnglish(p))).toBe(true);
    const heroCards = TAROT_CARDS.filter((c) => c.scene.includes("{hero}"));
    expect(heroCards.every((c) => prompts[TAROT_CARDS.indexOf(c)].includes("fluffy orange cat"))).toBe(true);
  });
});

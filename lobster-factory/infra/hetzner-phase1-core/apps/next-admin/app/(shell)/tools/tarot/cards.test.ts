import { describe, expect, it } from "vitest";
import { GROUNDING, TAROT_CARDS, buildCardPrompt } from "./cards";

describe("buildCardPrompt grounding", () => {
  it("adds the grounding sentence to a non-airborne card and not to an airborne one", () => {
    const fool = TAROT_CARDS.find((c) => c.name === "THE FOOL")!;
    const judgement = TAROT_CARDS.find((c) => c.name === "JUDGEMENT")!;
    expect(fool.airborne).toBeUndefined();
    expect(judgement.airborne).toBe(true);
    expect(buildCardPrompt(fool, { subject: "a cat" })).toContain(GROUNDING);
    expect(buildCardPrompt(judgement, { subject: "a cat" })).not.toContain(GROUNDING);
  });
});

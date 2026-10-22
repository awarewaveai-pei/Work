import { describe, expect, it } from "vitest";
import { GROUNDING, TAROT_CARDS, UPRIGHT_SENTENCE, UPRIGHT_SENTENCE_GROUP, buildCardPrompt } from "./cards";

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

describe("buildCardPrompt pose", () => {
  const fool = TAROT_CARDS.find((c) => c.name === "THE FOOL")!;
  const lovers = TAROT_CARDS.find((c) => c.name === "THE LOVERS")!;
  const upright = UPRIGHT_SENTENCE.split("{hero}").join("blue cat");

  it("gives every {hero} card a pose written with {hero}", () => {
    const heroCards = TAROT_CARDS.filter((c) => c.scene.includes("{hero}"));
    expect(heroCards.length).toBe(70);
    for (const c of heroCards) expect(c.pose, c.name).toContain("{hero}");
  });

  it("adds the upright sentence only with a subject, the animal flag, and an upright card", () => {
    expect(fool.upright).toBe(true);
    expect(lovers.upright).toBeUndefined();
    expect(buildCardPrompt(fool, { subject: "a blue cat", nonHumanSubject: true })).toContain(upright);
    expect(buildCardPrompt(fool, { subject: "a blue cat" })).not.toContain(upright);
    expect(buildCardPrompt(fool, { nonHumanSubject: true })).not.toContain("front paws");
    expect(buildCardPrompt(lovers, { subject: "a blue cat", nonHumanSubject: true })).not.toContain(upright);
    const fourWands = TAROT_CARDS.find((c) => c.name === "FOUR OF WANDS")!;
    expect(buildCardPrompt(fourWands, { subject: "a blue cat", nonHumanSubject: true }))
      .toContain(UPRIGHT_SENTENCE_GROUP.split("{hero}").join("blue cat"));
  });

  it("starts with the hero + pose sentence and still carries the full style lead", () => {
    const style = "In the style of Van Gogh. Thick impasto oil, swirling skies, ultramarine and burning yellow";
    const p = buildCardPrompt(fool, { styleResolved: style, subject: "a blue cat" });
    expect(p.startsWith("A blue cat striding across the flat cliff top")).toBe(true);
    expect(p).toContain(style);
    expect(p.indexOf(style)).toBeGreaterThan(p.indexOf("striding"));
  });
});

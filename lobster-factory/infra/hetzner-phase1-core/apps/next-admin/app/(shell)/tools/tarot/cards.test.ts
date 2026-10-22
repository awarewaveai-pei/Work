import { describe, expect, it } from "vitest";
import { GROUNDING, NATURAL_SENTENCE, PROP_PLACEMENT, TAROT_CARDS, UPRIGHT_SENTENCE, UPRIGHT_SENTENCE_GROUP, buildCardPrompt } from "./cards";

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

  it("adds the upright sentence only with a subject, the animal-upright kind, and an upright card", () => {
    expect(fool.upright).toBe(true);
    expect(lovers.upright).toBeUndefined();
    expect(buildCardPrompt(fool, { subject: "a blue cat", heroKind: "animal-upright" })).toContain(upright);
    expect(buildCardPrompt(fool, { subject: "a blue cat" })).not.toContain(upright);
    expect(buildCardPrompt(fool, { heroKind: "animal-upright" })).not.toContain("front paws");
    expect(buildCardPrompt(lovers, { subject: "a blue cat", heroKind: "animal-upright" })).not.toContain(upright);
    const fourWands = TAROT_CARDS.find((c) => c.name === "FOUR OF WANDS")!;
    expect(buildCardPrompt(fourWands, { subject: "a blue cat", heroKind: "animal-upright" }))
      .toContain(UPRIGHT_SENTENCE_GROUP.split("{hero}").join("blue cat"));
  });

  it("hero kind picks the hands-card sentence: upright paws, natural placement, or neither for a person", () => {
    const magician = TAROT_CARDS.find((c) => c.name === "THE MAGICIAN")!;
    const natural = NATURAL_SENTENCE.split("{hero}").join("blue cat");
    const p = (heroKind?: "person" | "animal-upright" | "animal-natural") =>
      buildCardPrompt(magician, { subject: "a blue cat", heroKind });
    expect(p("animal-upright")).toContain(upright);
    expect(p("animal-natural").startsWith(`${natural}${PROP_PLACEMENT.wands}, `)).toBe(true);
    expect(p("animal-natural")).not.toContain("right hand raising a wand");
    expect(p("animal-natural")).not.toContain("upright like a person");
    expect(p("animal-natural")).not.toContain("front paws as hands");
    for (const person of [p("person"), p(undefined)]) {
      expect(person).not.toContain("upright like a person");
      expect(person).not.toContain("all four legs");
    }
  });

  it("starts with the hero + pose sentence and still carries the full style lead", () => {
    const style = "In the style of Van Gogh. Thick impasto oil, swirling skies, ultramarine and burning yellow";
    const p = buildCardPrompt(fool, { styleResolved: style, subject: "a blue cat" });
    expect(p.startsWith("A blue cat striding across the flat cliff top")).toBe(true);
    expect(p).toContain(style);
    expect(p.indexOf(style)).toBeGreaterThan(p.indexOf("striding"));
  });
});

describe("THE LOVERS couple", () => {
  const lovers = TAROT_CARDS.find((c) => c.name === "THE LOVERS")!;
  const count = (s: string, w: string) => s.split(w).length - 1;

  it("draws a man and a woman by default, the woman looking up at the angel", () => {
    const p = buildCardPrompt(lovers);
    expect(p).toContain("a nude man on the left and a nude woman on the right");
    // "a second nude woman" reads as two women; "second" stays only for a same-kind pair.
    expect(p).not.toContain("second");
    expect(p).not.toContain("nude figure");
    // "standing" stood a cat couple up on its hind legs; "a tree bearing twelve flames" drew flames floating in the sky.
    expect(p).not.toContain("standing");
    expect(p).toContain("branch tips each burn with a small candle flame");
  });

  it("follows the 男男 / 女女 choice, and genders a user subject", () => {
    const mm = buildCardPrompt(lovers, { couple: "man-man" });
    expect(count(mm, "nude man")).toBeGreaterThanOrEqual(2);
    expect(mm).not.toContain("woman");
    const ff = buildCardPrompt(lovers, { couple: "woman-woman", subject: "a blue cat" });
    expect(ff).toContain("a female blue cat on the left and a second female blue cat on the right");
    expect(buildCardPrompt(lovers, { subject: "a blue cat" })).toContain("a male blue cat on the left and a female blue cat on the right");
    expect(ff).not.toMatch(/\bmale blue cat/);
  });

  it("leaves every other card unchanged", () => {
    const fool = TAROT_CARDS.find((c) => c.name === "THE FOOL")!;
    expect(buildCardPrompt(fool, { couple: "woman-woman" })).toBe(buildCardPrompt(fool));
  });
});

describe("minor arcana meanings", () => {
  it("gives every minor card its own standard meaning, not the generic suit text", () => {
    const minors = TAROT_CARDS.filter((c) => c.type !== "major");
    expect(minors).toHaveLength(56);
    for (const c of minors) expect(c.theme, c.name).not.toMatch(/energy$/);
    expect(new Set(minors.map((c) => c.theme)).size).toBe(56);
  });
});

describe("hero word not doubled", () => {
  it("never writes the same word twice in a row in any default prompt (e.g. 'blindfolded blindfolded woman')", () => {
    for (const c of TAROT_CARDS) expect(buildCardPrompt(c), c.name).not.toMatch(/\b(\w{4,}) \1\b/i);
  });
});

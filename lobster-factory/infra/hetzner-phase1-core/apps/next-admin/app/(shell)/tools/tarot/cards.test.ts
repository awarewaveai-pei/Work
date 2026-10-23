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
    expect(heroCards.length).toBe(76);
    for (const c of heroCards) expect(c.pose, c.name).toContain("{hero}");
  });

  // 2026-10-23: a blue cat on THE MOON still drew a dog and a wolf, and the Aces / the Wheel showed no cat at all.
  it("puts a swapped subject on every card that has a figure", () => {
    const figureless = ["EIGHT OF WANDS", "THREE OF SWORDS"];
    for (const c of TAROT_CARDS) {
      const p = buildCardPrompt(c, { subject: "a blue cat" });
      if (figureless.includes(c.name)) expect(p, c.name).not.toContain("blue cat");
      else expect(p, c.name).toContain("blue cat");
    }
  });

  // A garment written next to {hero} stays on a swapped subject: "a blue cat in a red cloak" (Codex, 2026-10-23).
  it("keeps the protagonist's garments in the default hero only", () => {
    const GARMENT = /\b(cloak|robes?|dress|tunic|gown|armou?r|vestments?|cap|hat)\b/i;
    for (const c of TAROT_CARDS) {
      for (const t of [c.pose, c.scene, c.natural]) {
        for (const clause of (t ?? "").split(/[,;]/)) {
          if (clause.includes("{hero}")) expect(clause, c.name).not.toMatch(GARMENT);
        }
      }
    }
  });

  // With the count only in the scene, schnell drew 5 of the Ten of Swords' blades (2026-10-23).
  it("states a number card's count in the first sentence, in every mode and order", () => {
    const pips = TAROT_CARDS.filter((c) => /^(TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN) OF /.test(c.name));
    expect(pips).toHaveLength(36);
    for (const c of pips) {
      const word = c.name.split(" ")[0].toLowerCase();
      for (const input of [{}, { subject: "a blue cat", heroKind: "animal-natural" as const }, { order: "content-first" as const }]) {
        expect(buildCardPrompt(c, input).split(". ")[0], c.name).toMatch(new RegExp(`exactly ${word} (wooden wands|golden cups|swords|round golden coins engraved with pentagrams)`, "i"));
      }
    }
    expect(buildCardPrompt(TAROT_CARDS.find((c) => c.name === "KING OF CUPS")!)).not.toContain("exactly");
  });

  it("keeps THE DEVIL's horns, wings and captives with a swapped subject", () => {
    const devil = buildCardPrompt(TAROT_CARDS.find((c) => c.name === "THE DEVIL")!, { subject: "a blue cat", order: "content-first" });
    expect(devil.split(". ")[0]).toMatch(/blue cat with bat wings and curved goat horns .* captives chained/);
  });

  it("THE MOON keeps a dog and a wolf by default and turns both into the subject, tame and wild", () => {
    const moon = TAROT_CARDS.find((c) => c.name === "THE MOON")!;
    expect(buildCardPrompt(moon)).toContain("A dog and a wolf howling");
    const cat = buildCardPrompt(moon, { subject: "a blue cat" });
    expect(cat).toContain("A tame blue cat and a wild blue cat howling");
    expect(cat).not.toMatch(/\b(dog|wolf)\b/);
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

  it("hero kind picks the hands-card sentence: upright paws, the card's natural action, or neither for a person", () => {
    const magician = TAROT_CARDS.find((c) => c.name === "THE MAGICIAN")!;
    const p = (heroKind?: "person" | "animal-upright" | "animal-natural") =>
      buildCardPrompt(magician, { subject: "a blue cat", heroKind });
    expect(p("animal-upright")).toContain(upright);
    // The meaning-carrying gesture survives on four legs: a paw to the sky, the tail to the ground.
    expect(p("animal-natural").startsWith("A blue cat, an ordinary real four-legged animal, sitting upright on its haunches behind the altar, one front paw lifted high toward the sky")).toBe(true);
    expect(p("animal-natural")).not.toContain("right hand raising a wand");
    expect(p("animal-natural")).not.toContain("upright like a person");
    expect(p("animal-natural")).not.toContain("front paws as hands");
    for (const person of [p("person"), p(undefined)]) {
      expect(person).not.toContain("upright like a person");
      expect(person).not.toContain("all four legs");
    }
  });

  // 「動物・自然」 2026-10-22: the scene said "holding a white rose in the left hand" after "on all four legs", and FLUX
  // drew the cat standing with the rose in its paw. A held prop or hand gesture lives only in pose / natural.
  const HANDS = /\b(hands?|holding|holds|gripping|grasping|clutching|arms?|fingers?|palms?)\b/i;
  it("gives every upright card a four-legged natural action and keeps hands out of its scene and natural", () => {
    const upr = TAROT_CARDS.filter((c) => c.upright);
    expect(upr.length).toBe(62);
    for (const c of upr) {
      expect(c.natural, c.name).toContain("{hero}");
      expect(c.natural, c.name).not.toMatch(HANDS);
      expect(c.scene, c.name).not.toMatch(HANDS);
    }
  });

  it("a natural prompt never says hand or holding anywhere, and a person prompt keeps the held props", () => {
    for (const c of TAROT_CARDS.filter((x) => x.upright)) {
      const natural = buildCardPrompt(c, { subject: "a blue cat", heroKind: "animal-natural" });
      expect(natural.split(". ")[0], c.name).not.toMatch(HANDS);
      expect(natural.slice(natural.indexOf(". ") + 2), c.name).not.toMatch(HANDS);
    }
    const fool = TAROT_CARDS.find((c) => c.name === "THE FOOL")!;
    expect(buildCardPrompt(fool)).toContain("a white rose in the left hand and a knapsack tied to a slender staff");
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
    // RWS: the woman stands on the left before the serpent tree, the man on the right before the tree of flames.
    expect(p).toContain("a nude woman on the left and a nude man on the right");
    expect(p).toContain("behind the left figure a fruit tree entwined with a serpent, behind the right figure a bare dark tree");
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
    expect(buildCardPrompt(lovers, { subject: "a blue cat" })).toContain("a female blue cat on the left and a male blue cat on the right");
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

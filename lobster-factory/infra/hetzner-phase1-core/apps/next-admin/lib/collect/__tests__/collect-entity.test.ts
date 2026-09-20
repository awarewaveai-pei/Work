// The relevance axis, tested against the shapes that produced the failure it exists to stop.
//
// The reference case throughout is run manual-2026-09-20051728: a search for "Theo Farrell" stored
// 159 pages of penguin.com.au's browse catalogue. Every one of those pages passes quality.ts. The
// test that matters is that they do not pass this.

import { describe, expect, it } from "vitest";
import {
  assessEntity,
  entityRefOf,
  findTokenWindows,
  normalizeForMatch,
  parseTermList,
  requiredTokenCount,
  significantTokens,
  type EntityRef,
} from "@/lib/collect/entity";
import { assessRelevance, relevanceMetadata } from "@/lib/collect/relevance";

function ref(over: Partial<EntityRef> = {}): EntityRef {
  return { name: "Theo Farrell", kind: "person", anchors: [], aliases: [], strictAnchors: true, ...over };
}

describe("normalizeForMatch", () => {
  it("folds case, width and punctuation but keeps token separation", () => {
    expect(normalizeForMatch("Farrell, Theo G.")).toBe("farrell theo g");
    expect(normalizeForMatch("ＡwareＷave")).toBe("awarewave");
    expect(normalizeForMatch("O’Brien—Smith")).toBe("o brien smith");
  });

  it("keeps CJK intact", () => {
    expect(normalizeForMatch("王大明（教授）")).toBe("王大明 教授");
  });
});

describe("significantTokens", () => {
  it("drops honorifics and particles that a match must not hinge on", () => {
    expect(significantTokens("Prof. Theo Farrell", "person")).toEqual(["theo", "farrell"]);
  });

  it("keeps a CJK name whole — splitting it would match any page containing either character", () => {
    expect(significantTokens("王大明", "person")).toEqual(["王大明"]);
  });

  it("strips company legal forms so 'AwareWave Ltd' and 'AwareWave' are one company", () => {
    expect(significantTokens("AwareWave Ltd.", "company")).toEqual(["awarewave"]);
    expect(significantTokens("覺浪股份有限公司", "company")).toEqual(["覺浪股份有限公司"]);
  });

  it("never returns an empty token list — that would match every page ever written", () => {
    expect(significantTokens("Limited", "company")).toEqual(["limited"]);
    expect(significantTokens("Prof.", "person")).toEqual(["prof"]);
  });
});

describe("requiredTokenCount", () => {
  it("demands the whole name for a person or a company", () => {
    expect(requiredTokenCount(["theo", "farrell"], "person")).toBe(2);
    expect(requiredTokenCount(["a", "b", "c"], "company")).toBe(3);
  });

  it("allows an event to be phrased differently, but never on one token alone", () => {
    expect(requiredTokenCount(["2019", "christchurch", "mosque", "attack"], "event")).toBe(3);
    expect(requiredTokenCount(["christchurch", "attack"], "event")).toBe(2);
  });

  it("never demands more tokens than exist — a one-word phrase must stay matchable", () => {
    // Anchors are judged as phrases, and anchors are usually one word. Unclamped, the floor of 2
    // made every single-word anchor impossible to hit, so strict mode rejected correct pages.
    expect(requiredTokenCount(["wollongong"], "event")).toBe(1);
  });
});

describe("findTokenWindows", () => {
  it("matches tokens out of order and with a middle name between them", () => {
    const text = normalizeForMatch("Professor Theo Gerard Farrell was appointed.");
    expect(findTokenWindows(text, ["theo", "farrell"], 2).count).toBe(1);
  });

  it("matches the reversed, comma-separated form without enumerating it", () => {
    const text = normalizeForMatch("Farrell, Theo G. (2013)");
    expect(findTokenWindows(text, ["theo", "farrell"], 2).count).toBe(1);
  });

  it("does NOT match two unrelated people far apart in the same document", () => {
    const text = normalizeForMatch(`Theo Smith wrote the foreword. ${"filler words ".repeat(40)} Bob Farrell edited it.`);
    expect(findTokenWindows(text, ["theo", "farrell"], 2).count).toBe(0);
  });

  it("respects word boundaries for latin tokens", () => {
    const text = normalizeForMatch("Theodore Farrelly is somebody else entirely");
    expect(findTokenWindows(text, ["theo", "farrell"], 2).count).toBe(0);
  });

  it("counts one mention once, not once per overlapping window", () => {
    const text = normalizeForMatch("Theo Farrell, Theo Farrell");
    expect(findTokenWindows(text, ["theo", "farrell"], 2).count).toBe(1);
  });

  it("counts genuinely separate mentions separately", () => {
    const text = normalizeForMatch(`Theo Farrell spoke. ${"unrelated prose ".repeat(30)} Theo Farrell replied.`);
    expect(findTokenWindows(text, ["theo", "farrell"], 2).count).toBe(2);
  });
});

describe("assessEntity", () => {
  it("finds the name in the title when the body never repeats it", () => {
    const m = assessEntity("About | Biography | Publications", "Theo Farrell | About", ref());
    expect(m.nameHit).toBe(true);
  });

  it("refuses the bookshop catalogue page that started all this", () => {
    const m = assessEntity(
      "Browse romance fiction. New releases, bestsellers, award winners, book clubs, gift guides.",
      "Romance | Penguin Books Australia",
      ref(),
    );
    expect(m.nameHit).toBe(false);
    expect(m.snippet).toBeNull();
  });

  it("matches a single-word anchor — the common case, and the one that used to be impossible", () => {
    const m = assessEntity("Theo Farrell taught at Wollongong before moving.", null, ref({ anchors: ["Wollongong"] }));
    expect(m.anchorsHit).toEqual(["Wollongong"]);
  });

  it("matches a single CJK anchor", () => {
    const m = assessEntity("Theo Farrell 現任校長。", null, ref({ anchors: ["校長"] }));
    expect(m.anchorsHit).toEqual(["校長"]);
  });

  it("reports which anchors appeared", () => {
    const m = assessEntity(
      "Theo Farrell is Vice-Chancellor of La Trobe University.",
      null,
      ref({ anchors: ["La Trobe", "Wollongong"] }),
    );
    expect(m.anchorsHit).toEqual(["La Trobe"]);
    expect(m.anchorsAsked).toBe(2);
  });

  it("matches an alias, so a maiden name or Chinese name is not a second source", () => {
    const m = assessEntity("A lecture by Theo G. Farrell.", null, ref({ name: "費瑟羅", aliases: ["Theo Farrell"] }));
    expect(m.nameHit).toBe(true);
  });

  it("returns a snippet a human can read to see the matcher was right", () => {
    const m = assessEntity("In 2019 Theo Farrell published Unwinnable.", null, ref());
    expect(m.snippet).toContain("theo farrell");
  });
});

describe("assessRelevance", () => {
  const doc = (text: string, title: string | null = null) => ({ text, title });

  it("is inert for every target that makes no entity claim", () => {
    const v = assessRelevance(doc("anything at all"), { searchQuery: "x" });
    expect(v.applicable).toBe(false);
    expect(v.ok).toBe(true);
    expect(relevanceMetadata(v)).toBeNull();
  });

  it("refuses a page that never names the entity", () => {
    const v = assessRelevance(doc("Browse crime and thrillers."), { entity: ref() });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("entity_absent");
  });

  it("refuses the same-name stranger when anchors were supplied", () => {
    const v = assessRelevance(doc("Theo Farrell posts surf photography from Cornwall."), {
      entity: ref({ anchors: ["La Trobe"] }),
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("entity_anchor_missing");
  });

  it("admits the stranger as 'weak' when the operator turned strict off", () => {
    const v = assessRelevance(doc("Theo Farrell posts surf photography."), {
      entity: ref({ anchors: ["La Trobe"], strictAnchors: false }),
    });
    expect(v.ok).toBe(true);
    expect(v.confidence).toBe("weak");
  });

  it("labels an anchored hit as anchored and carries the evidence onto the document", () => {
    const v = assessRelevance(doc("Theo Farrell, Vice-Chancellor of La Trobe University, said."), {
      entity: ref({ anchors: ["La Trobe"] }),
    });
    expect(v.confidence).toBe("anchored");
    expect(relevanceMetadata(v)).toMatchObject({
      entityName: "Theo Farrell",
      entityKind: "person",
      entityConfidence: "anchored",
      entityAnchorsHit: ["La Trobe"],
    });
  });

  it("labels a hit as name_only when no anchors were configured to check", () => {
    const v = assessRelevance(doc("Theo Farrell wrote Unwinnable."), { entity: ref() });
    expect(v.confidence).toBe("name_only");
  });
});

describe("entityRefOf", () => {
  it("rejects a half-written ref rather than matching nothing silently after a resume", () => {
    expect(entityRefOf({ entity: { name: "x" } })).toBeNull();
    expect(entityRefOf({ entity: { kind: "person" } })).toBeNull();
    expect(entityRefOf({ entity: { name: "  ", kind: "person" } })).toBeNull();
    expect(entityRefOf(undefined)).toBeNull();
  });

  it("defaults strictAnchors ON — the safe end of the ambiguity", () => {
    expect(entityRefOf({ entity: { name: "x", kind: "person" } })?.strictAnchors).toBe(true);
    expect(entityRefOf({ entity: { name: "x", kind: "person", strictAnchors: false } })?.strictAnchors).toBe(false);
  });

  it("drops non-string anchors instead of trusting whatever JSON arrived", () => {
    expect(entityRefOf({ entity: { name: "x", kind: "company", anchors: ["a", 3, null] } })?.anchors).toEqual(["a"]);
  });
});

describe("parseTermList", () => {
  it("accepts the separators an operator actually types, and de-duplicates", () => {
    expect(parseTermList("La Trobe, 校長；戰爭研究\nUOW, La Trobe")).toEqual(["La Trobe", "校長", "戰爭研究", "UOW"]);
  });

  it("is empty for empty input", () => {
    expect(parseTermList("   ")).toEqual([]);
    expect(parseTermList(undefined)).toEqual([]);
  });
});

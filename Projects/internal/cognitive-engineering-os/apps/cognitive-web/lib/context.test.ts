import { describe, expect, it } from "vitest";

import { facetState, openPointers, placesOf, removeFacet, setFacet, toggled } from "./context";

describe("facets of the lens", () => {
  it("a facet is undecided until it is ticked or marked 無關", () => {
    expect(facetState({}, "文化")).toBe("undecided");
    const ticked = setFacet({}, "文化", { relevant: true });
    expect(facetState(ticked, "文化")).toBe("relevant");
    expect(facetState(setFacet(ticked, "文化", { relevant: false }), "文化")).toBe("irrelevant");
  });
  it("an answer is written onto the facet it belongs to and nothing else changes", () => {
    const notes = setFacet(setFacet({}, "文化", { relevant: true }), "經濟", { relevant: false });
    const answered = setFacet(notes, "文化", { defines_normal: "重人情" });
    expect(answered.facets).toEqual([{ facet: "文化", relevant: true, defines_normal: "重人情" }, { facet: "經濟", relevant: false }]);
  });
  it("a facet you added can be removed again", () => {
    expect(removeFacet({ facets: [{ facet: "我的面向", relevant: true, custom: true }, { facet: "文化", relevant: true }] }, "我的面向").facets).toEqual([{ facet: "文化", relevant: true }]);
  });
});

describe("pointing", () => {
  it("never points again at a facet the person already ticked or marked 無關", () => {
    const notes = setFacet(setFacet({}, "文化", { relevant: true }), "宗教", { relevant: false });
    const pointers = [{ facet: "文化", why: "a" }, { facet: "宗教", why: "b" }, { facet: "經濟", why: "c" }];
    expect(openPointers(pointers, notes).map((pointer) => pointer.facet)).toEqual(["經濟"]);
    expect(openPointers(undefined, notes)).toEqual([]);
  });
});

describe("places", () => {
  it("are the ones the intake wrote, each once, and none is assumed", () => {
    expect(placesOf({ happened_in: ["高雄", "東京"], you_are_in: "高雄", others_in: ["東京", " "] })).toEqual(["高雄", "東京"]);
    expect(placesOf({})).toEqual([]);
    expect(toggled(["高雄"], "東京")).toEqual(["高雄", "東京"]);
    expect(toggled(["高雄", "東京"], "高雄")).toEqual(["東京"]);
  });
});

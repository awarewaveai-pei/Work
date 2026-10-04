import { describe, expect, it } from "vitest";
import { NONE } from "./evidence";

import {
  compareRows, confirmClaim, detailsMissing, editedBy, interestGroups, layerFlags, pendingKeys, placeCard, sourceLine, takeAlternative, thinFacts, unconfirmedLaw, unplacedCards, usablePlacements,
  type Item, type MapContent, type MapSpec,
} from "./map";

const LAYERS = ["facts", "interpretations", "interests", "structure", "core", "intervention"];
const SPEC: MapSpec = {
  layers: LAYERS.map((key) => ({ key, name: key, question: "q", output: "o" })),
  claim_kinds: [
    { kind: "事實", needs: "", details: [{ key: "evidence", label: "證據" }] },
    { kind: "法律", needs: "", details: [{ key: "jurisdiction", label: "適用法域" }, { key: "limitation", label: "時效" }, { key: "source", label: "來源" }] },
    { kind: "價值", needs: "", details: [] },
    { kind: "文化宗教", needs: "", details: [{ key: "own_understanding", label: "你自己怎麼理解" }] },
  ],
  unwinnable: { questions: [], answers: [], reasons: [], reasons_reading: "", source: "" },
};
const item = (id: string, extra: Partial<Item> = {}): Item => ({ id, text: `text ${id}`, by: "user", ...extra });
const card = (doc_id: string, category: string) => ({ doc_id, content: { category, text: `card ${doc_id}` } });

describe("a card put into a layer", () => {
  it("is a copy of the words, tied to the card; in the facts layer it is the person's own say with no source yet", () => {
    const content = placeCard({}, "facts", card("c1", "事件"));
    expect(content.layers?.facts).toEqual([expect.objectContaining({ text: "card c1", by: "user", card: "c1", sources: 0, self_said: true })]);
    expect(placeCard(content, "interests", card("c2", "恐懼")).layers?.interests?.[0]).not.toHaveProperty("self_said");
  });
  it("leaves the cards not in any layer", () => {
    const content = placeCard({}, "facts", card("c1", "事件"));
    expect(unplacedCards([card("c1", "事件"), card("c2", "感受")], content).map((doc) => doc.doc_id)).toEqual(["c2"]);
  });
});

describe("what the AI suggested that is offered", () => {
  const cards = [card("c1", "事件"), card("c2", "恐懼"), card("c3", "事件")];
  const content = placeCard({}, "facts", cards[2]);
  it("never offers a feeling as a fact, however the model labelled it", () => {
    const offered = usablePlacements([{ card: "c1", layer: "facts" }, { card: "c2", layer: "facts" }, { card: "c2", layer: "interests" }], cards, content, LAYERS);
    expect(offered).toEqual([{ card: "c1", layer: "facts" }, { card: "c2", layer: "interests" }]);
  });
  it("drops a card already placed, a card that is not the person's, and a layer that does not exist", () => {
    expect(usablePlacements([{ card: "c3", layer: "interests" }, { card: "zz", layer: "interests" }, { card: "c1", layer: "nowhere" }], cards, content, LAYERS)).toEqual([]);
  });
});

describe("layers with little in them", () => {
  it("names the empty layers and the thinnest of those that have something; a skipped layer is neither", () => {
    const content: MapContent = { layers: { facts: [item("a"), item("b"), item("c")], interpretations: [item("d")], interests: [item("e"), item("f")] }, skipped: ["intervention"] };
    expect(layerFlags(content, LAYERS)).toEqual({ empty: ["structure", "core"], thinnest: ["interpretations"] });
  });
  it("names no thinnest layer when they are all level or only one has anything", () => {
    expect(layerFlags({ layers: { facts: [item("a")], interpretations: [item("b")] } }, LAYERS).thinnest).toEqual([]);
    expect(layerFlags({ layers: { facts: [item("a"), item("b")] } }, LAYERS).thinnest).toEqual([]);
    expect(layerFlags({}, LAYERS)).toEqual({ empty: LAYERS, thinnest: [] });
  });
});

describe("sources of a fact", () => {
  const own = item("a", { self_said: true, sources: 0 });
  const one = item("b", { self_said: false, sources: 1 });
  const none = item("c", { self_said: false, sources: 0 });
  const two = item("d", { self_said: false, sources: 2 });
  it("says what the person's own line is and how many sources an outside one has", () => {
    expect(sourceLine(own)).toEqual({ text: "我自己說的，還沒有外部出處", warn: true });
    expect(sourceLine(one)).toEqual({ text: "只有 1 個出處", warn: true });
    expect(sourceLine(none)).toEqual({ text: "查不到出處", warn: true });
    expect(sourceLine(two)).toEqual({ text: "2 個獨立出處", warn: false });
  });
  it("is thin only when it came from outside with under two sources; the person's own say never stops the AI", () => {
    expect(thinFacts({ layers: { facts: [own, one, none, two] } }, NONE).map((found) => found.id)).toEqual(["b", "c"]);
  });
  it("counts a linked fact from the server's origins, never the number the map stored", () => {
    const origin = (id: string, card: string, counts: boolean) => ({ origin_id: id, how: "單獨", pending: false, aside: false, counts, mark: null,
      cards: [{ card, version: 1, source_id: card, url: "https://x.example", title: card, aside: "", found_by: { by: "系統找的" }, cells: {}, mine: {} }] });
    const evidence = { ...NONE, origins: [origin("o:1", "k1", true), origin("o:2", "k2", false)] };
    const linked = item("e", { self_said: false, sources: 2, cards: ["k1", "k2"] });
    expect(thinFacts({ layers: { facts: [linked] } }, evidence).map((found) => [found.id, found.sources])).toEqual([["e", 1]]);
  });
});

describe("who wrote a line", () => {
  it("an AI line the person changed is theirs together; their own stays theirs", () => {
    expect(editedBy("ai")).toBe("joint");
    expect(editedBy("user")).toBe("user");
    expect(editedBy("joint")).toBe("joint");
  });
  it("another reading taken in lands in the 解釋 layer as the AI's", () => {
    const content = takeAlternative({}, { view: "他在趕時間", check: "問他" });
    expect(content.layers?.interpretations).toEqual([expect.objectContaining({ text: "他在趕時間（要確認：問他）", by: "ai" })]);
    expect(content.layers?.facts).toBeUndefined();
  });
});

describe("interests by the people affected", () => {
  it("lists each group named at 開案, then groups written since, then lines with no group", () => {
    const groups = interestGroups([item("a", { group: "員工" }), item("b", { group: "客戶" }), item("c")], ["員工", "家人"]);
    expect(groups.map((entry) => [entry.group, entry.items.map((found) => found.id)])).toEqual([["員工", ["a"]], ["家人", []], ["客戶", ["b"]], ["", ["c"]]]);
  });
});

describe("claims", () => {
  const base: MapContent = { layers: { facts: [item("f1")] } };
  it("a line becomes a claim once, with its own words, and a law claim without 法域、時效、來源 is 未確認", () => {
    const once = confirmClaim(base, "f1", "法律", "ai");
    expect(confirmClaim(once, "f1", "法律", "ai").claims).toHaveLength(1);
    expect(confirmClaim(base, "nope", "法律", "ai")).toBe(base);
    const claim = once.claims![0];
    expect(claim).toEqual(expect.objectContaining({ text: "text f1", kind: "法律", by: "ai", item: "f1" }));
    expect(detailsMissing(claim, SPEC)).toEqual(["適用法域", "時效", "來源"]);
    expect(unconfirmedLaw(claim, SPEC)).toBe(true);
    expect(unconfirmedLaw({ ...claim, details: { jurisdiction: "某國", limitation: "三年", source: "某法第 1 條" } }, SPEC)).toBe(false);
    expect(unconfirmedLaw({ ...claim, kind: "價值" }, SPEC)).toBe(false);
  });
});

describe("answers to an AI offer", () => {
  it("a line is pending until it is answered, here or in what was kept; another version of the offer starts over", () => {
    const offer = { doc_id: "d1", version: 1 };
    const kept = [{ suggestion: "d1", version: 1, key: "a" }];
    const here = [{ suggestion: offer, key: "b", decision: "不採用" as const }];
    expect(pendingKeys(["a", "b", "c"], offer, kept, here)).toEqual(["c"]);
    expect(pendingKeys(["a", "b", "c"], { doc_id: "d1", version: 2 }, kept, here)).toEqual(["a", "b", "c"]);
    expect(pendingKeys(["a"], null, [], [])).toEqual([]);
  });
});

describe("two versions side by side", () => {
  it("one row per layer with its line and items, then the core conflict, the claims, the gaps", () => {
    const a: MapContent = { method: "冰山模型", method_version: "1.0.0", one_lines: { facts: "他三次改條件" }, layers: { facts: [item("a")] }, core_conflict: "信任", gaps: ["合約"] };
    const b: MapContent = { method: "利害關係人圖", layers: { interests: [item("b")] }, claims: [{ id: "c", text: "同業都這樣改", kind: "事實", by: "user" }], unwinnable: true };
    const rows = compareRows(a, b, SPEC);
    expect(rows[0]).toEqual({ label: "拆法", a: ["冰山模型（工具 1.0.0 版）"], b: ["利害關係人圖"] });
    expect(rows[1]).toEqual({ label: "facts", a: ["一句：他三次改條件", "text a"], b: [] });
    expect(rows.find((row) => row.label === "核心矛盾（你寫的）")).toEqual({ label: "核心矛盾（你寫的）", a: ["信任"], b: [] });
    expect(rows.find((row) => row.label === "主張")?.b).toEqual(["事實：同業都這樣改"]);
    expect(rows.find((row) => row.label === "解不了的局")?.b).toEqual(["你標成解不了的局"]);
  });

  it("two versions that differ only in assumptions, a group, a claim's detail, an answer or a skipped layer do not look the same (critic m5)", () => {
    const base: MapContent = { layers: { interests: [{ id: "i1", text: "保住生意", by: "user" }] }, claims: [{ id: "c1", text: "他能改", kind: "法律", by: "user" }] };
    const other: MapContent = { ...base, layers: { interests: [{ id: "i1", text: "保住生意", by: "user", group: "合夥人" }] }, skipped: ["structure"], assumptions: [{ text: "他不會退出", by: "user" }],
      claims: [{ id: "c1", text: "他能改", kind: "法律", by: "user", details: { jurisdiction: "台灣" } }], unwinnable_answers: [{ q: 0, answer: "是" }] };
    const rows = compareRows(base, other, SPEC);
    for (const label of ["interests", "structure", "假設", "主張", "解不了的局"]) {
      const row = rows.find((item) => item.label === label)!;
      expect(row.a.join("|"), label).not.toEqual(row.b.join("|"));
    }
  });
});

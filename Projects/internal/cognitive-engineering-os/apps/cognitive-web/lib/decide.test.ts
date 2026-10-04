import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NONE, type Evidence } from "./evidence";
import { ASKED, CELLS, STANDING, STOP_QUESTIONS, cannotSave, current, type Fact, emptyCells, holdAsked, influencesFrom, intensityAdvice, newPeople, sealedNow, sourceLine, versionRows, voicesOnMap, withMapFacts, wontChange } from "./decide";

const LEAN = { intensity_now: "弱", uncertainty: "不知道", change_condition: "他願意寫進合約", confidence: 50 };

describe("什麼會改變結論", () => {
  it("accepts 「沒有」 and says so; a real condition, an empty cell or a non-text is not flagged", () => {
    for (const text of ["沒有", "沒有。", " 無 ", "沒有任何證據", "None", "「沒有」", "no"]) expect(wontChange(text), text).toBe(true);
    for (const text of ["沒有，除非他道歉", "如果他願意寫進合約", "", undefined, 5]) expect(wontChange(text), String(text)).toBe(false);
  });
});

describe("what the card requires to be saved", () => {
  it("needs the intensity, the uncertainty, what would change it and a confidence 0..100; writing 「沒有」 is enough", () => {
    expect(cannotSave(LEAN, 1)).toBeNull();
    expect(cannotSave({ ...LEAN, change_condition: "沒有" }, 1)).toBeNull();
    for (const key of ["intensity_now", "uncertainty", "change_condition", "confidence"] as const) expect(cannotSave({ ...LEAN, [key]: undefined }, 1), key).not.toBeNull();
    expect(cannotSave({ ...LEAN, uncertainty: "  " }, 1)).not.toBeNull();
    for (const confidence of [-1, 101, 50.5]) expect(cannotSave({ ...LEAN, confidence }, 1), String(confidence)).toMatch(/0 到 100/);
    expect(cannotSave({ ...LEAN, confidence: 0 }, 1)).toBeNull();
  });

  it("a new version needs its reason; the first does not", () => {
    expect(cannotSave(LEAN, 2)).toMatch(/為什麼改/);
    expect(cannotSave({ ...LEAN, revision_reason: "他回信了" }, 2)).toBeNull();
  });
});

describe("the system's check of the cells", () => {
  it("lists every empty cell, the four stop questions, and the reason only from the second version on", () => {
    const all = emptyCells({}, 1);
    expect(all).toContain("暫定結論");
    for (const cell of CELLS) expect(all).toContain(cell.label);
    for (const item of STOP_QUESTIONS) expect(all).toContain(`停止分析：${item.question}`);
    expect(all).not.toContain("修訂理由");
    expect(emptyCells({}, 2)).toContain("修訂理由");
  });

  it("a cell with two fields (決策者與受影響者) is filled by either; whitespace is empty", () => {
    expect(emptyCells({ affected: ["員工"] }, 1)).not.toContain("決策者與受影響者");
    expect(emptyCells({ deciders: "我" }, 1)).not.toContain("決策者與受影響者");
    expect(emptyCells({ uncertainty: "   " }, 1)).toContain("仍然不確定的地方");
    expect(emptyCells({ stop_answers: { unknown: "他的成本" } }, 1)).not.toContain(`停止分析：${STOP_QUESTIONS[0].question}`);
  });
});

describe("sources under a fact", () => {
  it("says how many independent sources there are, and marks a fact on one or none, or the person's own say", () => {
    const now = (fact: { sources: number; self_said: boolean }) => sourceLine(current({ text: "x", ...fact }, NONE));
    expect(now({ sources: 0, self_said: true })).toEqual({ text: "我自己說的，還沒有外部出處", warn: true });
    expect(now({ sources: 1, self_said: false })).toEqual({ text: "只靠 1 個出處", warn: true });
    expect(now({ sources: 0, self_said: false })).toEqual({ text: "查不到出處", warn: true });
    expect(now({ sources: 3, self_said: false })).toEqual({ text: "3 個獨立出處", warn: false });
  });

  it("reads a fact's count from what it points at, never from the stored copy", () => {
    const card = (id: string) => ({ card: id, version: 1, source_id: id, url: "https://x.example", title: id, aside: "", found_by: { by: "系統找的" }, cells: {}, mine: {} });
    const claim = { claim_id: "C1", version: 1, text: "t", sentence: "可以查的事實", law: false, state: "有獨立出處支持", support: ["o:1"], oppose: [], stale: 0, few: true, verdict: { verdict: "採信", reason: "r", earlier: false }, usable: true };
    const evidence: Evidence = { ...NONE, origins: [{ origin_id: "o:1", how: "單獨", pending: false, aside: false, counts: true, mark: null, cards: [card("k1")] },
                                                    { origin_id: "o:2", how: "單獨", pending: false, aside: false, counts: false, mark: null, cards: [card("k2")] }], claims: [claim] };
    expect(sourceLine(current({ text: "a", sources: 2, self_said: false, cards: ["k1", "k2"] }, evidence)).text).toBe("只靠 1 個出處");
    expect(sourceLine(current({ text: "b", sources: 5, self_said: false, claim: "C1", claim_version: 1, against: 2 }, evidence)).text).toBe("只靠 1 個出處");
    expect(sourceLine(current({ text: "c", sources: 2, self_said: false, claim: "C1", claim_version: 1 }, { ...evidence, claims: [{ ...claim, usable: false }] }))).toEqual({ text: "查證那一步現在不能當事實", warn: true });
    expect(sourceLine(current({ text: "d", sources: 2, self_said: false, claim: "C1", claim_version: 0 }, evidence))).toEqual({ text: "查證那一步改過這個主張，這句是舊的說法", warn: true });   // an older wording
    expect(sourceLine(current({ text: "e", sources: 2, self_said: false, claim: "C9", claim_version: 1 }, evidence))).toEqual({ text: "查證那一步已經沒有這個主張", warn: true });
    const listed = influencesFrom({ facts: [{ text: "a", sources: 2, self_said: false, cards: ["k1", "k2"] }], map: null, evidence, voices: [], thinkCards: [], facilitated: false });
    expect(listed.map((item) => item.text)).toContain("「a」：只靠 1 個出處");   // the influence list reads the same rule
  });

  it("reads a fact the same way as the DECIDE check (one fixture for both sides)", () => {
    const fixture = JSON.parse(readFileSync(path.resolve(process.cwd(), "../../tests/fixtures/fact_standing.json"), "utf8")) as { cases: Array<{ name: string; standing: string; fact: Fact; claims: Evidence["claims"] }> };
    const byText = Object.fromEntries(Object.entries(STANDING).map(([key, text]) => [text, key]));
    for (const { name, standing, fact, claims } of fixture.cases) {
      const now = current(fact, { ...NONE, claims });
      const got = fact.cards?.length ? "linked" : !fact.claim ? "own" : now.standing ? byText[now.standing] : "current";
      expect([name, got]).toEqual([name, standing]);
    }
  });
});

describe("the influence list the system makes", () => {
  const map = { method: "冰山模型", layers: { facts: [{ text: "同業都這樣改", sources: 1, self_said: false }, { text: "他三次改價", sources: 3, self_said: false }, { text: "我覺得他在拖", card: "c1" }], interests: [{ text: "他怕賠錢", card: "c2" }] } };
  const cards = [
    { doc_id: "c1", content: { category: "感受", text: "我很氣" } },
    { doc_id: "c2", content: { category: "別人的聲音", text: "朋友說他不可靠", from_whom: "同學" } },
    { doc_id: "c3", content: { category: "別人的聲音", text: "網路上有人說要退出" } },
  ];

  it("lists the map's voices only for the cards that are on the map, and only of that category", () => {
    expect(voicesOnMap(map, cards)).toEqual([{ text: "朋友說他不可靠", from_whom: "同學" }]);   // c3 is a voice, but not on the map: not read
    expect(voicesOnMap(null, cards)).toEqual([]);
  });

  it("always lists the AI and this platform; the method, one-source facts, voices and AI thinking cards when there are any", () => {
    const bare = influencesFrom({ facts: [], map: null, evidence: NONE, voices: [], thinkCards: [], facilitated: false });
    expect(bare.map((item) => item.kind)).toEqual(["ai", "platform"]);
    const full = influencesFrom({ facts: [], map, evidence: NONE, voices: voicesOnMap(map, cards), thinkCards: [{ author: "ai", content: { claim: "也許是成本漲了" } }, { author: "joint", content: { claim: "先談一次" } }, { author: "user", content: { claim: "我自己想的" } }], facilitated: false });
    expect(full.map((item) => item.kind)).toEqual(["voice", "single_source", "single_source", "ai_think", "ai_think", "method", "ai", "platform"]);
    const texts = full.map((item) => item.text).join("\n");
    expect(texts).toContain("別人的聲音：「朋友說他不可靠」（來自：同學）");
    expect(texts).toContain("「同業都這樣改」：只靠 1 個出處");
    expect(texts).toContain("「我覺得他在拖」：我自己說的，還沒有外部出處");
    expect(texts).not.toContain("他三次改價");   // three independent sources: not a thin one
    expect(texts).toContain("AI 寫的思考卡：「也許是成本漲了」");
    expect(texts).toContain("AI 起草、你改過的思考卡：「先談一次」");
    expect(texts).not.toContain("我自己想的");   // the person's own card does not influence them through the AI
    expect(texts).toContain("這次用的拆法：冰山模型");
  });

  it("lists the facilitator only when someone leads the case", () => {
    expect(influencesFrom({ facts: [], map: null, evidence: NONE, voices: [], thinkCards: [], facilitated: true }).map((item) => item.kind)).toEqual(["ai", "platform", "facilitator"]);
  });

  it("a fact on the card counts once even when the map has the same words", () => {
    const listed = influencesFrom({ facts: [{ text: "同業都這樣改", sources: 1, self_said: false }], map, evidence: NONE, voices: [], thinkCards: [], facilitated: false });
    expect(listed.filter((item) => item.text.includes("同業都這樣改"))).toHaveLength(1);
  });

  it("takes the map's facts onto the card once, keeping what is already written", () => {
    const held = [{ text: "同業都這樣改", sources: 2, self_said: false, credibility: "高" }];
    const merged = withMapFacts(held, map);
    expect(merged).toHaveLength(3);
    expect(merged[0]).toEqual(held[0]);
    expect(withMapFacts(merged, map)).toHaveLength(3);
  });
});

describe("people, holds and the seal", () => {
  it("writes back only the people the intake does not list", () => {
    expect(newPeople(["合夥人"], [" 合夥人 ", "員工", "員工", ""])).toEqual(["員工"]);
    expect(newPeople([], [])).toEqual([]);
  });

  it("asks to wait or have someone review only under the guardrail, for what you confirmed cannot be undone, until you answer", () => {
    expect(holdAsked(["wait_or_review"], ["退出"], undefined)).toBe(true);
    expect(holdAsked(["wait_or_review"], ["退出"], "請人覆核")).toBe(false);
    expect(holdAsked(["wait_or_review"], [], undefined)).toBe(false);
    expect(holdAsked(["professional", "require_sources"], ["退出"], undefined)).toBe(false);
  });

  it("the seal binds the version being written and the one last saved, like the engine", () => {
    expect(sealedNow(0, [])).toBe(false);
    expect(sealedNow(1, [2])).toBe(true);    // drafting version 2
    expect(sealedNow(2, [2])).toBe(true);    // version 2 saved: still sealed
    expect(sealedNow(3, [2])).toBe(false);   // version 3 is free again
    expect(sealedNow(0, [1])).toBe(true);    // sealed before the first save
  });

  it("advises deferring the irreversible only when the intensity is 強", () => {
    expect(intensityAdvice("強")).toMatch(/延後/);
    expect(intensityAdvice("中")).toBe("");
    expect(intensityAdvice(undefined)).toBe("");
  });
});

describe("two versions side by side", () => {
  it("marks the rows that changed and leaves out the ones both versions leave empty", () => {
    const rows = versionRows({ conclusion: "先談一次", confidence: 60, change_condition: "他回信", intensity_now: "強" }, { conclusion: "先談一次", confidence: 40, change_condition: "他回信", revision_reason: "他回信了" });
    expect(rows.map((row) => [row.label, row.changed])).toEqual([["暫定結論", false], ["信心（%）", true], ["什麼會改變結論", false], ["下判斷前的情緒強度", true], ["這一版為什麼改", true]]);
    expect(rows[1]).toMatchObject({ a: "60", b: "40" });
  });
});

describe("the asked list", () => {
  it("is the eight the card names", () => {
    expect(ASKED.map((item) => item.who)).toEqual(["家庭", "文化", "宗教", "法律", "你所在的制度", "演算法", "帶領者", "做研究的人"]);
  });
});

import { describe, expect, it } from "vitest";
import type { Doc } from "./blocks";
import { sprintsThisWeek, weekStart, whatTheAiSaid } from "./learn";

const doc = <C,>(doc_id: string, content: C, author: Doc["author"] = "ai", version = 1): Doc<C> => ({ doc_id, kind: "x", version, content, author, block: "X", at: "2026-10-03T08:00:00Z" });
const none = { checks: [], reviews: [], mirrors: [], senseReviews: [], thinkCards: [], thinkReactions: [], mapReviews: [] };

describe("what the AI said, and whether you took it", () => {
  it("pairs an AI check with the person's answer to it, and says so when there is none", () => {
    const check = doc("C1", { reversibility: ["退出：簽了就退不回"], gaps: ["替代假設"], question: "你最怕什麼？" });
    const open = whatTheAiSaid({ ...none, checks: [check] });
    expect(open[0]).toMatchObject({ from: "判斷：AI 的檢查", author: "ai", took: "還沒回應" });
    expect(open[0].said).toContain("不能反悔：退出：簽了就退不回");
    const answered = whatTheAiSaid({ ...none, checks: [check], reviews: [doc("R1", { check: "C1", version: 1, irreversible: ["退出：簽了就退不回"], hold: "請人覆核" }, "user")] });
    expect(answered[0].took).toBe("你確認了 1 個不能反悔的地方，選了「請人覆核」");
  });

  it("reads the answer to a mirror from the review of that very version; a dropped one leaves its decision and never its words", () => {
    const mirror = doc("M1", { summary: "你寫了三件事" }, "ai", 2);
    const rows = whatTheAiSaid({ ...none, mirrors: [mirror], senseReviews: [doc("S1", { mirror: "M1", version: 1, decision: "刪掉" }, "user"), doc("S2", { mirror: "M1", version: 2, decision: "改寫" }, "user")] });
    expect(rows[0]).toMatchObject({ from: "外化：AI 當鏡子", took: "你改寫了" });
    const gone = whatTheAiSaid({ ...none, senseReviews: [doc("S3", { mirror: "M9", version: 1, decision: "刪掉" }, "user")] });
    expect(gone).toEqual([{ from: "外化：AI 當鏡子", author: "ai", said: "（你刪掉的整理，內容不留）", took: "你刪掉了 1 份" }]);
  });

  it("shows an AI thinking card with the pick or the reaction, and counts the map suggestions taken and not taken", () => {
    const rows = whatTheAiSaid({ ...none, thinkCards: [doc("K1", { claim: "也許是成本漲了" }, "ai"), doc("K2", { claim: "他在試探" }, "joint"), doc("K3", { claim: "先談" }, "ai")],
      thinkReactions: [doc("R1", { card: "K1", picked: true }, "user"), doc("R2", { card: "K2", reaction: "反感" }, "user")], mapReviews: [doc("P1", { decision: "採用" }, "user"), doc("P2", { decision: "不採用" }, "user"), doc("P3", { decision: "不採用" }, "user")] });
    expect(rows.map((row) => row.took)).toEqual(["你選了帶走", "你的反應：反感", "還沒回應", "你採用 1 條、不採用 2 條"]);
    expect(rows[1].author).toBe("joint");
  });

  it("gives nothing when there is nothing", () => {
    expect(whatTheAiSaid(none)).toEqual([]);
  });
});

describe("the week of a sprint", () => {
  it("counts by the ISO week, Monday first: a Sunday belongs to the week before", () => {
    expect(weekStart("2026-10-07")).toBe("2026-10-05");   // a Wednesday
    expect(weekStart("2026-10-04")).toBe("2026-09-28");   // a Sunday
    expect(weekStart("2026-10-05")).toBe("2026-10-05");   // a Monday
    expect(sprintsThisWeek(["2026-10-06", "2026-10-04", "2026-10-09", "2026-10-12"], "2026-10-07")).toBe(2);
    expect(sprintsThisWeek([], "2026-10-07")).toBe(0);
  });
});

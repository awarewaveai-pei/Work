import { describe, expect, it } from "vitest";
import type { Doc } from "./blocks";
import { caseBrief } from "./case-brief";
import type { SenseCard } from "./map";

const card = (id: string, category: string, text: string): Doc<SenseCard> => ({ doc_id: id, kind: "sense.card", version: 1, content: { category, text }, author: "user", block: "SENSE", at: "2026-10-10T09:00:00Z" });

describe("caseBrief: a case as one description for a tool run (走查 2026-10-12 W21)", () => {
  it("is the person's question, cards and layers in their own words, in that order", () => {
    const text = caseBrief({ question: " 要不要續約 " }, [card("a", "事件", "他第三次改條件")], { layers: { facts: [{ id: "f", text: "合約下個月到期", by: "user" }, { id: "g", text: "  ", by: "user" }], intervention: [{ id: "i", text: "先談一年", by: "user" }] } });
    expect(text).toBe("我想釐清：要不要續約\n\n我寫下的卡片：\n- （事件）他第三次改條件\n\n我拆解的六層：\n事實：合約下個月到期\n介入：先談一年");
  });

  it("leaves out what is empty, is empty for an empty case, and stays under the 8000-character limit of the draft", () => {
    expect(caseBrief(undefined, [], undefined)).toBe("");
    expect(caseBrief({ question: "" }, [card("a", "事件", "  ")], { layers: { facts: [] } })).toBe("");
    expect(caseBrief({ question: "問" }, [card("a", "事件", "字".repeat(9000))], undefined).length).toBeLessThanOrEqual(7000);
  });
});

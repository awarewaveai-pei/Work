import { describe, expect, it } from "vitest";
import type { Tool } from "../../lib/map";
import { suggestTools } from "./mapMethods";

const tool = (method_id: string, name: string, family: string, blurb_zh: string, name_en = ""): Tool => ({ method_id, name, name_en, blurb_zh, family, family_zh: family, version: "1", used: false });
const TOOLS = [
  tool("causal.regression_discontinuity", "斷點迴歸設計", "causal", "看門檻兩邊的人，結果差在哪裡"),
  tool("stakeholders.map", "利害關係人分析", "stakeholders", "列出每個相關的人想要什麼、怕什麼"),
  tool("strategy.swot", "SWOT 分析", "strategy", "列出優勢、劣勢、機會與威脅", "SWOT"),
  tool("systems.iceberg_model", "冰山模型", "systems", "把看得見的事件往下看，找出一再發生的模式"),
];

describe("MAP.method as code: the free matching of 先說你卡在哪, then the case's purpose order", () => {
  it("picks the tools whose name or blurb holds the words written, the most matched words first, and says which words matched", () => {
    const one = suggestTools(TOOLS, undefined, "同樣的問題一再發生");
    expect(one.map((pick) => pick.tool.method_id)).toEqual(["systems.iceberg_model"]);
    expect(one[0].hits).toEqual(["一再", "再發", "發生"]);
    const two = suggestTools(TOOLS, undefined, "一再發生，每個人想要什麼");
    expect(two.map((pick) => pick.tool.method_id)).toEqual(["stakeholders.map", "systems.iceberg_model"]);   // five matched words, then three
  });

  it("among tools with as many matched words, the case's purpose decides; research methods stay behind the others", () => {
    const tie = [tool("causal.a", "甲分析", "causal", "測試的人"), tool("strategy.b", "乙分析", "strategy", "測試的人"), tool("systems.c", "丙分析", "systems", "測試的人")];
    expect(suggestTools(tie, "團隊審議", "測試的人").map((pick) => pick.tool.method_id)).toEqual(["systems.c", "strategy.b", "causal.a"]);   // 團隊審議 lists systems before strategy
    expect(suggestTools(tie, "創意發散", "測試的人").map((pick) => pick.tool.method_id)).toEqual(["strategy.b", "systems.c", "causal.a"]);   // 創意發散 names strategy and not systems
  });

  it("says nothing when no word is shared or nothing was written", () => {
    expect(suggestTools(TOOLS, "複雜決策", "今天天氣很好")).toEqual([]);
    expect(suggestTools(TOOLS, "複雜決策", "   ")).toEqual([]);
    expect(suggestTools([], "複雜決策", "想要什麼")).toEqual([]);
  });
});

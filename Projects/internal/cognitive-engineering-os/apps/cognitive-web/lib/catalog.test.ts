import { describe, expect, it } from "vitest";
import type { Catalog } from "./catalog";
import { goalOf, runHref, shownAbbr, stations, toolHref, toolSearchKey, toolsOfGoal } from "./catalog";
import { pickTools, termsOf } from "../components/StuckBox";
import { sectionOf } from "../components/AppNav";

const catalog = {
  counts: { tools: 3, user_workflows: 1, internal_workflows: 0 },
  methods: {
    "systems.iceberg_model": { name_zh: "冰山模型", name_en: "Iceberg Model", abbr: null, blurb_zh: "找出一再發生的事背後的結構", family: "systems", goal: "why", next: [] },
    "strategy.swot": { name_zh: "SWOT 分析", name_en: "SWOT Analysis", abbr: "SWOT", blurb_zh: "強弱機會威脅", family: "strategy", goal: "see", next: [] },
    "decision.five_forces": { name_zh: "五力分析", name_en: "Porter's Five Forces", abbr: "5F", blurb_zh: "產業競爭的五種力量", family: "decision", goal: "see", next: [] },
  },
  goals: [
    { id: "why", title_zh: "為什麼一直發生？", short_zh: "為什麼", blurb_zh: "", icon: "layers", families: ["systems"], featured: ["systems.iceberg_model"] },
    { id: "see", title_zh: "看清楚局勢", short_zh: "看局", blurb_zh: "", icon: "compass", families: ["strategy", "decision"], featured: ["strategy.swot"] },
  ],
  popular: [], prompts: [], recipes: [], glyphs: {}, shapes: {},
} as unknown as Catalog;

describe("catalog helpers (mirror docs/mockups/mockkit.py)", () => {
  it("a goal holds the tools of its families; a tool knows its goal", () => {
    expect(toolsOfGoal(catalog, catalog.goals[1])).toEqual(["strategy.swot", "decision.five_forces"]);
    expect(goalOf(catalog, "decision.five_forces").id).toBe("see");
  });

  it("an abbreviation shows only when the names do not already say it", () => {
    expect(shownAbbr(catalog.methods["strategy.swot"])).toBe("");
    expect(shownAbbr(catalog.methods["decision.five_forces"])).toBe("5F");
    expect(shownAbbr(catalog.methods["systems.iceberg_model"])).toBe("");
  });

  it("the search key covers both names, the abbreviation, the id and the line", () => {
    const key = toolSearchKey("strategy.swot", catalog.methods["strategy.swot"]);
    for (const part of ["swot 分析", "swot analysis", "strategy.swot", "強弱機會威脅"]) expect(key).toContain(part);
  });

  it("stations collapse runs of capability steps and keep tools in order", () => {
    expect(stations(["a.b", "capability", "capability", "c.d", "capability"])).toEqual([{ tool: "a.b" }, { capabilities: 2 }, { tool: "c.d" }, { capabilities: 1 }]);
  });

  it("routes: a tool page, its run page", () => {
    expect(toolHref("systems.iceberg_model")).toBe("/methods/systems.iceberg_model");
    expect(runHref("systems.iceberg_model")).toBe("/methods/systems.iceberg_model/run");
  });
});

describe("幫我挑 first layer (free matching, never a guess)", () => {
  it("Chinese text becomes 2-character terms, latin words stay whole", () => {
    expect(termsOf("一再發生 SWOT")).toEqual(expect.arrayContaining(["一再", "再發", "發生", "swot"]));
  });

  it("ranks by matched terms, at most three, and names what matched", () => {
    const picks = pickTools(catalog, "同樣的問題一再發生");
    expect(picks[0].id).toBe("systems.iceberg_model");
    expect(picks[0].hits).toEqual(expect.arrayContaining(["一再", "發生"]));
    expect(pickTools(catalog, "分析 分析 力量 競爭 威脅 機會").length).toBeLessThanOrEqual(3);
  });

  it("a sentence that shares no word with any tool returns nothing", () => {
    expect(pickTools(catalog, "今天天氣很好")).toEqual([]);
    expect(pickTools(catalog, "   ")).toEqual([]);
  });
});

describe("main menu section of a path", () => {
  it("top pages, a tool page under 工具, a run page under 我的專案", () => {
    expect(sectionOf("/")).toBe("home");
    expect(sectionOf("/methods")).toBe("tools");
    expect(sectionOf("/methods/systems.iceberg_model")).toBe("tools");
    expect(sectionOf("/methods/systems.iceberg_model/run")).toBe("projects");
    expect(sectionOf("/workflows")).toBe("workflows");
    expect(sectionOf("/projects")).toBe("projects");
  });
});

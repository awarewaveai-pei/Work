import { describe, expect, it, vi } from "vitest";
import type { Catalog } from "./catalog";
import { CATALOG_RECHECK_MS, goalOf, isUserTool, makeCatalogLoader, runHref, shownAbbr, stations, stuckCatalog, toolHref, toolSearchKey, toolsOfGoal, userGoals, userToolCount } from "./catalog";
import { pickTools, termsOf } from "../components/StuckBox";
import { sectionOf } from "../components/AppNav";

const catalog = {
  counts: { tools: 3, user_workflows: 1, internal_workflows: 0 },
  methods: {
    "systems.iceberg_model": { name_zh: "冰山模型", name_en: "Iceberg Model", abbr: null, blurb_zh: "找出一再發生的事背後的結構", family: "systems", goal: "why", next: [] },
    "strategy.swot": { name_zh: "SWOT 分析", name_en: "SWOT Analysis", abbr: "SWOT", blurb_zh: "強弱機會威脅", family: "strategy", goal: "see", next: [] },
    "decision.five_forces": { name_zh: "五力分析", name_en: "Porter's Five Forces", abbr: "5F", blurb_zh: "產業競爭的五種力量", family: "decision", goal: "see", next: [] },
    // an engineering tool: its words match a sentence about competition, and it must still never be offered
    "security.stride": { name_zh: "STRIDE 威脅模型", name_en: "STRIDE", abbr: null, blurb_zh: "產業競爭對手的威脅", family: "security", block: "INTERNAL", goal: "eng", next: [] },
  },
  goals: [
    { id: "why", title_zh: "為什麼一直發生？", short_zh: "為什麼", blurb_zh: "", icon: "layers", families: ["systems"], featured: ["systems.iceberg_model"] },
    { id: "see", title_zh: "看清楚局勢", short_zh: "看局", blurb_zh: "", icon: "compass", families: ["strategy", "decision"], featured: ["strategy.swot"] },
    { id: "eng", title_zh: "工程決策", short_zh: "工程", blurb_zh: "", icon: "gear", families: ["security"], featured: ["security.stride"], internal: true },
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
  const stuck = stuckCatalog(catalog);
  it("Chinese text becomes 2-character terms, latin words stay whole", () => {
    expect(termsOf("一再發生 SWOT")).toEqual(expect.arrayContaining(["一再", "再發", "發生", "swot"]));
  });

  it("ranks by matched terms, at most three, and names what matched", () => {
    const picks = pickTools(stuck, "同樣的問題一再發生");
    expect(picks[0].id).toBe("systems.iceberg_model");
    expect(picks[0].hits).toEqual(expect.arrayContaining(["一再", "發生"]));
    expect(pickTools(stuck, "分析 分析 力量 競爭 威脅 機會").length).toBeLessThanOrEqual(3);
  });

  it("an engineering tool is never offered, whatever it matches (ENTRY_SLICE1_CHECKLIST.md item 5)", () => {
    expect(pickTools(stuck, "產業競爭的威脅").map((pick) => pick.id)).not.toContain("security.stride");
    expect(isUserTool(catalog, "security.stride")).toBe(false);
    expect(isUserTool(catalog, "strategy.swot")).toBe(true);
    expect(userGoals(catalog).map((goal) => goal.id)).toEqual(["why", "see"]);
    expect(userToolCount(catalog)).toBe(3);
  });

  it("a sentence that shares no word with any tool returns nothing", () => {
    expect(pickTools(stuck, "今天天氣很好")).toEqual([]);
    expect(pickTools(stuck, "   ")).toEqual([]);
  });
});

describe("main menu section of a path", () => {
  it("five things a person does: a run page and a group under 我的案子, a tool page and a lesson under 直接分析 (ENTRY_SLICE1 items 11-12)", () => {
    expect(sectionOf("/")).toBe("home");
    expect(sectionOf("/projects")).toBe("projects");
    expect(sectionOf("/projects/P1/start")).toBe("projects");
    expect(sectionOf("/methods/systems.iceberg_model/run")).toBe("projects");
    expect(sectionOf("/groups")).toBe("projects");
    expect(sectionOf("/groups/g1")).toBe("projects");
    expect(sectionOf("/analyze")).toBe("analyze");
    expect(sectionOf("/methods")).toBe("analyze");
    expect(sectionOf("/methods/systems.iceberg_model")).toBe("analyze");
    expect(sectionOf("/workflows")).toBe("analyze");
    expect(sectionOf("/learn/workflow/w1")).toBe("analyze");
  });
  it("練習 holds 課程 and 校準; 帶領 holds a group's 帶領 page; the account pages are their own", () => {
    expect(sectionOf("/me/teach")).toBe("practice");
    expect(sectionOf("/me/learn")).toBe("practice");
    expect(sectionOf("/lead")).toBe("lead");
    expect(sectionOf("/groups/g1/lead")).toBe("lead");
    expect(sectionOf("/me/data")).toBe("data");
    expect(sectionOf("/settings")).toBe("settings");
    expect(sectionOf("/help")).toBe("help");
  });
});

describe("loadCatalog keeps one parsed copy and revalidates it with the API's ETag", () => {
  const reply = (status: number, etag: string | null, body: unknown = catalog) =>
    new Response(status === 304 ? null : JSON.stringify(body), { status, headers: etag ? { etag } : {} });

  it("fetches once, then serves the kept copy inside the recheck window and asks If-None-Match after it (304 keeps the same object)", async () => {
    let clock = 0;
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply(200, '"a"'))
      .mockResolvedValueOnce(reply(304, '"a"'));
    const load = makeCatalogLoader(fetchImpl as unknown as typeof fetch, () => clock);
    const first = await load();
    expect(await load()).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = CATALOG_RECHECK_MS + 1;
    expect(await load()).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1][1] as RequestInit).headers).toEqual({ "If-None-Match": '"a"' });
  });

  it("a changed registry (200 with a new ETag) replaces the kept copy; concurrent renders share one question", async () => {
    let clock = 0;
    const changed = { ...catalog, prompts: ["new"] };
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(200, '"a"')).mockResolvedValueOnce(reply(200, '"b"', changed));
    const load = makeCatalogLoader(fetchImpl as unknown as typeof fetch, () => clock);
    await load();
    clock = CATALOG_RECHECK_MS + 1;
    const [x, y, z] = await Promise.all([load(), load(), load()]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(x.prompts).toEqual(["new"]);
    expect(y).toBe(x);
    expect(z).toBe(x);
  });

  it("a failed recheck serves the kept copy; with nothing kept the error reaches the page; no ETag = no keeping", async () => {
    let clock = 0;
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(200, '"a"')).mockRejectedValueOnce(new Error("api down"));
    const load = makeCatalogLoader(fetchImpl as unknown as typeof fetch, () => clock);
    const first = await load();
    clock = CATALOG_RECHECK_MS + 1;
    expect(await load()).toBe(first);
    expect(await load()).toBe(first);   // the failed recheck is not repeated by every render
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const empty = makeCatalogLoader(vi.fn().mockResolvedValue(new Response("CATALOG_INVALID", { status: 503 })) as unknown as typeof fetch, () => clock);
    await expect(empty()).rejects.toThrow(/GET \/catalog 503/);
    const noEtag = vi.fn().mockImplementation(async () => reply(200, null));
    const old = makeCatalogLoader(noEtag as unknown as typeof fetch, () => clock);
    await old();
    await old();
    expect(noEtag).toHaveBeenCalledTimes(2);
  });
});

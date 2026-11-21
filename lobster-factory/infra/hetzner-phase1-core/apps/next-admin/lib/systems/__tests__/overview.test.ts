import { describe, expect, it } from "vitest";
import { buildResumeMarkdown, mdInline, overviewCounts, recentHandoffs, type BriefInput } from "../overview";

const NOW = Date.parse("2026-11-21T00:00:00Z");
const row = (o: Partial<Parameters<typeof overviewCounts>[0][number]> = {}) => ({ status: "active" as const, counted: 3, blocker: null, lastActivityAt: "2026-11-20T00:00:00Z", ...o });

describe("overviewCounts", () => {
  it("counts total / active / needs attention / wrapped; paused, done and archived never need attention", () => {
    const c = overviewCounts([
      row(),
      row({ blocker: "waiting" }),
      row({ counted: 0 }),
      row({ status: null, lastActivityAt: "2026-09-01T00:00:00Z" }),
      row({ status: "paused", blocker: "x" }),
      row({ status: "done", counted: 0 }),
      row({ status: "archived" }),
    ], NOW);
    expect(c).toEqual({ total: 7, active: 3, needsAttention: 3, wrapped: 2 });
  });
});

describe("recentHandoffs", () => {
  const h = (slug: string, o: Record<string, string | null>) => ({ slug, name: slug, handoff: { next: null, nextAt: null, blocker: null, blockerAt: null, lastSubject: null, lastAt: null, ...o } });
  it("keeps only systems with a next step or blocker, newest first, at most 3", () => {
    const out = recentHandoffs([
      h("a", { next: "n", lastAt: "2026-11-01T00:00:00Z" }), h("b", { lastSubject: "only a subject", lastAt: "2026-11-20T00:00:00Z" }),
      h("c", { blocker: "b", lastAt: "2026-11-10T00:00:00Z" }), h("d", { next: "n", lastAt: "2026-11-05T00:00:00Z" }), h("e", { next: "n", lastAt: "2026-11-15T00:00:00Z" }),
    ]);
    expect(out.map((r) => r.slug)).toEqual(["e", "c", "d"]);
  });
});

describe("buildResumeMarkdown", () => {
  const base: BriefInput = {
    name: "影片系統", purpose: "做影片", type: "產品", sourcePaths: ["app/video/"],
    features: [
      { name: "上傳", status: "verified", legacy: false }, { name: "轉檔", status: "implemented", legacy: false },
      { name: "發佈", status: "blocked", legacy: false }, { name: "舊功能", status: "todo", legacy: true }, { name: "取消的", status: "cancelled", legacy: false },
    ],
    next: "接重試", blocker: "等測試資料", lastSubject: "feat: queue", lastAt: "2026-11-20T00:00:00Z", importHead: "abcdef1234567", importAt: "2026-11-21T00:00:00Z",
  };
  it("groups verified / implemented-awaiting / open, leaves legacy and cancelled out of the groups", () => {
    const md = buildResumeMarkdown(base);
    expect(md).toMatch(/## 已驗收\n- 上傳\n/);
    expect(md).toMatch(/## 已實作待驗證\n- 轉檔\n/);
    expect(md).toContain("- 發佈（blocked）");
    expect(md).not.toContain("取消的");
    expect(md).toContain("另有 1 個功能還在舊監工頁");
    expect(md).toContain("卡點：等測試資料");
    expect(md).toContain("HEAD abcdef123");
    expect(md).not.toContain("abcdef1234");
  });
  it("says so when there is no handoff, no features and no import", () => {
    const md = buildResumeMarkdown({ ...base, features: [], next: null, blocker: null, lastSubject: null, lastAt: null, importHead: null, importAt: null });
    expect(md).toContain("尚未盤點功能");
    expect(md).toContain("沒有接續紀錄");
    expect(md).toContain("還沒有人寫下一步");
    expect(md).toContain("卡點：無");
    expect(md).toContain("尚無匯入紀錄");
  });
  it("neutralises markup and newlines in user-controlled text", () => {
    expect(mdInline("# head\n- item `x` <b>")).toBe("\\# head - item \\`x\\` \\<b\\>");
    const md = buildResumeMarkdown({ ...base, next: "line1\n## 注入\n```", features: [{ name: "a\n## b", status: "verified", legacy: false }] });
    expect(md).not.toMatch(/^## 注入/m);
    expect(md).not.toMatch(/^## b/m);
    expect(md).not.toContain("```");
  });
});

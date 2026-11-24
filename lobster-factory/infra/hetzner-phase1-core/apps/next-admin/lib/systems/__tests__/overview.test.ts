import { describe, expect, it } from "vitest";
import type { UpdateRow } from "../projection";
import { buildResumeMarkdown, effectiveStatus, implementedRatio, legacyDone, livePhases, mdInline, overviewCounts, progressKind, recentHandoffs, type BriefInput } from "../overview";

const NOW = Date.parse("2026-11-21T00:00:00Z");
const row = (o: Partial<Parameters<typeof overviewCounts>[0][number]> = {}) => ({ status: "active" as const, inferred: false, featureCount: 3, blocker: null, lastCommitAt: "2026-11-20T00:00:00Z", ...o });

describe("overviewCounts", () => {
  it("the three cards split the systems: 待確認 is taken out of 開發中 / 維護與已完成; set paused, done, archived never need attention", () => {
    const c = overviewCounts([
      row(),
      row({ blocker: "waiting" }),
      row({ featureCount: 0 }),
      row({ lastCommitAt: "2026-09-01T00:00:00Z" }),
      row({ status: "paused", blocker: "x" }),
      row({ status: "done", featureCount: 0 }),
      row({ status: "archived" }),
    ], NOW);
    expect(c).toEqual({ total: 7, active: 2, needsAttention: 2, wrapped: 2 }); // 2 + 2 + 2 + one set 暫停 = 7
  });

  it("an inferred status never takes a system out of 待確認; it still counts on 開發中 / 維護", () => {
    const ago = (d: number) => new Date(NOW - d * 86400000).toISOString();
    const built = { counted: 2, verified: 1, implemented: 1 };
    const eff20 = effectiveStatus(null, ago(20), NOW, built); // every feature built, last commit 20 days ago -> 已完成（推定）
    expect(eff20).toEqual({ status: "done", inferred: true });
    const blocked = row({ status: eff20.status, inferred: eff20.inferred, blocker: "waiting", lastCommitAt: ago(20) });
    const eff90 = effectiveStatus(null, ago(90), NOW); // open work, silent past STALL_DAYS but within PAUSE_DAYS -> 開發中（推定）
    const silent = row({ status: eff90.status, inferred: eff90.inferred, lastCommitAt: ago(90) });
    expect(overviewCounts([blocked, silent], NOW)).toEqual({ total: 2, active: 0, needsAttention: 2, wrapped: 0 });
    // inferred 暫停 (half a year, work open) is 待確認; set by someone it is not
    const dormant = effectiveStatus(null, ago(200), NOW);
    expect(overviewCounts([row({ status: dormant.status, inferred: dormant.inferred, lastCommitAt: ago(200) })], NOW).needsAttention).toBe(1);
    // set by someone: out of 待確認 even when blocked
    expect(overviewCounts([row({ status: "paused", inferred: false, blocker: "x" })], NOW).needsAttention).toBe(0);
  });
});

describe("progressKind", () => {
  it("empty without features, legacy when every feature is still on the old page, number otherwise", () => {
    expect(progressKind({ features: [], counted: 0 })).toBe("empty");
    expect(progressKind({ features: [{ legacy: true }, { legacy: true }], counted: 0 })).toBe("legacy");
    expect(progressKind({ features: [{ legacy: true }, { legacy: false }], counted: 1 })).toBe("number");
    expect(progressKind({ features: [{ legacy: false }], counted: 0 })).toBe("empty");
  });
  it("a system whose features are all on the old page is not flagged as uninventoried", () => {
    expect(overviewCounts([row({ featureCount: 2 })], NOW).needsAttention).toBe(0);
  });
});

describe("legacyDone", () => {
  let n = 0;
  const mig = (fid: string, legacy: string, sha: string | null): UpdateRow => ({ id: `m${++n}`, event_key: `mk${n}`, system_id: "s", phase_id: null, feature_id: fid, event_type: "migration", source: "migration", commit_sha: sha, occurred_at: "2026-11-01T00:00:00Z", payload: { legacy_status: legacy, mapped_status: "implemented" } });
  const revert = (sha: string, of: string): UpdateRow => ({ id: `r${++n}`, event_key: `rk${n}`, system_id: null, phase_id: null, feature_id: null, event_type: "revert", source: "importer", commit_sha: sha, occurred_at: "2026-11-02T00:00:00Z", payload: { reverted_sha: of } });
  it("counts done / migrated, but not a reverted commit's migration nor a feature gone from the registry", () => {
    const events = [mig("a", "done", "c1"), mig("b", "todo", "c2"), mig("c", "done", "c3"), mig("gone", "done", "c4")];
    const r = legacyDone(events, [revert("c9", "c3")], new Set(["a", "b", "c"]));
    expect(r).toEqual({ done: 1, total: 2, ratio: 0.5 });
    expect(legacyDone([], [], new Set()).ratio).toBeNull();
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
    expect(mdInline("~~~js")).toBe("\\~\\~\\~js");
    const md = buildResumeMarkdown({ ...base, next: "line1\n## 注入\n```", features: [{ name: "a\n## b", status: "verified", legacy: false }] });
    expect(md).not.toMatch(/^## 注入/m);
    expect(md).not.toMatch(/^## b/m);
    expect(md).not.toContain("```");
  });
});

describe("livePhases", () => {
  it("reads the newest ok run only: an error run says nothing", () => {
    const run = (at: string, status: string, live?: unknown) => ({ id: at, event_key: `run:${at}`, system_id: null, phase_id: null, feature_id: null,
      event_type: "import_run", source: "importer", commit_sha: null, occurred_at: at, payload: { status, live_phases: live } });
    expect([...livePhases([run("2026-11-01T00:00:00Z", "ok", ["p1", "p2"]), run("2026-11-02T00:00:00Z", "error", [])])]).toEqual(["p1", "p2"]);
    expect([...livePhases([run("2026-11-01T00:00:00Z", "ok", ["p1"]), run("2026-11-02T00:00:00Z", "ok", [])])]).toEqual([]);
    expect([...livePhases([])]).toEqual([]);
  });
});

describe("effectiveStatus", () => {
  const ago = (d: number) => new Date(NOW - d * 86400000).toISOString();
  it("quiet is not finished: open work stays 開發中 for 180 days, then 暫停; no activity unset", () => {
    const open = { counted: 3, verified: 0, implemented: 2 };
    expect(effectiveStatus(null, ago(60), NOW, open)).toEqual({ status: "active", inferred: true });
    expect(effectiveStatus(null, ago(180), NOW, open)).toEqual({ status: "active", inferred: true });
    expect(effectiveStatus(null, ago(181), NOW, open)).toEqual({ status: "paused", inferred: true });
    expect(effectiveStatus(null, ago(181), NOW)).toEqual({ status: "paused", inferred: true }); // no feature list: same clock
    expect(effectiveStatus(null, null, NOW)).toEqual({ status: null, inferred: false });
  });
  it("every feature built: commit within 14 days 維護中, older 已完成", () => {
    const built = { counted: 3, verified: 1, implemented: 2 };
    expect(effectiveStatus(null, ago(14), NOW, built)).toEqual({ status: "maintenance", inferred: true });
    expect(effectiveStatus(null, ago(15), NOW, built)).toEqual({ status: "done", inferred: true });
    expect(effectiveStatus(null, ago(400), NOW, built)).toEqual({ status: "done", inferred: true });
  });
  it("a recorded status_change wins over any activity", () => {
    expect(effectiveStatus("done", ago(1), NOW)).toEqual({ status: "done", inferred: false });
    expect(effectiveStatus("paused", ago(1), NOW)).toEqual({ status: "paused", inferred: false });
  });
});

describe("implementedRatio", () => {
  it("counts implemented and verified over counted features; null when nothing counted", () => {
    expect(implementedRatio({ counted: 4, verified: 1, implemented: 2 })).toBe(0.75);
    expect(implementedRatio({ counted: 0, verified: 0, implemented: 0 })).toBeNull();
  });
});

describe("待確認 does not count 尚未盤點", () => {
  it("a system with 0 features, no blocker and a recent commit is not 待確認; blocked or silent 開發中 is", () => {
    expect(overviewCounts([row({ featureCount: 0 })], NOW).needsAttention).toBe(0);
    expect(overviewCounts([row({ featureCount: 0, blocker: "x" })], NOW).needsAttention).toBe(1);
    expect(overviewCounts([row({ featureCount: 0, lastCommitAt: null })], NOW).needsAttention).toBe(1);
    expect(overviewCounts([row({ status: "maintenance", lastCommitAt: "2026-01-01T00:00:00Z" })], NOW).needsAttention).toBe(0);
  });
});

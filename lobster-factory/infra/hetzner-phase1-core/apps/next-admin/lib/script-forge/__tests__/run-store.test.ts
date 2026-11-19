import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const ensure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/projects", () => ({ PROJECT_COLUMNS: "*", ensureWorkbenchProject: ensure }));
import { reserveScriptRun, finishScriptRun, SCRIPT_STREAM_LIMIT_MS } from "../run-store";
import { signRunQuote } from "../run-quote";
let row: Record<string, any>, writes: number;
const MODEL = "claude-haiku-5-5";
const quoted = (maxTwd: number) => ({ runQuote: signRunQuote({ organizationId: "org", model: MODEL, sceneCount: 6, maxTwd }), model: MODEL, sceneCount: 6 });
let START: ReturnType<typeof quoted>;
beforeEach(() => {
  vi.stubEnv("VW_INTERNAL_TOKEN", "test-only");
  START = quoted(10);
  row = { id: "project-row", organization_id: "org", source: "video_workbench", source_ref: "project-run-one", updated_at: "2026-11-17T00:00:00.000Z", brief_json: {} }; writes = 0;
  ensure.mockReset(); ensure.mockResolvedValue({ ok: true, item: { id: row.id } });
});
const db = { from: () => {
  const filters: Array<[string, unknown]> = []; let patch: Record<string, unknown> | null = null;
  const q = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
    update: (value: Record<string, unknown>) => { patch = value; return q; },
    maybeSingle: async () => { if (!filters.every(([k, v]) => row[k] === v)) return { data: null, error: null }; if (patch) { writes++; Object.assign(row, structuredClone(patch)); } return { data: structuredClone(row), error: null }; },
  }; return q;
} } as unknown as SupabaseClient;
const budget = { runId: "run-one", budgetTwd: 10, spentTwd: 0 };
describe("server script run budget", () => {
  it("concurrent stages reserve one shared balance; browser spent=0 cannot reset it", async () => {
    const results = await Promise.allSettled([reserveScriptRun(db, "org", budget, "script", 7, START), reserveScriptRun(db, "org", budget, "score", 7, START)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(row.brief_json.autoBudget.spentTwd).toBe(7);
    await expect(reserveScriptRun(db, "org", budget, "another", 4, START)).rejects.toThrow("已到上限");
  });
  it("same call is claimed once, then actual usage is saved and a lost response reuses the text", async () => {
    const claim = await reserveScriptRun(db, "org", budget, "script", 7, START);
    if (claim.kind !== "claim") throw Error("expected claim");
    await expect(reserveScriptRun(db, "org", budget, "script", 7, START)).rejects.toThrow("不會重送");
    expect(await finishScriptRun(db, claim, '{"scenes":[]}', 2, true)).toEqual({ spentTwd: 2, estimated: false });
    const before = writes;
    expect(await reserveScriptRun(db, "org", budget, "script", 7, START)).toEqual({ kind: "cached", text: '{"scenes":[]}', spentTwd: 2, estimated: false });
    expect(writes).toBe(before);
    const score = await reserveScriptRun(db, "org", budget, "score", 7, START); expect(score.spentTwd).toBe(9);
  });
  it("unknown billed usage stays reserved and marked uncertain", async () => {
    const claim = await reserveScriptRun(db, "org", budget, "script", 7, START);
    if (claim.kind !== "claim") throw Error("expected claim");
    expect(await finishScriptRun(db, claim, "partial", null, false)).toEqual({ spentTwd: 7, estimated: true });
    await expect(reserveScriptRun(db, "org", budget, "script", 7, START)).rejects.toThrow("已到上限");
  });
  it("a reservation older than the route's stream limit lost its process: cost kept, run estimated, the call may be claimed again", async () => {
    await reserveScriptRun(db, "org", budget, "script", 3, START);
    row.brief_json.autoScriptCalls.script.at = new Date(Date.now() - SCRIPT_STREAM_LIMIT_MS - 31_000).toISOString();
    const again = await reserveScriptRun(db, "org", budget, "script", 3, START);
    expect(again).toMatchObject({ kind: "claim", spentTwd: 6 });
    expect(row.brief_json.autoBudget.estimated).toBe(true);
    await expect(reserveScriptRun(db, "org", budget, "script", 3, START)).rejects.toThrow("不會重送");
  });
  it("an invalid response may retry, with its billed cost retained", async () => {
    const claim = await reserveScriptRun(db, "org", budget, "script", 7, START);
    if (claim.kind !== "claim") throw Error("expected claim");
    await finishScriptRun(db, claim, "invalid JSON", 2, false);
    const retry = await reserveScriptRun(db, "org", budget, "script", 7, START);
    expect(retry.kind).toBe("claim"); expect(retry.spentTwd).toBe(9);
  });
  // N12 (2026-11-19 live: cap NT$9, first script call paid NT$2.01, the score's reservation did not fit, nothing finished).
  it("a cap below the signed whole-trip maximum does not start: no reservation, no project row, no claim to call with", async () => {
    row.source_ref = "project-another-run"; // this run has no row yet: a start
    await expect(reserveScriptRun(db, "org", { runId: "run-one", budgetTwd: 9, spentTwd: 0 }, "script", 2, quoted(37.02))).rejects.toThrow("上限至少要 NT$37.02");
    expect(ensure).not.toHaveBeenCalled(); expect(writes).toBe(0); expect(row.brief_json).toEqual({});
    await expect(reserveScriptRun(db, "org", { runId: "run-one", budgetTwd: 99, spentTwd: 0 }, "script", 2, { runQuote: "forged.sig", model: MODEL, sceneCount: 6 })).rejects.toThrow("沒有開始");
    const oneScene = signRunQuote({ organizationId: "org", model: MODEL, sceneCount: 1, maxTwd: 1 }); // a cheaper plan's genuine quote (oracle F1)
    await expect(reserveScriptRun(db, "org", { runId: "run-one", budgetTwd: 1, spentTwd: 0 }, "script", 0.5, { runQuote: oneScene, model: MODEL, sceneCount: 6 })).rejects.toThrow("沒有開始");
    expect(ensure).not.toHaveBeenCalled();
  });
  it("a cap at or above the signed whole-trip maximum starts as before", async () => {
    row.source_ref = "project-another-run";
    const claim = await reserveScriptRun(db, "org", { runId: "run-one", budgetTwd: 37.02, spentTwd: 0 }, "script", 8.33, quoted(37.02));
    expect(claim).toMatchObject({ kind: "claim", spentTwd: 8.33 }); expect(ensure).toHaveBeenCalledTimes(1);
  });
  it("a run already on its row resumes under its old cap without a quote, exactly as before (resuming is not starting)", async () => {
    row.brief_json = { autoBudget: { runId: "run-one", budgetTwd: 9, spentTwd: 2.01 }, autoScriptCalls: { script: { status: "done", text: '{"scenes":[1]}' } } };
    const resume = { runQuote: undefined, model: MODEL, sceneCount: 6 }, old = { runId: "run-one", budgetTwd: 9, spentTwd: 0 };
    expect(await reserveScriptRun(db, "org", old, "script", 8.33, resume)).toMatchObject({ kind: "cached", text: '{"scenes":[1]}', spentTwd: 2.01 });
    await expect(reserveScriptRun(db, "org", old, "score", 8.33, resume)).rejects.toThrow("已到上限 NT$9，下一次腳本呼叫最多需要 NT$8.33");
    expect(await reserveScriptRun(db, "org", old, "score", 6, resume)).toMatchObject({ kind: "claim", spentTwd: 8.01 });
  });
  it("refuses a project row outside the caller's organization", async () => {
    row.organization_id = "other";
    row.brief_json = { autoBudget: { runId: budget.runId, spentTwd: 1 }, autoScriptCalls: { script: { status: "done", text: "private script" } } };
    await expect(reserveScriptRun(db, "org", budget, "script", 7, START)).rejects.toThrow("無法讀取執行預算");
  });
});

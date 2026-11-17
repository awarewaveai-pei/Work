import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const ensure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/projects", () => ({ PROJECT_COLUMNS: "*", ensureWorkbenchProject: ensure }));
import { reserveScriptRun, finishScriptRun } from "../run-store";
let row: Record<string, any>, writes: number;
beforeEach(() => {
  row = { id: "project-row", organization_id: "org", updated_at: "2026-11-17T00:00:00.000Z", brief_json: {} }; writes = 0;
  ensure.mockResolvedValue({ ok: true, item: { id: row.id } });
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
    const results = await Promise.allSettled([reserveScriptRun(db, "org", budget, "script", 7), reserveScriptRun(db, "org", budget, "score", 7)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(row.brief_json.autoBudget.spentTwd).toBe(7);
    await expect(reserveScriptRun(db, "org", budget, "another", 4)).rejects.toThrow("已到上限");
  });
  it("same call is claimed once, then actual usage is saved and a lost response reuses the text", async () => {
    const claim = await reserveScriptRun(db, "org", budget, "script", 7);
    if (claim.kind !== "claim") throw Error("expected claim");
    await expect(reserveScriptRun(db, "org", budget, "script", 7)).rejects.toThrow("不會重送");
    expect(await finishScriptRun(db, claim, '{"scenes":[]}', 2, true)).toEqual({ spentTwd: 2, estimated: false });
    const before = writes;
    expect(await reserveScriptRun(db, "org", budget, "script", 7)).toEqual({ kind: "cached", text: '{"scenes":[]}', spentTwd: 2, estimated: false });
    expect(writes).toBe(before);
    const score = await reserveScriptRun(db, "org", budget, "score", 7); expect(score.spentTwd).toBe(9);
  });
  it("unknown billed usage stays reserved and marked uncertain", async () => {
    const claim = await reserveScriptRun(db, "org", budget, "script", 7);
    if (claim.kind !== "claim") throw Error("expected claim");
    expect(await finishScriptRun(db, claim, "partial", null, false)).toEqual({ spentTwd: 7, estimated: true });
    await expect(reserveScriptRun(db, "org", budget, "script", 7)).rejects.toThrow("已到上限");
  });
  it("an invalid response may retry, with its billed cost retained", async () => {
    const claim = await reserveScriptRun(db, "org", budget, "script", 7);
    if (claim.kind !== "claim") throw Error("expected claim");
    await finishScriptRun(db, claim, "invalid JSON", 2, false);
    const retry = await reserveScriptRun(db, "org", budget, "script", 7);
    expect(retry.kind).toBe("claim"); expect(retry.spentTwd).toBe(9);
  });
  it("refuses a project row outside the caller's organization", async () => {
    row.organization_id = "other";
    row.brief_json = { autoBudget: { runId: budget.runId, spentTwd: 1 }, autoScriptCalls: { script: { status: "done", text: "private script" } } };
    await expect(reserveScriptRun(db, "org", budget, "script", 7)).rejects.toThrow("無法讀取執行預算");
  });
});

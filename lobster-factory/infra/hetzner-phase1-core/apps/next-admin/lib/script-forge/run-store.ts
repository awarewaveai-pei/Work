import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureWorkbenchProject, PROJECT_COLUMNS } from "@/lib/content/video/projects";
import type { AutoBudget } from "@/lib/content/video/auto-run-budget";

type Row = Record<string, any>;
type Claim = { kind: "claim"; projectId: string; org: string; runId: string; key: string; token: string; reserved: number; spentTwd: number };
type Cached = { kind: "cached"; text: string; spentTwd: number; estimated: boolean };
const fail = (status: number, message: string): never => { throw Object.assign(Error(message), { status }); };
// The route's declared stream limit (script-forge route maxDuration). An older reservation lost its process (restart, crash):
// its usage is unknown, so the reserved cost stays and the run is marked estimated. Should a stream still outlive this, its
// receipt is refused (token changed) and the cost already counted stays, so spentTwd remains an upper bound.
const STALE_RESERVATION_MS = 120_000;
const read = async (db: SupabaseClient, org: string, id: string): Promise<Row> => {
  const r = await db.from("media_production_projects").select(PROJECT_COLUMNS).eq("organization_id", org).eq("id", id).maybeSingle();
  if (r.error || !r.data) return fail(503, "無法讀取執行預算"); return r.data;
};
// updated_at is a compare-and-set: concurrent script/score requests reserve against one shared server balance.
const write = async (db: SupabaseClient, row: Row, org: string, brief: Row) => {
  const at = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1 || 0)).toISOString();
  const r = await db.from("media_production_projects").update({ brief_json: brief, updated_at: at })
    .eq("organization_id", org).eq("id", row.id).eq("updated_at", row.updated_at).select("id").maybeSingle();
  if (r.error) fail(503, "無法保留執行預算"); return !!r.data;
};
export async function reserveScriptRun(db: SupabaseClient, org: string, budget: AutoBudget, key: string, reserved: number): Promise<Claim | Cached> {
  if (!Number.isFinite(reserved) || reserved < 0) return fail(503, "腳本報價無效");
  const ensured = await ensureWorkbenchProject(db, org, "project-" + budget.runId, "一鍵腳本", { production_mode: "quick_video" }, { retitle: false });
  if (!ensured.ok) return fail(503, "無法建立執行預算");
  const projectId = String(ensured.item.id);
  for (let n = 0; n < 8; n++) {
    const row = await read(db, org, projectId), brief = row.brief_json || {}, previous = brief.autoBudget,
      spent = previous?.runId === budget.runId ? Number(previous.spentTwd) : 0, call = brief.autoScriptCalls?.[key],
      stale = call?.status === "reserved" && !(Date.now() - Date.parse(call.at) < STALE_RESERVATION_MS);
    if (previous?.runId && previous.runId !== budget.runId) return fail(409, "這個專案已有另一趟執行，請重新開始");
    if (!Number.isFinite(spent) || spent < 0) return fail(503, "執行預算紀錄無效");
    if (call?.status === "done") {
      if (typeof call.text !== "string") return fail(503, "腳本回執尚未完整");
      return { kind: "cached", text: call.text, spentTwd: spent, estimated: previous?.estimated === true || call.estimated === true || Object.values(brief.autoScriptCalls || {}).some((c: any) => c.status === "reserved") };
    }
    if (call?.status === "reserved" && !stale) return fail(409, "這一步已送出，仍在處理或確認用量；不會重送計費");
    if (spent + reserved > budget.budgetTwd + 1e-9) return fail(409, `已到上限 NT$${budget.budgetTwd}，下一次腳本呼叫最多需要 NT$${reserved}`);
    const token = randomUUID(), spentTwd = Math.round((spent + reserved) * 100) / 100;
    const next = { ...brief, autoBudget: { ...previous, runId: budget.runId, budgetTwd: budget.budgetTwd, spentTwd, startedAt: previous?.startedAt || new Date().toISOString(), ...(stale ? { estimated: true } : {}) },
      autoScriptCalls: { ...brief.autoScriptCalls, [key]: { status: "reserved", token, reserved, at: new Date().toISOString() } } };
    if (await write(db, row, org, next)) return { kind: "claim", projectId, org, runId: budget.runId, key, token, reserved, spentTwd };
  }
  return fail(409, "執行預算同時更新，請稍後再試");
}
export async function finishScriptRun(db: SupabaseClient, claim: Claim, text: string, actualTwd: number | null, successful: boolean): Promise<{ spentTwd: number; estimated: boolean }> {
  for (let n = 0; n < 8; n++) {
    const row = await read(db, claim.org, claim.projectId), brief = row.brief_json || {}, call = brief.autoScriptCalls?.[claim.key];
    if (brief.autoBudget?.runId !== claim.runId) return fail(409, "這趟執行預算已變更，請先確認用量");
    if (call?.token !== claim.token || call.status !== "reserved") return fail(409, "執行預算回執已變更");
    const estimated = actualTwd === null, cost = estimated ? claim.reserved : actualTwd;
    if (!Number.isFinite(cost) || cost! < 0) return fail(503, "腳本用量無效");
    const spentTwd = Math.round((Number(brief.autoBudget.spentTwd) - claim.reserved + cost!) * 100) / 100;
    const uncertain = brief.autoBudget.estimated === true || estimated;
    const next = { ...brief, autoBudget: { ...brief.autoBudget, spentTwd, estimated: uncertain }, autoScriptCalls: { ...brief.autoScriptCalls,
      [claim.key]: { ...call, status: successful ? "done" : "failed", ...(successful ? { text } : {}), estimated } } };
    if (await write(db, row, claim.org, next)) return { spentTwd, estimated: uncertain || Object.values(next.autoScriptCalls).some((c: any) => c.status === "reserved") };
  }
  return fail(409, "用量回執同時更新，已保留額度，請稍後確認");
}

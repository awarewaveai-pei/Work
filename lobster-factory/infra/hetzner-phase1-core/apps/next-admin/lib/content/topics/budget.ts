// A topic's spending cap (N2, plan O6: NT$15 a topic). What a topic spent is ai_call_logs' cost for job_id = the topic id
// since its budget began (every paid call make.ts makes carries that job id) -- the ledger, not a counter on the row, so a
// restart mid-step loses nothing. Before each paid step the step's most it can cost is checked against the cap; one that
// does not fit stops the topic there (failed, last_error names the cap and the step); what was spent stays spent.
// artifacts.budget keeps when the budget began, its cap and the spend recorded by the drafts step (reservations of calls
// that succeeded, exact social costs). Across attempts the ledger is the truth: a failed attempt keeps none of its own
// record (make.ts makeDrafts; a refusal paid nothing, a billed call wrote its own row), and the video step keeps nothing on
// the row.
// Known gap, accepted: logAiCall is best-effort (log-ai-call.ts), so a billed call whose row was lost AND whose step then
// failed is not counted on retry -- at most one step's cost (Codex 2026-11-19 r2/r3; the opposite choice blocked retries
// of topics that never paid).
import type { SupabaseClient } from "@supabase/supabase-js";
import { featureUnitCostUsd, usdToNtd } from "@/lib/ai/cost-calculator";
import { DEFAULT_IMAGE_MODEL, IMAGE_RATES, TEXT_FEATURES } from "@/lib/ai/cost-model";
import { draftCallUpperTwd } from "@/lib/content/video/auto-run-budget";
import { articleVideoCostUsd } from "@/lib/content/video/defaults";
import { articleModelUsd, type TopicTextRoad } from "./cost";

/** The cap when the content_pipeline row sets none (0168 per_topic_cap_twd null). */
export const DEFAULT_TOPIC_CAP_TWD = 15;

export interface TopicBudget { budgetTwd: number; spentTwd: number; startedAt: string }

/** Where a topic with no stored budget counts from: the N2 switch-over, a fixed moment, not "now" -- so a topic made
 *  before N2 counts only what it spends from then on, and a budget that never reached the row (the video step does
 *  not write the row; a restart mid-step) still counts every call its retry finds in the ledger. */
export const TOPIC_BUDGET_EPOCH = "2026-11-19T12:00:00.000Z";

/** The topic's budget: the stored one (begun by an earlier step), else one counting from TOPIC_BUDGET_EPOCH. The cap is
 *  the stored one or the brand's current one, whichever is higher: lowering the setting never stops a topic already
 *  under way, raising it lets a stopped one continue on retry. */
export function topicBudget(stored: unknown, capTwd: number): TopicBudget {
  const s = stored as Partial<TopicBudget> | null | undefined;
  const kept = typeof s?.startedAt === "string" && Number.isFinite(Date.parse(s.startedAt));
  const storedCap = Number(s?.budgetTwd);
  const spent = Number(s?.spentTwd);
  return {
    budgetTwd: kept && Number.isFinite(storedCap) && storedCap > 0 ? Math.max(storedCap, capTwd) : capTwd,
    spentTwd: kept && Number.isFinite(spent) && spent >= 0 ? spent : 0,
    startedAt: kept ? (s!.startedAt as string) : TOPIC_BUDGET_EPOCH,
  };
}

/** What the topic spent since its budget began, in NT$, read from ai_call_logs. Paged to the end like lib/ai/spend-loader.ts
 *  (PostgREST caps one response at its max rows, silently). A failed read throws: a cap that cannot be checked does not
 *  let the next paid call through. */
export async function spentSince(sb: SupabaseClient, topicId: string, startedAt: string): Promise<number> {
  let usd = 0;
  for (let from = 0; ; ) {
    const { data, error } = await sb.from("ai_call_logs").select("cost_usd").eq("job_id", topicId).gte("created_at", startedAt)
      .order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`讀不到這一題的花費（ai_call_logs）：${error.message}`);
    const page = (data ?? []) as Array<{ cost_usd: number | string | null }>;
    if (!page.length) return usdToNtd(usd);
    usd += page.reduce((n, r) => n + (Number(r.cost_usd) || 0), 0);
    from += page.length;   // advance by what came back: a server cap below 1000 must not end the read early
  }
}

export class TopicCapReached extends Error {}

const cents = (n: number) => Math.round(n * 100) / 100;

/** The topic's spending checked before a paid step costing at most `upperTwd`, then that most reserved. Spent = the
 *  ledger, or what this budget recorded (earlier reservations included), whichever is more: ledger rows are written in
 *  the background after each call, so a call's reservation keeps counting until its row is there. */
export async function reserveStep(budget: TopicBudget, upperTwd: number, step: string, readSpent: () => Promise<number>): Promise<TopicBudget> {
  const spentTwd = Math.max(budget.spentTwd, await readSpent());
  if (spentTwd + upperTwd > budget.budgetTwd + 1e-9) {
    throw new TopicCapReached(`這一題花到上限 NT$${budget.budgetTwd}，停在〈${step}〉（已花 NT$${spentTwd}，這一步最多要 NT$${upperTwd}）`);
  }
  return { ...budget, spentTwd: cents(spentTwd + upperTwd) };
}

/** A reserved call's exact cost, once the caller knows it (the social writer counts its own): it replaces the reservation. */
export const settleStep = (budget: TopicBudget, reservedTwd: number, actualTwd: number): TopicBudget =>
  ({ ...budget, spentTwd: cents(Math.max(0, budget.spentTwd - reservedTwd + actualTwd)) });

const twd = (usd: number) => Math.ceil(usd * usdToNtd(1) * 100) / 100;
function feature(key: string): number {
  const f = TEXT_FEATURES.find((x) => x.key === key);
  if (!f) throw new Error(`cost-model has no ${key} feature`);
  return featureUnitCostUsd(f);
}

/** What each paid step of a topic is reserved at, NT$. The article and the video are reserved at the cost model's
 *  estimate (the article feature plus each image; the article page's default video), NOT their hard ceilings: priced
 *  from max tokens with thinking headroom, the article alone is ~NT$15.2 and the video script ~NT$9.3 (2026-11-19), so
 *  ceilings would stop every topic under the NT$15 default (plan O6). A step may therefore end above the cap by at most
 *  its ceiling minus its estimate; the next step then stops. A social writer call is reserved at its ceiling
 *  (auto-run-budget draftCallUpperTwd, ~NT$0.07) and settled to its exact cost. */
export const stepUpperTwd = {
  // K7: on the site's API model (a subscription road reserves its API fallback, the most it can cost); no road = as before
  article: (images: number, road?: TopicTextRoad) => twd(feature("article") + (road ? articleModelUsd(road) - articleModelUsd() : 0)
    + images * (IMAGE_RATES[DEFAULT_IMAGE_MODEL]?.usd ?? 0)),
  video: () => twd(articleVideoCostUsd()),
  socialCall: (prompt: string) => draftCallUpperTwd(prompt),
};

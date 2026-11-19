// N3: what a topic really costs, from the ledger. The median of the last 30 days' finished topics (reviewed / scheduled / published)
// of one organization, each topic's spend = sum(ai_call_logs.cost_usd) where job_id = the topic id (budget.ts spentSince
// reads one topic the same way). Only topics that started after the N2 ledger began count (started_on is a brand-day
// date, so the first whole day after TOPIC_BUDGET_EPOCH's UTC day), and only topics with at least one ledger row: an
// older topic's spend is incomplete and would pull the median down. Server-only; cost.ts keeps the browser-safe half.
// Grouped by the topic's formats (an article-only topic and one with a video do not share a median), "finished" = made and
// waiting for its publish day too (scheduled). A failed read returns {} -- the page falls back to the price list and is
// never blocked by this number.
import type { SupabaseClient } from "@supabase/supabase-js";
import { usdToNtd } from "@/lib/ai/cost-calculator";
import { TOPIC_BUDGET_EPOCH } from "./budget";
import { ACTUAL_MIN_TOPICS, ACTUAL_WINDOW_DAYS, formatsKey, type TopicActual } from "./cost";

const DAY_MS = 86_400_000;
const ID_CHUNK = 100;     // job_id list per ai_call_logs query (URL length)

export function medianOf(nums: readonly number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The first brand day whose topics all started after the ledger began (a day later than the epoch's UTC day). */
export const ACTUAL_FIRST_DAY = new Date(Date.parse(TOPIC_BUDGET_EPOCH) + DAY_MS).toISOString().slice(0, 10);

export async function recentTopicActual(sb: SupabaseClient, organizationId: string, now = new Date()): Promise<Record<string, TopicActual>> {
  try {
    const sinceDay = new Date(now.getTime() - ACTUAL_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
    const from = sinceDay > ACTUAL_FIRST_DAY ? sinceDay : ACTUAL_FIRST_DAY;
    // every finished topic of the window, paged: a cap would hide a formats combination that has its own 5 topics
    const topics: Array<{ id: string; formats: string[] | null }> = [];
    for (let at = 0; ; ) {
      const t = await sb.from("content_topics").select("id, formats").eq("organization_id", organizationId).in("status", ["reviewed", "scheduled", "published"])
        .gte("started_on", from).order("id", { ascending: true }).range(at, at + 999);
      if (t.error) return {};
      const page = (t.data ?? []) as typeof topics;
      if (!page.length) break;
      topics.push(...page);
      at += page.length;
    }
    const ids = topics.map((r) => r.id);
    if (ids.length < ACTUAL_MIN_TOPICS) return {};

    const usd = new Map<string, number>();
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const chunk = ids.slice(i, i + ID_CHUNK);
      for (let page = 0; ; ) {
        const r = await sb.from("ai_call_logs").select("job_id, cost_usd").in("job_id", chunk).gte("created_at", TOPIC_BUDGET_EPOCH)
          .order("id", { ascending: true }).range(page, page + 999);
        if (r.error) return {};
        const rows = (r.data ?? []) as Array<{ job_id: string | null; cost_usd: number | string | null }>;
        if (!rows.length) break;
        for (const row of rows) if (row.job_id) usd.set(row.job_id, (usd.get(row.job_id) ?? 0) + (Number(row.cost_usd) || 0));
        page += rows.length;   // advance by what came back: a server cap below 1000 must not end the read early
      }
    }
    const groups = new Map<string, number[]>();
    for (const tp of topics) {
      const v = usd.get(tp.id) ?? 0;
      if (v > 0 && tp.formats?.length) groups.set(formatsKey(tp.formats), [...(groups.get(formatsKey(tp.formats)) ?? []), v]);
    }
    const out: Record<string, TopicActual> = {};
    for (const [key, spent] of groups) if (spent.length >= ACTUAL_MIN_TOPICS) out[key] = { twd: usdToNtd(medianOf(spent)), n: spent.length };
    return out;
  } catch {
    return {};
  }
}

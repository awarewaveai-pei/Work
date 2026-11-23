/**
 * 訂閱用量 for /ops/costs: pictures counted from the ledger (ai_call_logs model "codex-image", cost 0), subscription text
 * (vendor 訂閱, model sub-codex-* (+ the pre-picker sub-codex) / sub-claude-*), the plan allowance as the worker last read it from Codex (metadata codex_*
 * written by lib/tarot/codex-bridge.ts), and a per-site month table of articles made on 訂閱 vs API.
 * A read that fails is null, never 0.
 */
import { TWD_RATE } from "./cost-model";
import { isSubTextModel, LEGACY_SUB_CODEX_ID, SUB_CODEX_LEDGER_IDS } from "./text-model-options";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CODEX_IMAGE_MODEL = "codex-image";

export interface CodexImageUsage {
  /** The newest picture's reading of the plan allowance; null = no picture yet, or the read failed. */
  latest: { at: string; pct5h: number | null; resets5h: number | null; pctWeek: number | null; resetsWeek: number | null } | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// ---- 訂閱 text + both tools (K8) ----

export const SUB_VENDOR = "訂閱";
export const ARTICLE_ROUTE = "content/article-generate";

export interface SubscriptionUsage {
  images: { last24h: number | null; last7d: number | null };
  /** Subscription text (vendor 訂閱) by the CLI that answered: sub-codex-* (and the legacy sub-codex) vs sub-claude-*. */
  textCodex: { last24h: number | null; last7d: number | null };
  textClaude: { last24h: number | null; last7d: number | null };
  /** Newest Codex reading of the plan allowance (a picture or a text job); Claude reports no percentage. null = none yet / read failed. */
  latest: CodexImageUsage["latest"];
}

type Filter = (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
async function countRows(db: SupabaseClient, since: Date, narrow: Filter): Promise<number | null> {
  try {
    const { count, error } = await narrow(db.from("ai_call_logs").select("id", { count: "exact", head: true })).gte("created_at", since.toISOString());
    return error || count === null ? null : count;
  } catch {
    return null;
  }
}

export async function loadSubscriptionUsage(db: SupabaseClient, now: Date): Promise<SubscriptionUsage> {
  const d1 = new Date(now.getTime() - 24 * 3600_000);
  const d7 = new Date(now.getTime() - 7 * 24 * 3600_000);
  const pair = (narrow: Filter) => Promise.all([countRows(db, d1, narrow), countRows(db, d7, narrow)]).then(([last24h, last7d]) => ({ last24h, last7d }));
  const [images, textCodex, textClaude, latest] = await Promise.all([
    pair((q) => q.eq("model", CODEX_IMAGE_MODEL)),
    pair((q) => q.eq("vendor", SUB_VENDOR).in("model", SUB_CODEX_LEDGER_IDS)),
    pair((q) => q.eq("vendor", SUB_VENDOR).like("model", "sub-claude-%")),
    (async () => {
      try {
        const { data, error } = await db.from("ai_call_logs").select("created_at, metadata").in("model", [CODEX_IMAGE_MODEL, ...SUB_CODEX_LEDGER_IDS])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (error) return null;
        const row = data as { created_at: string; metadata: Record<string, unknown> | null } | null;
        if (!row) return null;
        const m = row.metadata ?? {};
        return { at: row.created_at, pct5h: num(m.codex_5h_used_pct), resets5h: num(m.codex_5h_resets_at), pctWeek: num(m.codex_week_used_pct), resetsWeek: num(m.codex_week_resets_at) };
      } catch {
        return null;
      }
    })(),
  ]);
  return { images, textCodex, textClaude, latest };
}

export interface SiteMonthRow { siteId: string | null; name: string; sub: number; api: number; apiTwd: number }
export interface ArticleLogRow { model: string; cost_usd: number | string; job_id: string | null }

/** One row per site (topic id -> site); articles whose topic has no known site land in 未指定. Pure: no reads. */
export function buildSiteMonth(rows: ArticleLogRow[], siteOfTopic: ReadonlyMap<string, string>, siteName: ReadonlyMap<string, string>): SiteMonthRow[] {
  const by = new Map<string, SiteMonthRow>();
  for (const r of rows) {
    const siteId = (r.job_id && siteOfTopic.get(r.job_id)) || null;
    const key = siteId ?? "";
    let row = by.get(key);
    if (!row) { row = { siteId, name: siteId ? (siteName.get(siteId) ?? siteId) : "未指定", sub: 0, api: 0, apiTwd: 0 }; by.set(key, row); }
    if (isSubTextModel(r.model) || r.model === LEGACY_SUB_CODEX_ID) row.sub += 1;
    else { row.api += 1; row.apiTwd += Number(r.cost_usd) * TWD_RATE; }
  }
  return [...by.values()].sort((a, b) => (a.siteId === null ? 1 : 0) - (b.siteId === null ? 1 : 0) || b.sub + b.api - (a.sub + a.api));
}

const CHUNK = 150;
async function inChunks<T>(ids: string[], fetch: (part: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await fetch(ids.slice(i, i + CHUNK));
    if (error) return null;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** This Taipei month's articles per site. null = any read failed (shown as 讀不到, never as 0). */
export async function loadSiteMonth(db: SupabaseClient, monthStartIso: string): Promise<SiteMonthRow[] | null> {
  try {
    const { data, error } = await db.from("ai_call_logs").select("model, cost_usd, job_id").eq("route", ARTICLE_ROUTE).gte("created_at", monthStartIso).limit(5000);
    if (error) return null;
    const rows = (data ?? []) as ArticleLogRow[];
    const topicIds = [...new Set(rows.map((r) => r.job_id).filter((x): x is string => !!x))];
    const topics = await inChunks<{ id: string; site_id: string | null }>(topicIds, (part) => db.from("content_topics").select("id, site_id").in("id", part));
    if (!topics) return null;
    const siteOfTopic = new Map(topics.filter((t) => t.site_id).map((t) => [t.id, t.site_id as string]));
    const siteIds = [...new Set(siteOfTopic.values())];
    const sites = await inChunks<{ id: string; name: string | null }>(siteIds, (part) => db.from("wp_sites").select("id, name").in("id", part));
    if (!sites) return null;
    return buildSiteMonth(rows, siteOfTopic, new Map(sites.map((s) => [s.id, s.name ?? s.id])));
  } catch {
    return null;
  }
}

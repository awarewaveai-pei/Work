// Trending items are kept (migration 0121 content_trends): one row per item per UTC day, so the monthly topic plan
// (plan.ts) can read what was hot over the last 30 days. Public data, no tenant. A write failure never breaks the
// trending answer the article tool is waiting for; it is logged and the next fetch tries again.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrendingItem } from "@/lib/content/trending-sources";
import { isTrendingGeo } from "@/lib/content/geos";

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** The day key of an item: same geo, source and title (ignoring case and spacing) = same item. */
export function trendHash(geo: string, source: string, title: string): string {
  return createHash("sha256").update(`${geo}|${norm(source)}|${norm(title)}`).digest("hex");
}

export interface TrendRow {
  geo: string;
  source: string;
  title: string;
  traffic: string | null;
  category: string | null;
  related_queries: string[];
  hash: string;
}

/** Rows to store for one fetch: valid geo only, titles present, one row per hash, fields cut to the column limits. */
export function trendRows(geoRaw: string, items: TrendingItem[]): TrendRow[] {
  const geo = geoRaw.trim().toUpperCase();
  if (!isTrendingGeo(geo)) return [];   // ?geo= comes from the caller: only supported regions reach the cache every tenant reads
  const seen = new Set<string>();
  const rows: TrendRow[] = [];
  for (const it of items) {
    const title = (it.title ?? "").trim().slice(0, 500);
    const source = (it.source || it.category || "unknown").trim().slice(0, 120) || "unknown";
    if (!title) continue;
    const hash = trendHash(geo, source, title);
    if (seen.has(hash)) continue;
    seen.add(hash);
    rows.push({
      geo, source, title, hash,
      traffic: it.traffic ? String(it.traffic).slice(0, 60) : null,
      category: it.category ? it.category.slice(0, 120) : null,
      related_queries: (it.relatedQueries ?? []).filter((q) => typeof q === "string").slice(0, 20),
    });
  }
  return rows;
}

export const TREND_KEEP_DAYS = 90;
const day = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);

/** Stores a fetch (an item already stored today is left alone) and drops this geo's rows older than TREND_KEEP_DAYS,
 *  so the cache never grows past what the plan can read. Returns how many rows were sent. */
export async function saveTrends(sb: SupabaseClient, geo: string, items: TrendingItem[]): Promise<number> {
  const g = geo.trim().toUpperCase();
  if (!isTrendingGeo(g)) return 0;
  const rows = trendRows(g, items);
  if (rows.length) {
    const { error } = await sb.from("content_trends").upsert(rows, { onConflict: "hash,fetched_on", ignoreDuplicates: true });
    if (error) throw new Error(`content_trends:save:${error.message}`);
  }
  // pruned on every fetch of a supported geo, including one that stored nothing
  const old = await sb.from("content_trends").delete().eq("geo", g).lt("fetched_on", day(TREND_KEEP_DAYS * 86_400_000));
  if (old.error) throw new Error(`content_trends:prune:${old.error.message}`);
  return rows.length;
}

/** Titles hot in this geo over the last `days` UTC days, most days first (0121 content_trends_top). */
export async function recentTrends(sb: SupabaseClient, geo: string, days: number, limit = 50): Promise<Array<{ title: string; source: string; days: number; last_seen: string }>> {
  const { data, error } = await sb.rpc("content_trends_top", { p_geo: geo.trim().toUpperCase(), p_since: day(days * 86_400_000), p_limit: limit });
  if (error) throw new Error(`content_trends:recent:${error.message}`);
  return ((data ?? []) as Array<{ title: string; source: string; days: number | string; last_seen: string }>).map((r) => ({ ...r, days: Number(r.days) }));
}

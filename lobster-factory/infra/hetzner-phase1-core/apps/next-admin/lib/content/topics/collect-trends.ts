// Trending items reach content_trends once per geo per UTC day from the content_pipeline schedule (handoff
// 2026-10-26-autocontent-gap B5): recentTrends ranks by days seen, so a daily row is what makes it meaningful.
// The guard is the row already stored today, not a new state; sources are public and region-level, never per tenant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDbSearchBlocks, runTrending, type TrendingItem } from "@/lib/content/trending-sources";
import { saveTrends } from "./trends";

/** Operator-managed sources (0042), read on every collect: a change in the UI applies at the next collect (the next UTC
 *  day, or a staff refresh, app/api/content/trending POST refresh=1). A collect only adds rows, so a deleted source's
 *  rows already stored today stay until tomorrow. A DB miss = built-ins only. */
async function dbSourceBlocks(sb: SupabaseClient) {
  try {
    const { data, error } = await sb.from("content_sources").select("id, label, url, geos, enabled").eq("enabled", true);
    if (error || !data) return [];
    return buildDbSearchBlocks(data as Array<{ id: string; label: string; url: string; geos: string[] | "*" | null; enabled: boolean }>);
  } catch {
    return [];
  }
}

/** Runs every source for `geo` and stores what came back; a failed store is logged, never thrown (saved = 0). */
export async function collectTrends(sb: SupabaseClient, geo: string): Promise<{ items: TrendingItem[]; saved: number }> {
  const items = await runTrending(geo, await dbSourceBlocks(sb));
  const saved = await saveTrends(sb, geo, items).catch((e) => {
    console.warn("[trending] trends not saved:", String(e).slice(0, 200));
    return 0;
  });
  return { items, saved };
}

const utcToday = () => new Date().toISOString().slice(0, 10);

/** The geo's rows stored today (UTC), in the shape runTrending returns; a failed read is [] (the caller then collects). */
export async function todaysTrends(sb: SupabaseClient, geo: string): Promise<TrendingItem[]> {
  // One collect is one insert (same created_at): source then title keeps the list stable between requests.
  const { data, error } = await sb.from("content_trends").select("title, source, traffic, category, related_queries")
    .eq("geo", geo).eq("fetched_on", utcToday()).order("created_at").order("source").order("title").limit(200);
  if (error || !data) return [];
  return (data as Array<{ title: string; source: string; traffic: string | null; category: string | null; related_queries: string[] | null }>)
    .map((r) => ({ title: r.title, source: r.source, traffic: r.traffic ?? "", category: r.category ?? "", relatedQueries: r.related_queries ?? [] }));
}

/** Collects each geo that has no content_trends row for today (UTC); returns the geos it collected. A failed read throws. */
/** Geos fetched at once. A global site names all seven and every geo hits the same hosts (Reddit worldnews, Google):
 *  all at once invites a 429 that the day's guard would never retry; one at a time is 7 x 8 s of the 300 s firing. */
export const COLLECT_CONCURRENCY = 3;

export async function collectTrendsIfDue(sb: SupabaseClient, geos: string[]): Promise<string[]> {
  const today = utcToday();
  const all = [...new Set(geos)];
  const done: string[] = [];
  for (let i = 0; i < all.length; i += COLLECT_CONCURRENCY) {
    const batch = await Promise.all(all.slice(i, i + COLLECT_CONCURRENCY).map(async (geo) => {
      const { data, error } = await sb.from("content_trends").select("id").eq("geo", geo).eq("fetched_on", today).limit(1);
      if (error) throw new Error(`content_trends:due:${error.message}`);
      if (data && data.length) return null;
      await collectTrends(sb, geo);
      return geo;
    }));
    done.push(...batch.filter((g): g is string => g !== null));
  }
  return done;
}

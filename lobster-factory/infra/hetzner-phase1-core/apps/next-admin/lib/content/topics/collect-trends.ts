// Trending items reach content_trends once per geo per UTC day from the content_pipeline schedule (handoff
// 2026-10-26-autocontent-gap B5): recentTrends ranks by days seen, so a daily row is what makes it meaningful.
// The guard is the row already stored today, not a new state; sources are public and region-level, never per tenant.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDbSearchBlocks, runTrending, type TrendingItem } from "@/lib/content/trending-sources";
import { saveTrends } from "./trends";

/** Operator-managed sources (0042), built per call so a deletion in the UI applies at once; a DB miss = built-ins only. */
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

/** Collects each geo that has no content_trends row for today (UTC); returns the geos it collected. A failed read throws. */
export async function collectTrendsIfDue(sb: SupabaseClient, geos: string[]): Promise<string[]> {
  const done: string[] = [];
  for (const geo of [...new Set(geos)]) {
    const { data, error } = await sb.from("content_trends").select("id").eq("geo", geo).eq("fetched_on", utcToday()).limit(1);
    if (error) throw new Error(`content_trends:due:${error.message}`);
    if (data && data.length) continue;
    await collectTrends(sb, geo);
    done.push(geo);
  }
  return done;
}

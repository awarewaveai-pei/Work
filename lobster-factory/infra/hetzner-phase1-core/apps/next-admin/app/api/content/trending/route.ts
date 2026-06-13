import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Google Trends daily trending feed (RSS, no auth) ───────────────────────

interface TrendingItem {
  title: string;
  traffic: string;
  category: string;
  relatedQueries: string[];
}

async function fetchGoogleTrends(geo: string): Promise<TrendingItem[]> {
  try {
    const url = `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentStudio/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const items: TrendingItem[] = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const [, itemXml] of itemMatches) {
      const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
        ?? itemXml.match(/<title>(.*?)<\/title>/)?.[1]
        ?? "";
      if (!title) continue;

      const traffic = itemXml.match(/<ht:approx_traffic>(.*?)<\/ht:approx_traffic>/)?.[1] ?? "";
      const category = itemXml.match(/<ht:news_item_snippet><!\[CDATA\[(.*?)\]\]>/)?.[1]?.slice(0, 80) ?? "";

      const relatedMatches = [...itemXml.matchAll(/<ht:related_query><!\[CDATA\[(.*?)\]\]>/g)];
      const relatedQueries = relatedMatches.map(m => m[1]).slice(0, 5);

      items.push({ title, traffic, category, relatedQueries });
      if (items.length >= 20) break;
    }
    return items;
  } catch { return []; }
}

// ─── Google Autocomplete suggestions (no auth) ───────────────────────────────

async function fetchGoogleSuggest(query: string, hl: string): Promise<string[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({ q: query.trim(), hl, client: "firefox" });
    const url = `https://suggestqueries.google.com/complete/search?${params}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentStudio/1.0)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json() as [string, string[]];
    return (data[1] ?? []).slice(0, 10);
  } catch { return []; }
}

// ─── People Also Ask style — related questions via Autocomplete heuristics ───

async function fetchRelatedQuestions(keyword: string, hl: string): Promise<string[]> {
  const QUESTION_PREFIXES_ZH = ["如何", "什麼是", "為什麼", "怎麼", "哪裡", "多少", "何時"];
  const QUESTION_PREFIXES_EN = ["how to", "what is", "why", "where", "how much", "when", "best"];
  const prefixes = hl.startsWith("zh") ? QUESTION_PREFIXES_ZH : QUESTION_PREFIXES_EN;

  const allResults: string[] = [];
  await Promise.all(
    prefixes.slice(0, 4).map(async p => {
      const suggestions = await fetchGoogleSuggest(`${p} ${keyword}`, hl);
      allResults.push(...suggestions.filter(s => s.toLowerCase() !== keyword.toLowerCase()));
    })
  );
  // Deduplicate and limit
  return [...new Set(allResults)].slice(0, 15);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url = new URL(req.url);
  const type     = url.searchParams.get("type") ?? "trending"; // "trending" | "suggest" | "questions"
  const geo      = url.searchParams.get("geo") ?? "TW";
  const query    = url.searchParams.get("q") ?? "";
  const hl       = url.searchParams.get("hl") ?? (geo === "TW" || geo === "HK" ? "zh-TW" : "en");

  if (type === "trending") {
    const items = await fetchGoogleTrends(geo);
    return NextResponse.json({ ok: true, items, geo });
  }

  if (type === "suggest") {
    if (!query) return NextResponse.json({ ok: false, error: "q required" }, { status: 400 });
    const suggestions = await fetchGoogleSuggest(query, hl);
    return NextResponse.json({ ok: true, suggestions, query, hl });
  }

  if (type === "questions") {
    if (!query) return NextResponse.json({ ok: false, error: "q required" }, { status: 400 });
    const questions = await fetchRelatedQuestions(query, hl);
    return NextResponse.json({ ok: true, questions, query, hl });
  }

  return NextResponse.json({ ok: false, error: "invalid type" }, { status: 400 });
}

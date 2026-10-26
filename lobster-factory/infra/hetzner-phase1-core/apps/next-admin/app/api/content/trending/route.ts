import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { runTrending, aiChat, parseJsonStrings } from "@/lib/content/trending-sources";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { withFeature } from "@/lib/entitlements/grant";
import { collectTrends } from "@/lib/content/topics/collect-trends";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 熱門/趨勢來源已統整成「搜尋積木」：@/lib/content/trending-sources（可增刪來源 registry）。
// 本檔只保留 keyword 探索工具（suggest / questions），並沿用積木匯出的 AI 共用工具（Claude Haiku）。

// ─── Google Autocomplete (primary for suggest/questions; may also be blocked) ─

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

// ─── AI fallbacks for suggest / questions (backed by Claude Haiku via aiChat) ─

async function fetchAiSuggest(query: string, hl: string): Promise<string[]> {
  const lang = hl.startsWith("zh") ? "Traditional Chinese" : "English";
  const content = await aiChat(
    `Generate 10 search autocomplete suggestions for: "${query}". ` +
    `Language: ${lang}. Reply ONLY as a JSON array of strings, no markdown: ["suggestion1","suggestion2",...]`,
    8000,
  );
  return parseJsonStrings(content).slice(0, 10);
}

async function fetchAiQuestions(query: string, hl: string): Promise<string[]> {
  const lang = hl.startsWith("zh") ? "Traditional Chinese" : "English";
  const content = await aiChat(
    `Generate 15 "People Also Ask" style questions people search about: "${query}". ` +
    `Language: ${lang}. Reply ONLY as a JSON array of question strings, no markdown: ["Question 1?","Question 2?",...]`,
    8000,
  );
  return parseJsonStrings(content).slice(0, 15);
}

// Related questions: Google prefix-expand → AI fallback if empty (Claude Haiku via aiChat)
async function fetchRelatedQuestions(keyword: string, hl: string): Promise<string[]> {
  const PREFIXES_ZH = ["如何", "什麼是", "為什麼", "怎麼", "哪裡", "多少", "何時"];
  const PREFIXES_EN = ["how to", "what is", "why", "where", "how much", "when", "best"];
  const prefixes = hl.startsWith("zh") ? PREFIXES_ZH : PREFIXES_EN;

  const allResults: string[] = [];
  // Promise.allSettled — one prefix failure must not abort the rest
  const settled = await Promise.allSettled(
    prefixes.slice(0, 4).map(p => fetchGoogleSuggest(`${p} ${keyword}`, hl)),
  );
  for (const result of settled) {
    if (result.status === "fulfilled") {
      allResults.push(...result.value.filter(s => s.toLowerCase() !== keyword.toLowerCase()));
    }
  }
  const seen = new Set<string>();
  const deduped = allResults.filter(q => {
    const k = q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 15);
  if (deduped.length > 0) return deduped;
  // Google returned nothing → AI fallback (Claude Haiku)
  return fetchAiQuestions(keyword, hl);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function trendingResponse(geo: string): Promise<Response> {
  // Built-in blocks + operator DB sources, stored for the monthly topic plan (lib/content/topics/collect-trends.ts);
  // a failed write never changes this answer. No DB client = built-ins only, nothing stored.
  const sb = getSupabaseWriteClient();
  const items = sb ? (await collectTrends(sb, geo)).items : await runTrending(geo);
  return NextResponse.json({ ok: true, items, geo });
}

// GET serves only type=trending (external/DB reads). suggest/questions fall back to a paid aiChat
// call, and a same-site page can force an authenticated GET (Lax cookie; the CSRF guard covers only
// non-GET) -- so they are POST-only (lib/security/__tests__/get-no-side-effects.test.ts).
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url  = new URL(req.url);
  const type = url.searchParams.get("type") ?? "trending";
  if (type !== "trending") {
    return NextResponse.json({ ok: false, error: "use POST for type=suggest or type=questions" }, { status: 405 });
  }
  return trendingResponse(url.searchParams.get("geo") ?? "TW");
}

async function handlePost(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url   = new URL(req.url);
  const type  = url.searchParams.get("type") ?? "trending";
  const geo   = url.searchParams.get("geo") ?? "TW";
  const query = url.searchParams.get("q") ?? "";
  const hl    = url.searchParams.get("hl") ?? (geo === "TW" || geo === "HK" ? "zh-TW" : "en");

  if (type === "trending") return trendingResponse(geo);

  if (type === "suggest") {
    if (!query) return NextResponse.json({ ok: false, error: "q required" }, { status: 400 });
    let suggestions = await fetchGoogleSuggest(query, hl);
    if (suggestions.length === 0) suggestions = await fetchAiSuggest(query, hl);
    return NextResponse.json({ ok: true, suggestions, query, hl });
  }

  if (type === "questions") {
    if (!query) return NextResponse.json({ ok: false, error: "q required" }, { status: 400 });
    const questions = await fetchRelatedQuestions(query, hl);
    return NextResponse.json({ ok: true, questions, query, hl });
  }

  return NextResponse.json({ ok: false, error: "invalid type" }, { status: 400 });
}

// suggest / questions fall back to a paid aiChat call (content.trending); it inherits this grant (ADR 017 §4).
export const POST = withFeature("content.trending", handlePost);

import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";
import { runTrending, aiChat, parseJsonStrings, buildDbSearchBlocks } from "@/lib/content/trending-sources";
import { getSupabaseWriteClient } from "@/lib/supabase-server";

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

// ─── Operator-managed DB sources → ephemeral search blocks ───────────────────

async function loadDbSourceBlocks() {
  const supabase = getSupabaseWriteClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("content_sources")
      .select("id, label, url, geos, enabled")
      .eq("enabled", true);
    if (error || !data) return [];
    return buildDbSearchBlocks(data as Array<{ id: string; label: string; url: string; geos: string[] | "*" | null; enabled: boolean }>);
  } catch {
    return [];   // DB hiccup must not break trending — built-in blocks still run
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

// GET stays read-only: only type=trending (built-in blocks + operator DB sources, both pure
// external/DB reads). type=suggest and type=questions each fall back to a paid aiChat call when
// their free source returns nothing (fetchAiSuggest / fetchRelatedQuestions -> fetchAiQuestions) --
// a GET must never risk spending money (T20: the session cookie is SameSite=Lax, so a same-site
// page can force these via <img>/<script>, and the CSRF guard only covers non-GET). Both move to POST.
export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url  = new URL(req.url);
  const type = url.searchParams.get("type") ?? "trending";
  if (type !== "trending") {
    return NextResponse.json({ ok: false, error: "use POST for type=suggest or type=questions" }, { status: 405 });
  }

  const geo = url.searchParams.get("geo") ?? "TW";
  // Operator-managed DB sources (migration 0042) run alongside the built-in blocks. Built ephemerally
  // per request so a UI deletion takes effect immediately (best-effort: DB miss falls back to built-ins).
  const extra = await loadDbSourceBlocks();
  const items = await runTrending(geo, extra);   // 搜尋積木：跑所有啟用且符合 geo 的來源
  return NextResponse.json({ ok: true, items, geo });
}

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url   = new URL(req.url);
  const type  = url.searchParams.get("type") ?? "trending";
  const geo   = url.searchParams.get("geo") ?? "TW";
  const query = url.searchParams.get("q") ?? "";
  const hl    = url.searchParams.get("hl") ?? (geo === "TW" || geo === "HK" ? "zh-TW" : "en");

  if (type === "trending") {
    const extra = await loadDbSourceBlocks();
    const items = await runTrending(geo, extra);
    return NextResponse.json({ ok: true, items, geo });
  }

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

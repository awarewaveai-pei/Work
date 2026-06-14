import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TrendingItem {
  title: string;
  traffic: string;
  category: string;
  relatedQueries: string[];
}

// ─── Perplexity helper ───────────────────────────────────────────────────────

async function perplexityChat(prompt: string, timeoutMs = 10000): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return "";
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: prompt }],
        search_recency_filter: "day",
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return "";
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  } catch { return ""; }
}

// Parse a JSON array out of AI text (handles markdown code fences + line-split fallback)
function parseJsonStrings(text: string): string[] {
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]) as unknown[];
      const items = arr.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      if (items.length > 0) return items;
    } catch { /* fall through to line-split */ }
  }
  // Fallback: numbered / bulleted lines — drop lines that look like raw JSON
  return text
    .split("\n")
    .map(l => l.replace(/^[\d\-•*\s.]+/, "").replace(/^["']|["']$/g, "").trim())
    .filter(l => l.length > 3 && l.length < 300 && !l.startsWith("{") && !l.startsWith("[") && !l.includes('":"'));
}

// ─── Trending via Perplexity (Google Trends RSS is blocked from VPS IPs) ─────

async function fetchPerplexityTrending(geo: string): Promise<TrendingItem[]> {
  const geoNames: Record<string, string> = {
    TW: "Taiwan", HK: "Hong Kong", SG: "Singapore",
    US: "United States", GB: "United Kingdom", JP: "Japan", AU: "Australia",
  };
  const geoName = geoNames[geo] ?? geo;
  try {
    const content = await perplexityChat(
      `List the top 15 trending search topics in ${geoName} right now. ` +
      `For each item include: title (the search term), estimated traffic (e.g. "50K+"), and 2-3 related queries. ` +
      `Reply ONLY as a valid JSON array with no markdown fences: ` +
      `[{"title":"...","traffic":"...","relatedQueries":["...","..."]}]`,
      12000,
    );
    if (!content) return [];
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const raw = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    return raw
      .filter(it => typeof it.title === "string" && (it.title as string).trim())
      .map(it => ({
        title: String(it.title).trim(),
        traffic: typeof it.traffic === "string" ? it.traffic : "",
        category: "",
        relatedQueries: Array.isArray(it.relatedQueries)
          ? (it.relatedQueries as unknown[]).filter((q): q is string => typeof q === "string").slice(0, 5)
          : [],
      }))
      .slice(0, 20);
  } catch { return []; }
}

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

// ─── Perplexity fallbacks for suggest / questions ────────────────────────────

async function fetchPerplexitySuggest(query: string, hl: string): Promise<string[]> {
  const lang = hl.startsWith("zh") ? "Traditional Chinese" : "English";
  const content = await perplexityChat(
    `Generate 10 search autocomplete suggestions for: "${query}". ` +
    `Language: ${lang}. Reply ONLY as a JSON array of strings, no markdown: ["suggestion1","suggestion2",...]`,
    8000,
  );
  return parseJsonStrings(content).slice(0, 10);
}

async function fetchPerplexityQuestions(query: string, hl: string): Promise<string[]> {
  const lang = hl.startsWith("zh") ? "Traditional Chinese" : "English";
  const content = await perplexityChat(
    `Generate 15 "People Also Ask" style questions people search about: "${query}". ` +
    `Language: ${lang}. Reply ONLY as a JSON array of question strings, no markdown: ["Question 1?","Question 2?",...]`,
    8000,
  );
  return parseJsonStrings(content).slice(0, 15);
}

// Related questions: Google prefix-expand → Perplexity fallback if empty
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
  // Google returned nothing → Perplexity fallback
  return fetchPerplexityQuestions(keyword, hl);
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });

  const url   = new URL(req.url);
  const type  = url.searchParams.get("type") ?? "trending";
  const geo   = url.searchParams.get("geo") ?? "TW";
  const query = url.searchParams.get("q") ?? "";
  const hl    = url.searchParams.get("hl") ?? (geo === "TW" || geo === "HK" ? "zh-TW" : "en");

  if (type === "trending") {
    const items = await fetchPerplexityTrending(geo);
    return NextResponse.json({ ok: true, items, geo });
  }

  if (type === "suggest") {
    if (!query) return NextResponse.json({ ok: false, error: "q required" }, { status: 400 });
    let suggestions = await fetchGoogleSuggest(query, hl);
    if (suggestions.length === 0) suggestions = await fetchPerplexitySuggest(query, hl);
    return NextResponse.json({ ok: true, suggestions, query, hl });
  }

  if (type === "questions") {
    if (!query) return NextResponse.json({ ok: false, error: "q required" }, { status: 400 });
    const questions = await fetchRelatedQuestions(query, hl);
    return NextResponse.json({ ok: true, questions, query, hl });
  }

  return NextResponse.json({ ok: false, error: "invalid type" }, { status: 400 });
}

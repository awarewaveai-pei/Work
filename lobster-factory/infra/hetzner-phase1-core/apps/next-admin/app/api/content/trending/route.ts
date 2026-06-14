import { NextResponse } from "next/server";
import { resolveOpsRole, canCreateAiImageJob } from "@/lib/ops-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TrendingItem {
  title: string;
  traffic: string;
  category: string;
  relatedQueries: string[];
  source?: string;
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

// ─── Google News RSS — free, no API key, works from VPS ─────────────────────

const GEO_RSS: Record<string, { hl: string; gl: string; ceid: string }> = {
  TW: { hl: "zh-TW", gl: "TW", ceid: "TW:zh-Hant" },
  HK: { hl: "zh-HK", gl: "HK", ceid: "HK:zh-Hant" },
  SG: { hl: "en-SG", gl: "SG", ceid: "SG:en" },
  US: { hl: "en-US", gl: "US", ceid: "US:en" },
  GB: { hl: "en-GB", gl: "GB", ceid: "GB:en" },
  JP: { hl: "ja",    gl: "JP", ceid: "JP:ja"    },
  AU: { hl: "en-AU", gl: "AU", ceid: "AU:en"    },
};

async function fetchGoogleNewsTrending(geo: string): Promise<TrendingItem[]> {
  const p = GEO_RSS[geo] ?? GEO_RSS.TW;
  const url = `https://news.google.com/rss?hl=${p.hl}&gl=${p.gl}&ceid=${p.ceid}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentStudio/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: TrendingItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(xml)) !== null && items.length < 20) {
      const block = m[1];
      const titleM = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      if (!titleM) continue;
      // Strip " - Publisher" suffix (e.g. "颱風來了 - 東森新聞" → "颱風來了")
      const full = titleM[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
      const title = full.replace(/\s*[-–—]\s*[^\s-–—].{2,35}$/, "").trim() || full;
      if (title.length < 4) continue;
      items.push({ title, traffic: "", category: "", relatedQueries: [] });
    }
    return items;
  } catch { return []; }
}

// ─── Reddit Atom RSS — free, no key, works from VPS ────────────────────────

const REDDIT_GEO_SUBS: Record<string, string[]> = {
  TW: ["taiwan", "worldnews"],
  HK: ["hongkong", "worldnews"],
  SG: ["singapore", "worldnews"],
  US: ["news", "worldnews"],
  GB: ["unitedkingdom", "worldnews"],
  JP: ["japan", "worldnews"],
  AU: ["australia", "worldnews"],
};

async function fetchRedditTrending(geo: string): Promise<TrendingItem[]> {
  const subs = (REDDIT_GEO_SUBS[geo] ?? REDDIT_GEO_SUBS.US).join("+");
  const url = `https://www.reddit.com/r/${subs}.rss?limit=20`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ContentStudio/1.0 (educational aggregator; +https://aware-wave.com)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: TrendingItem[] = [];
    // Atom feed uses <entry> not <item>
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(xml)) !== null && items.length < 10) {
      const block = m[1];
      const titleM = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      if (!titleM) continue;
      const title = titleM[1]
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      if (title.length < 4 || title.toLowerCase() === "reddit: the front page of the internet") continue;
      items.push({ title, traffic: "", category: "", relatedQueries: [], source: "Reddit" });
    }
    return items;
  } catch { return []; }
}

// ─── PTT Gossiping HTML scrape — works from VPS with over18 cookie ───────────

async function fetchPttTrending(): Promise<TrendingItem[]> {
  try {
    const res = await fetch("https://www.ptt.cc/bbs/Gossiping/index.html", {
      headers: {
        "Cookie": "over18=1",
        "User-Agent": "Mozilla/5.0 (compatible; ContentStudio/1.0)",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const items: TrendingItem[] = [];
    // Extract post titles: <div class="title"><a href="...">TITLE</a></div>
    const titleRe = /<div class="title">\s*<a href="[^"]*">([^<]+)<\/a>/g;
    // Extract push counts: <div class="nrec"><span class="...">COUNT</span></div>
    const pushRe = /<div class="nrec"><span[^>]*>([^<]+)<\/span><\/div>/g;
    const titles: string[] = [];
    const pushes: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = titleRe.exec(html)) !== null) {
      const t = m[1].trim();
      if (t.length > 3) titles.push(t);
    }
    while ((m = pushRe.exec(html)) !== null) {
      pushes.push(m[1].trim());
    }
    for (let i = 0; i < Math.min(titles.length, 10); i++) {
      const push = pushes[i] ?? "";
      const traffic = /^\d+$/.test(push) ? `${push}推` : push === "爆" ? "爆推" : "";
      items.push({ title: titles[i], traffic, category: "", relatedQueries: [], source: "PTT" });
    }
    return items;
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
    const sources: Promise<TrendingItem[]>[] = [
      fetchGoogleNewsTrending(geo),
      fetchRedditTrending(geo),
    ];
    if (geo === "TW") sources.push(fetchPttTrending());
    const settled = await Promise.allSettled(sources);
    const items: TrendingItem[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") items.push(...r.value);
    }
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

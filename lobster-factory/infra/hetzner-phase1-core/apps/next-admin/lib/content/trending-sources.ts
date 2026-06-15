/**
 * trending-sources.ts — 搜尋積木（熱門/趨勢來源 registry）
 *
 * 把原本散在 route.ts handler 裡寫死的來源（Google News / Reddit / PTT）統整成
 * 「一個積木 + 內部來源 registry」。對外只暴露 runTrending()；對內每個來源是一筆
 * TrendingSource，可增（registerSource / 內建陣列 / env 自訂 feed）、可刪（enabled:false）。
 *
 * 增刪方式：
 *   - 程式內建：改 BUILTIN_SOURCES 陣列一筆
 *   - 任意 RSS/Atom：rssSource({...}) 工廠一行
 *   - 營運自訂（免改 code）：env CONTENT_TRENDING_FEEDS = JSON 陣列
 *       例：[{"id":"hn","label":"Hacker News","url":"https://hnrss.org/frontpage","geos":"*"}]
 *   - 未來 DB+UI 層：再呼叫 registerSource() 把 DB rows 注入即可（介面已就緒）
 */

export interface TrendingItem {
  title: string;
  traffic: string;
  category: string;
  relatedQueries: string[];
  source?: string;
}

export interface SourceCtx {
  geo: string;
}

export interface TrendingSource {
  id: string;
  label: string;
  enabled?: boolean;            // 預設 true；false = 停用（保留設定不刪）
  geos?: string[] | "*";        // 限定地區或 "*" 全通；省略視為 "*"
  fetch: (ctx: SourceCtx) => Promise<TrendingItem[]>;
}

// ─── 共用工具 ────────────────────────────────────────────────────────────────

export async function perplexityChat(prompt: string, timeoutMs = 10000): Promise<string> {
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

/** Parse a JSON array of strings out of AI text (markdown-fence + line-split fallback). */
export function parseJsonStrings(text: string): string[] {
  const jsonMatch = text.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]) as unknown[];
      const items = arr.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
      if (items.length > 0) return items;
    } catch { /* fall through to line-split */ }
  }
  return text
    .split("\n")
    .map(l => l.replace(/^[\d\-•*\s.]+/, "").replace(/^["']|["']$/g, "").trim())
    .filter(l => l.length > 3 && l.length < 300 && !l.startsWith("{") && !l.startsWith("[") && !l.includes('":"'));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** SSRF guard: https only, no internal/loopback hosts. Used for any non-hardcoded feed URL. */
function isSafePublicHttps(rawUrl: string): boolean {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return false;
  if (h === "::1" || h === "[::1]") return false;
  return true;
}

const MAX_FEED_BYTES = 2_000_000;

async function safeFetchText(url: string, timeoutMs = 8000, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentStudio/1.0)", ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text.length > MAX_FEED_BYTES ? text.slice(0, MAX_FEED_BYTES) : text;
}

/** Unified RSS (<item>) + Atom (<entry>) title extractor — covers Google News, Reddit, any custom feed. */
function extractFeedItems(
  xml: string,
  opts: { limit: number; source?: string; stripPublisherSuffix?: boolean },
): TrendingItem[] {
  const items: TrendingItem[] = [];
  const blockRe = /<(item|entry)\b[\s\S]*?<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null && items.length < opts.limit) {
    const block = m[0];
    const titleM = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    if (!titleM) continue;
    const full = decodeEntities(titleM[1]).trim();
    // Strip " - Publisher" suffix (Google News). Space-surrounded dash so "COVID-19"/"GPT-4" survive.
    const title = opts.stripPublisherSuffix
      ? (full.replace(/\s+[-–—]\s+[^\s].{1,35}$/, "").trim() || full)
      : full;
    if (title.length < 4) continue;
    if (title.toLowerCase() === "reddit: the front page of the internet") continue;
    items.push({ title, traffic: "", category: "", relatedQueries: [], source: opts.source });
  }
  return items;
}

/** Factory: turn any RSS/Atom feed URL into a TrendingSource (one line per feed). */
export function rssSource(opts: {
  id: string;
  label: string;
  url: string | ((geo: string) => string);
  geos?: string[] | "*";
  enabled?: boolean;
  limit?: number;
  stripPublisherSuffix?: boolean;
  headers?: Record<string, string>;
  source?: string;
}): TrendingSource {
  return {
    id: opts.id,
    label: opts.label,
    enabled: opts.enabled,
    geos: opts.geos ?? "*",
    fetch: async ({ geo }) => {
      const url = typeof opts.url === "function" ? opts.url(geo) : opts.url;
      if (!isSafePublicHttps(url)) return [];
      try {
        const xml = await safeFetchText(url, 8000, opts.headers);
        return extractFeedItems(xml, {
          limit: opts.limit ?? 20,
          source: opts.source ?? opts.label,
          stripPublisherSuffix: opts.stripPublisherSuffix ?? false,
        });
      } catch { return []; }
    },
  };
}

// ─── 內建來源 ────────────────────────────────────────────────────────────────

const GEO_RSS: Record<string, { hl: string; gl: string; ceid: string }> = {
  TW: { hl: "zh-TW", gl: "TW", ceid: "TW:zh-Hant" },
  HK: { hl: "zh-HK", gl: "HK", ceid: "HK:zh-Hant" },
  SG: { hl: "en-SG", gl: "SG", ceid: "SG:en" },
  US: { hl: "en-US", gl: "US", ceid: "US:en" },
  GB: { hl: "en-GB", gl: "GB", ceid: "GB:en" },
  JP: { hl: "ja",    gl: "JP", ceid: "JP:ja"    },
  AU: { hl: "en-AU", gl: "AU", ceid: "AU:en"    },
};

const REDDIT_GEO_SUBS: Record<string, string[]> = {
  TW: ["taiwan", "worldnews"],
  HK: ["hongkong", "worldnews"],
  SG: ["singapore", "worldnews"],
  US: ["news", "worldnews"],
  GB: ["unitedkingdom", "worldnews"],
  JP: ["japan", "worldnews"],
  AU: ["australia", "worldnews"],
};

const GEO_NAME: Record<string, string> = {
  TW: "Taiwan", HK: "Hong Kong", SG: "Singapore",
  US: "the United States", GB: "the United Kingdom", JP: "Japan", AU: "Australia",
};

const googleNews = rssSource({
  id: "google-news",
  label: "Google News",
  geos: "*",
  limit: 20,
  stripPublisherSuffix: true,
  source: "Google News",
  url: (geo) => {
    const p = GEO_RSS[geo] ?? GEO_RSS.TW;
    return `https://news.google.com/rss?hl=${p.hl}&gl=${p.gl}&ceid=${p.ceid}`;
  },
});

const reddit = rssSource({
  id: "reddit",
  label: "Reddit",
  geos: "*",
  limit: 10,
  source: "Reddit",
  headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  url: (geo) => {
    const subs = (REDDIT_GEO_SUBS[geo] ?? REDDIT_GEO_SUBS.US).join("+");
    return `https://www.reddit.com/r/${subs}.rss?limit=20`;
  },
});

const ptt: TrendingSource = {
  id: "ptt-gossiping",
  label: "PTT 八卦版",
  geos: ["TW"],
  fetch: async () => {
    try {
      const html = await safeFetchText("https://www.ptt.cc/bbs/Gossiping/index.html", 8000, { Cookie: "over18=1" });
      const items: TrendingItem[] = [];
      const rowRe = /<div class="r-ent">([\s\S]*?)<\/div>\s*<\/div>/g;
      let m: RegExpExecArray | null;
      while ((m = rowRe.exec(html)) !== null && items.length < 10) {
        const row = m[1];
        const titleM = row.match(/<div class="title">\s*<a href="[^"]*">([^<]+)<\/a>/);
        if (!titleM) continue; // deleted post — skip
        const title = titleM[1].trim();
        if (title.length <= 3) continue;
        const pushM = row.match(/<div class="nrec"><span[^>]*>([^<]*)<\/span><\/div>/);
        const push = pushM ? pushM[1].trim() : "";
        const traffic = /^\d+$/.test(push) ? `${push}推` : push === "爆" ? "爆推" : "";
        items.push({ title, traffic, category: "", relatedQueries: [], source: "PTT" });
      }
      return items;
    } catch { return []; }
  },
};

const perplexity: TrendingSource = {
  id: "perplexity",
  label: "Perplexity 即時",
  enabled: !!process.env.PERPLEXITY_API_KEY,
  geos: "*",
  fetch: async ({ geo }) => {
    const hl = geo === "TW" || geo === "HK" ? "zh-TW" : "en";
    const lang = hl.startsWith("zh") ? "Traditional Chinese" : "English";
    const where = GEO_NAME[geo] ?? "the world";
    const content = await perplexityChat(
      `List 10 trending news topics or hot search terms right now in ${where}. ` +
      `Language: ${lang}. Reply ONLY as a JSON array of short title strings, no markdown.`,
      10000,
    );
    return parseJsonStrings(content).slice(0, 10).map(title => ({
      title, traffic: "", category: "", relatedQueries: [], source: "Perplexity",
    }));
  },
};

// 營運自訂 feed（env，免改 code 即可增刪；未來 DB+UI 走同一條 registerSource）
function loadEnvCustomFeeds(): TrendingSource[] {
  const raw = process.env.CONTENT_TRENDING_FEEDS;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ id: string; label: string; url: string; geos?: string[] | "*"; enabled?: boolean }>;
    return arr
      .filter(f => f && f.id && f.url && isSafePublicHttps(f.url))
      .map(f => rssSource({ id: f.id, label: f.label || f.id, url: f.url, geos: f.geos ?? "*", enabled: f.enabled, source: f.label || f.id }));
  } catch { return []; }
}

// ─── Registry ────────────────────────────────────────────────────────────────

const SOURCES: TrendingSource[] = [
  googleNews,
  reddit,
  ptt,
  perplexity,
  ...loadEnvCustomFeeds(),
];

/** 動態加一個來源（DB/UI 層注入用）。 */
export function registerSource(s: TrendingSource): void {
  const i = SOURCES.findIndex(x => x.id === s.id);
  if (i >= 0) SOURCES[i] = s; else SOURCES.push(s);
}

/** 列出已註冊來源（給管理 UI / 偵錯）。 */
export function listSources(): Array<{ id: string; label: string; enabled: boolean; geos: string[] | "*" }> {
  return SOURCES.map(s => ({ id: s.id, label: s.label, enabled: s.enabled !== false, geos: s.geos ?? "*" }));
}

function geoMatch(s: TrendingSource, geo: string): boolean {
  const g = s.geos ?? "*";
  return g === "*" || g.includes(geo);
}

/** 搜尋積木對外唯一入口：跑所有啟用且符合 geo 的來源，彙整結果。 */
export async function runTrending(geo: string): Promise<TrendingItem[]> {
  const active = SOURCES.filter(s => s.enabled !== false && geoMatch(s, geo));
  const settled = await Promise.allSettled(active.map(s => s.fetch({ geo })));
  const items: TrendingItem[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") items.push(...r.value);
  }
  return items;
}

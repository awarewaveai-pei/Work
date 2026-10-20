import { loadAnthropic } from "@/lib/ai/gateway";
import { grantFor } from "@/lib/entitlements/grant";
/**
 * trending-sources.ts — 搜尋積木家族（kind:"search"）
 *
 * 每個熱門/趨勢來源 = 一個自我註冊的 block（register() into ./blocks/registry）。
 * 這是「真積木註冊系統」的第一批：搜尋源全部 register 進共用 registry，
 * 編排器只需 byKind("search") 就能跑全部，不必認識任何單一來源。
 *
 * 增刪來源 3 種：
 *   ① 內建開關      該 block 加 enabled:false（刪整段 = 徹底移除）
 *   ② 加任意 RSS    rssSearchBlock({...}) 一行 + register
 *   ③ 免改 code     env CONTENT_TRENDING_FEEDS = JSON 陣列（見下）
 *   ④ 未來 DB/UI    呼叫 registry.register() 把 DB rows 注入即可（介面已就緒）
 */

import { register, byKind, geoMatch, type BlockCtx, type ContentBlock } from "./blocks/registry";

export interface TrendingItem {
  title: string;
  traffic: string;
  category: string;
  relatedQueries: string[];
  source?: string;
}

// ─── 共用工具 ────────────────────────────────────────────────────────────────

export async function aiChat(prompt: string, _timeoutMs = 10000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";
  try {
    const Anthropic = await loadAnthropic(await grantFor("content.trending"));
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0]?.type === "text" ? msg.content[0].text : "";
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

/**
 * SSRF guard: https only, no internal/loopback/private hosts. Used for any
 * non-hardcoded (env / future DB-UI) feed URL.
 *
 * 限制：只比對 URL 字面 host，不解析 DNS → 擋不住 DNS rebinding。因此 env
 * CONTENT_TRENDING_FEEDS 視為「受信任營運者」輸入；未來開放任意使用者貼 feed 時，
 * 必須在 fetch 前加 DNS 解析後比對或 allowlist。
 */
export function isSafePublicHttps(rawUrl: string): boolean {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== "https:") return false;
  let h = u.hostname.toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);  // 去 IPv6 中括號
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;  // CGNAT 100.64/10
  if (h === "::1") return false;
  if (h.startsWith("fc") || h.startsWith("fd")) return false;            // ULA fc00::/7
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return false; // link-local
  if (h.includes("::ffff:")) return false;                              // IPv4-mapped
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

/** Unified RSS (<item>) + Atom (<entry>) title extractor — Google News, Reddit, any custom feed. */
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

// ─── 搜尋 block 工廠 ─────────────────────────────────────────────────────────

interface SearchBlockDef {
  id: string;
  title: string;
  icon?: string;
  geos?: string[] | "*";
  enabled?: boolean;
  run: (geo: string) => Promise<TrendingItem[]>;
}

/** 把一個搜尋來源包成 kind:"search" 的 ContentBlock（run 從 ctx 取 geo）。 */
function searchBlock(def: SearchBlockDef) {
  register({
    id: def.id,
    title: def.title,
    icon: def.icon,
    kind: "search",
    enabled: def.enabled,
    geos: def.geos ?? "*",
    run: (ctx: BlockCtx) => def.run(String(ctx.geo ?? "TW")),
  });
}

interface RssBlockDef {
  id: string;
  title: string;
  icon?: string;
  url: string | ((geo: string) => string);
  geos?: string[] | "*";
  enabled?: boolean;
  limit?: number;
  stripPublisherSuffix?: boolean;
  headers?: Record<string, string>;
  source?: string;
}

/** Build (but do NOT register) a kind:"search" block from an RSS/Atom feed def. */
function makeRssBlock(opts: RssBlockDef): ContentBlock<TrendingItem[]> {
  return {
    id: opts.id,
    title: opts.title,
    icon: opts.icon,
    kind: "search",
    enabled: opts.enabled,
    geos: opts.geos ?? "*",
    run: async (ctx: BlockCtx) => {
      const geo = String(ctx.geo ?? "TW");
      const url = typeof opts.url === "function" ? opts.url(geo) : opts.url;
      if (!isSafePublicHttps(url)) return [];
      try {
        const xml = await safeFetchText(url, 8000, opts.headers);
        return extractFeedItems(xml, {
          limit: opts.limit ?? 20,
          source: opts.source ?? opts.title,
          stripPublisherSuffix: opts.stripPublisherSuffix ?? false,
        });
      } catch { return []; }
    },
  };
}

/** 任意 RSS/Atom feed → 搜尋 block（一行加一個內建來源；register 進共用 registry）。 */
function rssSearchBlock(opts: RssBlockDef) {
  register(makeRssBlock(opts));
}

/**
 * DB-managed sources → ephemeral search blocks (NOT registered).
 *
 * Built per-request and passed to runTrending(geo, extraBlocks) so a deletion in the UI takes effect
 * immediately. Registering them into the module-global registry would retain removed sources until the
 * process restarts — hence ephemeral. SSRF: isSafePublicHttps is re-checked at fetch time inside
 * makeRssBlock (operator-trusted input; same posture as env feeds).
 */
export function buildDbSearchBlocks(
  rows: Array<{ id: string; label: string; url: string; geos: string[] | "*" | null; enabled: boolean }>,
): ContentBlock<TrendingItem[]>[] {
  return rows
    .filter(r => r.enabled && r.url && isSafePublicHttps(r.url))
    .map(r => makeRssBlock({
      id: `search/db/${r.id}`,
      title: r.label || r.id,
      icon: "🔗",
      url: r.url,
      geos: r.geos ?? "*",
      enabled: true,
      source: r.label || r.id,
    }));
}

// ─── 地區設定 ────────────────────────────────────────────────────────────────

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

// ─── 註冊搜尋積木（檔案 import 時自我註冊） ──────────────────────────────────

// ① Google News RSS
rssSearchBlock({
  id: "search/google-news",
  title: "Google News",
  icon: "📰",
  geos: "*",
  limit: 20,
  stripPublisherSuffix: true,
  source: "Google News",
  url: (geo) => {
    const p = GEO_RSS[geo] ?? GEO_RSS.TW;
    return `https://news.google.com/rss?hl=${p.hl}&gl=${p.gl}&ceid=${p.ceid}`;
  },
});

// ② Reddit Atom RSS（必須帶描述性 UA，否則 Reddit 403/429 → 整源變空）
rssSearchBlock({
  id: "search/reddit",
  title: "Reddit",
  icon: "👽",
  geos: "*",
  limit: 10,
  source: "Reddit",
  headers: {
    "User-Agent": "ContentStudio/1.0 (educational aggregator; +https://aware-wave.com)",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
  url: (geo) => {
    const subs = (REDDIT_GEO_SUBS[geo] ?? REDDIT_GEO_SUBS.US).join("+");
    return `https://www.reddit.com/r/${subs}.rss?limit=20`;
  },
});

// ③ PTT 八卦版（HTML scrape；僅 TW）
searchBlock({
  id: "search/ptt",
  title: "PTT 八卦版",
  icon: "🗣️",
  geos: ["TW"],
  run: async () => {
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
});

// ④ Serper 即時 Google News（key 在才啟用；替換原 Perplexity 即時 block）
searchBlock({
  id: "search/serper",
  title: "Serper 即時",
  icon: "🔍",
  geos: "*",
  enabled: !!process.env.SERPER_API_KEY,
  run: async (geo) => {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return [];
    const p = GEO_RSS[geo] ?? GEO_RSS.TW;
    const q = (geo === "TW" || geo === "HK") ? "今日熱門新聞 熱搜" : "trending news today";
    try {
      const res = await fetch("https://google.serper.dev/news", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q, gl: p.gl.toLowerCase(), hl: p.hl.split("-")[0].toLowerCase(), num: 10 }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = await res.json() as { news?: Array<{ title?: string; source?: string }> };
      return (data.news ?? [])
        .filter(item => typeof item.title === "string" && item.title.length > 4)
        .slice(0, 10)
        .map(item => ({
          title: item.title!,
          traffic: "",
          category: "",
          relatedQueries: [],
          source: item.source ?? "Serper",
        }));
    } catch { return []; }
  },
});

// ⑤ 營運自訂 feed（env，免改 code 增刪；未來 DB/UI 走同一條 register）
(function registerEnvCustomFeeds() {
  const raw = process.env.CONTENT_TRENDING_FEEDS;
  if (!raw) return;
  try {
    const arr = JSON.parse(raw) as Array<{ id: string; label?: string; title?: string; url: string; geos?: string[] | "*"; enabled?: boolean }>;
    for (const f of arr) {
      if (!f || !f.id || !f.url || !isSafePublicHttps(f.url)) continue;
      const name = f.title || f.label || f.id;
      rssSearchBlock({
        id: f.id.startsWith("search/") ? f.id : `search/${f.id}`,
        title: name,
        icon: "🔗",
        url: f.url,
        geos: f.geos ?? "*",
        enabled: f.enabled,
        source: name,
      });
    }
  } catch (e) {
    // malformed env → no custom feeds，但要看得見（不要靜默吞掉設定錯誤）
    console.warn("[trending] CONTENT_TRENDING_FEEDS 解析失敗，已略過自訂來源：", (e as Error).message);
  }
})();

// ─── 對外入口（編排器 / route 用） ───────────────────────────────────────────

/**
 * 搜尋積木的彙整入口：跑所有啟用且符合 geo 的 search block。
 * extraBlocks = 每次請求臨時建立的 DB 來源（見 buildDbSearchBlocks），不進全域 registry。
 */
export async function runTrending(geo: string, extraBlocks: ContentBlock<TrendingItem[]>[] = []): Promise<TrendingItem[]> {
  const blocks = [
    ...byKind<TrendingItem[]>("search"),
    ...extraBlocks.filter(b => b.enabled !== false),
  ].filter(b => geoMatch(b, geo));
  const settled = await Promise.allSettled(blocks.map(b => b.run({ geo })));
  const items: TrendingItem[] = [];
  for (const r of settled) {
    // runtime 護欄：未來別處註冊的 search block 若回傳非陣列也不會炸（registry 的 run 是 unknown）
    if (r.status === "fulfilled" && Array.isArray(r.value)) items.push(...r.value);
  }
  return items;
}

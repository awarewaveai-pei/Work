// The monthly topic plan (AUTO_CONTENT_EXECUTION_PLAN.md P3.4): last 30 days of trends for the site's market, the
// brand's knowledge-base folder names and its stored voice go into one AI call; the answer becomes 'proposed' topics
// spread over the month. Nothing is made until a person (or the site's auto mode, P4) approves a topic.
// The AI call is injected (`ask`), so the route (withFeature) and the scheduled job (grantFor) bill the same feature,
// content.plan, and tests run without a model. ScriptForge's 「30 天計畫」 module is the free-form, single-use cousin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_DEFAULT_MODEL, claudeFallback, claudeIncomplete, claudeParams, claudeText, loadAnthropic } from "@/lib/ai/gateway";
import { logAiCall } from "@/lib/ai/log-ai-call";
import type { Grant } from "@/lib/entitlements/can";
import { renderSiteVoice, siteLanguage } from "@/lib/content/brand-voice";
import { loadSiteBrand } from "@/lib/content/brand-voice-store";
import { listFolders } from "@/lib/kb/folders";
import { eventsForMonth } from "@/lib/events/for-month";
import { isGlobalMarket, TRENDING_GEOS, type TrendingGeo } from "@/lib/content/geos";
import { isSafePublicHttps } from "@/lib/content/public-https";
import { buildDbSearchBlocks, runBlocks } from "@/lib/content/trending-sources";
import { norm, recentTrends } from "./trends";
import { listTopics, monthKey, proposeTopics, TOPIC_FORMATS, type NewTopic, type Topic, type TopicFormat } from "./store";

export const PLAN_TOPICS = 28;
const DEFAULT_FORMATS: TopicFormat[] = ["article", "social"];

/** content_defaults.targetCountry (the article tool's list) -> the trending geos a site plans from. A global site
 *  (isGlobalMarket) gets every geo; a named country with no trending source gets none -- it plans from its brand and
 *  knowledge base, never from another country's trends. */
const GEO_FOR_COUNTRY: Record<string, TrendingGeo> = { 台灣: "TW", 香港: "HK", 新加坡: "SG", 美國: "US", 英國: "GB", 日本: "JP", 澳洲: "AU" };
export function trendGeosFor(country: string | undefined): TrendingGeo[] {
  if (isGlobalMarket(country)) return [...TRENDING_GEOS];
  const geo = GEO_FOR_COUNTRY[(country ?? "").trim()];
  return geo ? [geo] : [];
}

/** Last 30 days of trends for these geos, at most `limit`: taken in turns (each geo's next-hottest), so every geo gets
 *  its share and a headline several geos share (Reddit worldnews) counts once. */
async function trendsFor(sb: SupabaseClient, geos: TrendingGeo[], limit = 50) {
  const lists = await Promise.all(geos.map((g) => recentTrends(sb, g, 30, limit)));
  const seen = new Set<string>();
  const out: Awaited<ReturnType<typeof recentTrends>> = [];
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const t = l[i];
      if (!t || out.length >= limit || seen.has(norm(t.title))) continue;
      seen.add(norm(t.title));
      out.push(t);
    }
  }
  return out;
}

/** Newest titles of the brand's own feeds, at most 30. Ephemeral blocks, nothing saved (B10: content_trends is shared
 *  across customers). A failing feed adds nothing; `geo` only picks the fetch's language parameter. */
async function industryTitles(siteId: string, feeds: string[] | undefined, geo: TrendingGeo): Promise<string[]> {
  const urls = (Array.isArray(feeds) ? feeds : []).filter((u) => typeof u === "string" && isSafePublicHttps(u));
  if (!urls.length) return [];
  const blocks = buildDbSearchBlocks(urls.map((url, i) => ({ id: `site-${siteId}-${i}`, label: new URL(url).hostname, url, geos: "*", enabled: true })));
  return (await runBlocks(blocks, geo)).slice(0, 30).map((it) => it.title);
}

export interface PlanContext {
  siteName: string;
  language: string;            // the site's content language (brand-voice siteLanguage); keywords are searched in it
  voice: string;
  month: string;               // YYYY-MM-01
  daysInMonth: number;
  events: string[];            // holidays/events whose marketing window touches the month (P9.2)
  industry: string[];          // newest titles from the brand's own feeds (P9.4); this brand's prompt only, never stored
  trends: string[];
  folders: string[];
  taken: string[];             // keywords this organization already planned this month (unique per org+month+keyword, 0121)
}

export function buildPlanPrompt(c: PlanContext, n = PLAN_TOPICS): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "（無）");
  return `為品牌「${c.siteName}」規劃 ${c.month.slice(0, 7)} 一整個月的內容題目，共 ${n} 個，分散在 1 到 ${c.daysInMonth} 日。
每個題目要能寫成一篇 SEO 文章，並改寫成社群貼文；適合拍成短影片的題目，formats 加上 "video"。
${c.voice ? `\n品牌語氣與行銷簡報（題目要符合；不得違反禁用聲明）：\n${c.voice}\n` : ""}
${c.events.length ? `
本月在行銷窗口內的節日與活動（可提前佈局的題目）：
${list(c.events)}
` : ""}
${c.industry.length ? `品牌自己的產業來源最新文章（優先參考）：
${list(c.industry)}

` : ""}近 30 天的熱門話題（挑和品牌受眾相關的，不相關就不用）：
${list(c.trends)}

品牌知識庫的資料夾（代表品牌已蒐集過的主題）：
${list(c.folders)}

${c.taken.length ? `這個客戶本月已排的關鍵字（不得再用）：
${list(c.taken)}

` : ""}規則：title、keyword、angle 一律用${c.language}；keyword 是一個人會拿去搜尋的短詞，彼此不得重複；title 是文章標題；angle 一句話說明切入角度；
source 寫題目來自 "trending"（上面的熱門話題）、"kb"（知識庫資料夾）或 "plan"（自行規劃），ref 寫來源那一行的原文（plan 留空）。

只回傳 JSON，不要其他文字：
{"topics":[{"day":1,"title":"","keyword":"","angle":"","formats":["article","social"],"source":"plan","ref":""}]}`;
}

/** The AI answer, checked: unique keywords, days inside the month, known formats and sources; at most n. */
export function parsePlan(text: string, c: Pick<PlanContext, "month" | "daysInMonth">, n = PLAN_TOPICS): Array<Omit<NewTopic, "organization_id" | "site_id" | "created_by">> {
  let raw: unknown;
  try { raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ""); } catch { throw new Error("content_plan:unreadable_answer"); }
  const topics = Array.isArray((raw as { topics?: unknown }).topics) ? (raw as { topics: unknown[] }).topics : [];
  const seen = new Set<string>();
  const out: Array<Omit<NewTopic, "organization_id" | "site_id" | "created_by">> = [];
  for (const t of topics as Array<Record<string, unknown>>) {
    const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const keyword = s(t.keyword, 200);
    const title = s(t.title, 300);
    if (!keyword || !title || seen.has(keyword.toLowerCase())) continue;
    seen.add(keyword.toLowerCase());
    const day = Math.min(c.daysInMonth, Math.max(1, Math.round(Number(t.day) || 1)));
    const formats = Array.isArray(t.formats) ? [...new Set(t.formats.filter((f): f is TopicFormat => (TOPIC_FORMATS as readonly string[]).includes(f as string)))] : [];
    const source = t.source === "trending" || t.source === "kb" ? t.source : "plan";
    out.push({
      title, keyword, angle: s(t.angle, 1000) || null, source,
      source_ref: source === "plan" ? {} : { text: s(t.ref, 500) },
      month: c.month,
      scheduled_for: `${c.month.slice(0, 8)}${String(day).padStart(2, "0")}T01:00:00Z`,   // 09:00 Taipei
      formats: formats.length ? formats : DEFAULT_FORMATS,
    });
    if (out.length >= n) break;
  }
  if (!out.length) throw new Error("content_plan:no_topics_in_answer");
  return out;
}

/** The plan's one AI call under a content.plan grant (route: withFeature; scheduled job: grantFor). Logged per call. */
export function planAsker(grant: Grant, route: string, actorRole?: string): (prompt: string) => Promise<string> {
  return async (prompt) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("content_plan:no_anthropic_key");
    const Anthropic = await loadAnthropic(grant);
    const msg = await new Anthropic({ apiKey }).beta.messages.create({
      ...claudeParams(CLAUDE_DEFAULT_MODEL, 6000, "low"),
      ...claudeFallback(CLAUDE_DEFAULT_MODEL),
      messages: [{ role: "user", content: prompt }],
    });
    void logAiCall({ route, response: msg, fallbackModel: CLAUDE_DEFAULT_MODEL, actorRole });
    const incomplete = claudeIncomplete(msg);
    if (incomplete) throw new Error(`content_plan:${incomplete}`);
    return claudeText(msg);
  };
}

export interface ProposeMonthInput {
  organizationId: string;
  siteId: string;
  month: string;
  actor: string;
}

/**
 * Plans a month for one site: refuses a site of another organization, reads its voice and market trends, asks once,
 * stores what is new. Returns the topics added (a keyword already planned that month is skipped).
 */
export async function proposeMonth(sb: SupabaseClient, input: ProposeMonthInput, ask: (prompt: string) => Promise<string>): Promise<Topic[]> {
  const site = await loadSiteBrand(sb, input.siteId);
  if (!site || site.organizationId !== input.organizationId) throw new Error("content_plan:site_not_in_organization");
  const month = monthKey(input.month);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  // one market = its country's events (+ worldwide); global (every geo) or a market with no source = no country filter
  const geos = trendGeosFor(site.defaults.targetCountry);
  const [trends, folders, events, industry, planned] = await Promise.all([
    trendsFor(sb, geos),
    listFolders(input.organizationId),
    eventsForMonth(sb, month, geos.length === 1 ? geos[0] : null),
    industryTitles(site.siteId, site.defaults.trendFeeds, geos[0] ?? "TW"),
    listTopics(sb, input.organizationId, month),
  ]);
  const ctx: PlanContext = {
    siteName: site.name, language: siteLanguage(site.defaults), voice: renderSiteVoice(site.defaults), month, daysInMonth, events, industry,
    trends: trends.map((t) => `${t.title}（${t.source}）`), folders: folders.slice(0, 30).map((f) => f.name),
    taken: planned.map((t) => t.keyword),
  };
  const rows = parsePlan(await ask(buildPlanPrompt(ctx)), ctx);
  return proposeTopics(sb, rows.map((r) => ({ ...r, organization_id: input.organizationId, site_id: input.siteId, created_by: input.actor })));
}

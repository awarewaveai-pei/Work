// The monthly topic plan (AUTO_CONTENT_EXECUTION_PLAN.md P3.4): last 30 days of trends for the site's market, the
// brand's knowledge-base folder names and its stored voice go into one AI call; the answer becomes 'proposed' topics
// spread over the month. Nothing is made until a person (or the site's auto mode, P4) approves a topic.
// The AI call is injected (`ask`), so the route (withFeature) and the scheduled job (grantFor) bill the same feature,
// content.plan, and tests run without a model. ScriptForge's 「30 天計畫」 module is the free-form, single-use cousin.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_DEFAULT_MODEL, claudeFallback, claudeIncomplete, claudeParams, claudeText, loadAnthropic } from "@/lib/ai/gateway";
import { logAiCall } from "@/lib/ai/log-ai-call";
import type { Grant } from "@/lib/entitlements/can";
import { renderSiteVoice } from "@/lib/content/brand-voice";
import { loadSiteBrand } from "@/lib/content/brand-voice-store";
import { listFolders } from "@/lib/kb/folders";
import { recentTrends } from "./trends";
import { monthKey, proposeTopics, TOPIC_FORMATS, type NewTopic, type Topic, type TopicFormat } from "./store";

export const PLAN_TOPICS = 28;
const DEFAULT_FORMATS: TopicFormat[] = ["article", "social"];

/** content_defaults.targetCountry (the article tool's list) -> trending geo; anything else plans from Taiwan's trends. */
const GEO_FOR_COUNTRY: Record<string, string> = { 台灣: "TW", 香港: "HK", 新加坡: "SG", 美國: "US", 英國: "GB", 日本: "JP", 澳洲: "AU" };
export const geoFor = (country: string | undefined) => GEO_FOR_COUNTRY[(country ?? "").trim()] ?? "TW";

export interface PlanContext {
  siteName: string;
  voice: string;
  month: string;               // YYYY-MM-01
  daysInMonth: number;
  trends: string[];
  folders: string[];
}

export function buildPlanPrompt(c: PlanContext, n = PLAN_TOPICS): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "（無）");
  return `為品牌「${c.siteName}」規劃 ${c.month.slice(0, 7)} 一整個月的內容題目，共 ${n} 個，分散在 1 到 ${c.daysInMonth} 日。
每個題目要能寫成一篇 SEO 文章，並改寫成社群貼文；適合拍成短影片的題目，formats 加上 "video"。
${c.voice ? `\n品牌語氣與行銷簡報（題目要符合；不得違反禁用聲明）：\n${c.voice}\n` : ""}
近 30 天的熱門話題（挑和品牌受眾相關的，不相關就不用）：
${list(c.trends)}

品牌知識庫的資料夾（代表品牌已蒐集過的主題）：
${list(c.folders)}

規則：keyword 是一個人會拿去搜尋的短詞，彼此不得重複；title 是文章標題；angle 一句話說明切入角度；
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
  const [trends, folders] = await Promise.all([
    recentTrends(sb, geoFor(site.defaults.targetCountry), 30, 50),
    listFolders(input.organizationId),
  ]);
  const ctx: PlanContext = {
    siteName: site.name, voice: renderSiteVoice(site.defaults), month, daysInMonth,
    trends: trends.map((t) => `${t.title}（${t.source}）`), folders: folders.slice(0, 30).map((f) => f.name),
  };
  const rows = parsePlan(await ask(buildPlanPrompt(ctx)), ctx);
  return proposeTopics(sb, rows.map((r) => ({ ...r, organization_id: input.organizationId, site_id: input.siteId, created_by: input.actor })));
}

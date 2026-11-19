// The schedule's daily trend topics (N8): each day of the brand, a site that turned dailyTrendTopics on gets at most
// DAILY_TOPICS topics from the last 48 hours of trends, each scored 0-100 for the brand by the cheap model; only a score of
// DAILY_MIN_SCORE or more is proposed. Invariants (same shape as plan-due.ts B1-B8):
//  D1 only content_defaults.dailyTrendTopics === true; a site without it (every site before 0170) is never claimed or scored;
//  D2 the day is claimed in the DB (wp_sites.daily_trend_planned_on, 0170) BEFORE the paid call: one call per site per brand day;
//  D3 one firing scores at most one site, and then does not tick (the caller returns the summary, as plan-due B3);
//  D4 approved only for ai_pick sites (aiPicksTopics), never because of publishMode;
//  D5 the N9 90-day filter runs on the candidates before the call and on the answer after it (same norm());
//  D6 no entitlement = skip quietly (no claim, no spend).
// Everything outside the decisions is injected (DailyDeps), so tests need no DB and no model.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_FAST_MODEL, claudeIncomplete, claudeParams, claudeText, loadAnthropic } from "@/lib/ai/gateway";
import { logAiCall } from "@/lib/ai/log-ai-call";
import { aiPicksTopics, DAILY_MIN_SCORE, DAILY_TOPICS, dailyTrendTopicsOn, renderSiteVoice, siteLanguage, type SiteContentDefaults } from "@/lib/content/brand-voice";
import { loadSiteBrand } from "@/lib/content/brand-voice-store";
import { EntitlementRequired, type Grant } from "@/lib/entitlements/can";
import { grantFor, runForOrg } from "@/lib/entitlements/grant";
import { trendGeosFor, trendsFor } from "./plan";
import { brandDay } from "./tick";
import { norm } from "./trends";
import { listTopics, monthKey, move, orgTimeZone, proposeTopics, recentTopics, taipeiParts, type NewTopic, type Topic } from "./store";

export { DAILY_MIN_SCORE, DAILY_TOPICS };
/** Trends looked at: recentTrends counts from the UTC date `days` back, inclusive, so 1 = yesterday and today (24-48 hours);
 *  2 would reach almost 72 hours back. At most DAILY_CANDIDATES, after the 90-day filter. */
export const DAILY_TREND_DAYS = 1;
export const DAILY_CANDIDATES = 30;
/** The answer budget of the one scoring call (30 scores with a short reason, 3 titles). */
export const DAILY_ANSWER_TOKENS = 3000;

export interface DailyCandidate { title: string; source: string }
export interface DailyPick { candidate: DailyCandidate; score: number; reason: string; title: string; keyword: string; angle: string | null }

export interface DailyDeps {
  sites(): Promise<Array<{ id: string; defaults: SiteContentDefaults }>>;
  timeZone(): Promise<string | null>;
  canPlan(): Promise<boolean>;
  /** Takes the site's brand day; false = another firing already took it (D2). */
  claimDay(siteId: string, day: string): Promise<boolean>;
  /** Trends of the site's market, hottest first. */
  candidates(siteId: string, defaults: SiteContentDefaults): Promise<DailyCandidate[]>;
  /** Normalized titles and keywords of the last 90 days (N9), plus every keyword the organization already has in `month`
   *  (content_topics is unique on organization_id+month+keyword: a pick repeating one would be scored, paid and dropped). */
  covered(siteId: string, month: string): Promise<Set<string>>;
  /** The one paid call: every candidate scored. */
  score(siteId: string, candidates: DailyCandidate[]): Promise<DailyPick[]>;
  propose(siteId: string, rows: Array<Omit<NewTopic, "organization_id" | "site_id" | "created_by">>): Promise<Topic[]>;
  approve(t: Topic): Promise<Topic | null>;
}

/** The picks worth proposing: score >= DAILY_MIN_SCORE, not covered in 90 days, one per keyword, best first, at most DAILY_TOPICS. */
export function choosePicks(picks: DailyPick[], covered: Set<string>): DailyPick[] {
  const seen = new Set<string>();
  return picks
    .filter((p) => p.score >= DAILY_MIN_SCORE && !covered.has(norm(p.title)) && !covered.has(norm(p.keyword)) && !covered.has(norm(p.candidate.title)))
    .sort((a, b) => b.score - a.score)
    .filter((p) => (seen.has(norm(p.keyword)) ? false : (seen.add(norm(p.keyword)), true)))
    .slice(0, DAILY_TOPICS);
}

/** At most one site per firing (D3); null when no enabled site is due today. A throw from score goes up (recorded +
 *  incident); the day is already claimed, so the site waits for tomorrow -- never a second paid call the same day. */
export async function dailyIfDue(deps: DailyDeps, now: Date): Promise<string | null> {
  const on = (await deps.sites()).filter((s) => dailyTrendTopicsOn(s.defaults));
  if (!on.length) return null;
  if (!(await deps.canPlan())) return null;
  const day = brandDay(now, await deps.timeZone());
  for (const s of on) {
    if (!(await deps.claimDay(s.id, day))) continue;
    const at = now.toISOString();   // 排定日 = today: the tick may start it right away, under the daily cap
    const month = monthKey(taipeiParts(at).month);
    const covered = await deps.covered(s.id, month);
    const fresh = (await deps.candidates(s.id, s.defaults))
      .filter((c) => !covered.has(norm(c.title))).slice(0, DAILY_CANDIDATES);
    if (!fresh.length) return `daily site=${s.id} day=${day} candidates=0 topics=0`;
    const picks = choosePicks(await deps.score(s.id, fresh), covered);
    const topics = await deps.propose(s.id, picks.map((p) => ({
      title: p.title, keyword: p.keyword, angle: p.angle, source: "trending" as const,
      source_ref: { text: p.candidate.title, trend_source: p.candidate.source, score: p.score, reason: p.reason, daily_on: day },
      month, scheduled_for: at,
    })));
    let approved = 0;
    if (aiPicksTopics(s.defaults)) for (const t of topics) if (await deps.approve(t)) approved++;
    return `daily site=${s.id} day=${day} candidates=${fresh.length} topics=${topics.length} approved=${approved}`;
  }
  return null;
}

export function buildScorePrompt(c: { siteName: string; language: string; voice: string }, candidates: DailyCandidate[]): string {
  return `你是品牌「${c.siteName}」的內容編輯。下面是近兩天的熱門話題，逐一判斷和這個品牌、它的受眾有多相關，給 0 到 100 分。
涉及災難、傷亡、政治爭議的話題給 0 分。
${c.voice ? `\n品牌語氣與行銷簡報（不得違反禁用聲明）：\n${c.voice.slice(0, 2000)}\n` : ""}
熱門話題：
${candidates.map((t, i) => `${i + 1}. ${t.title}`).join("\n")}

每一個都要回：i（編號）、score（0-100 整數）、reason（一句話，${c.language}）。
score ≥ ${DAILY_MIN_SCORE} 的另外寫 title（文章標題）、keyword（一個人會拿去搜尋的短詞）、angle（一句話切入角度），一律用${c.language}；低於的留空。

只回傳 JSON，不要其他文字：
{"scores":[{"i":1,"score":0,"reason":"","title":"","keyword":"","angle":""}]}`;
}

/** The scoring answer, checked: a known index once, an integer score 0-100; a pick missing its title or keyword scores 0. */
export function parseScores(text: string, candidates: DailyCandidate[]): DailyPick[] {
  let raw: unknown;
  try { raw = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? ""); } catch { throw new Error("content_daily:unreadable_answer"); }
  const rows = Array.isArray((raw as { scores?: unknown }).scores) ? (raw as { scores: unknown[] }).scores : [];
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const out: DailyPick[] = [];
  const seen = new Set<number>();
  for (const r of rows as Array<Record<string, unknown>>) {
    const i = Math.round(Number(r?.i)) - 1;
    const candidate = candidates[i];
    if (!candidate || seen.has(i)) continue;
    seen.add(i);
    const title = s(r.title, 300);
    const keyword = s(r.keyword, 200);
    const n = Number(r.score);
    const score = title && keyword && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    out.push({ candidate, score, reason: s(r.reason, 300), title, keyword, angle: s(r.angle, 1000) || null });
  }
  return out;
}

/** The scoring call on the cheap model under a content.plan grant; logged per call like the month's plan. */
export function dailyAsker(grant: Grant, route: string): (prompt: string) => Promise<string> {
  return async (prompt) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("content_daily:no_anthropic_key");
    const Anthropic = await loadAnthropic(grant);
    const msg = await new Anthropic({ apiKey }).messages.create({
      ...claudeParams(CLAUDE_FAST_MODEL, DAILY_ANSWER_TOKENS, "low"),
      messages: [{ role: "user", content: prompt }],
    });
    void logAiCall({ route, response: msg, fallbackModel: CLAUDE_FAST_MODEL, grant });
    const incomplete = claudeIncomplete(msg);
    if (incomplete) throw new Error(`content_daily:${incomplete}`);
    return claudeText(msg);
  };
}

const fail = (what: string, e: { message: string }): never => { throw new Error(`content_daily:${what}:${e.message}`); };

export function dailyDeps(sb: SupabaseClient, organizationId: string, actor: string): DailyDeps {
  const route = "lib/schedules/content_pipeline:daily";
  return {
    async sites() {
      const { data, error } = await sb.from("wp_sites").select("id, content_defaults").eq("organization_id", organizationId).eq("active", true).order("id");
      if (error) fail("sites", error);
      return ((data ?? []) as Array<{ id: string; content_defaults: SiteContentDefaults | null }>).map((r) => ({ id: r.id, defaults: r.content_defaults ?? {} }));
    },
    timeZone: () => orgTimeZone(sb, organizationId),
    async canPlan() {
      try {
        await runForOrg(organizationId, actor, () => grantFor("content.plan"));
        return true;
      } catch (e) {
        if (e instanceof EntitlementRequired) return false;
        throw e;
      }
    },
    async claimDay(siteId, day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`content_daily:bad_day:${day}`);   // goes into the or() string below
      // the switch is checked again in the write: one turned off after sites() was read claims nothing and spends nothing
      const { data, error } = await sb.from("wp_sites").update({ daily_trend_planned_on: day }).eq("id", siteId).eq("organization_id", organizationId)
        .eq("content_defaults->>dailyTrendTopics", "true")
        .or(`daily_trend_planned_on.is.null,daily_trend_planned_on.lt.${day}`).select("id");
      if (error) fail("claim", error);
      return (data ?? []).length === 1;
    },
    async candidates(_siteId, defaults) {
      const geos = trendGeosFor(defaults.targetCountry);
      if (!geos.length) return [];
      return (await trendsFor(sb, geos, DAILY_CANDIDATES * 2, DAILY_TREND_DAYS)).map((t) => ({ title: t.title, source: t.source }));
    },
    async covered(siteId, month) {
      const [recent, planned] = await Promise.all([recentTopics(sb, organizationId, siteId), listTopics(sb, organizationId, month)]);
      return new Set([...recent.flatMap((t) => [norm(t.title), norm(t.keyword)]), ...planned.map((t) => norm(t.keyword))]);
    },
    score: (siteId, candidates) => runForOrg(organizationId, actor, async () => {
      const site = await loadSiteBrand(sb, siteId);
      if (!site || site.organizationId !== organizationId) throw new Error("content_daily:site_not_in_organization");
      const ask = dailyAsker(await grantFor("content.plan"), route);
      return parseScores(await ask(buildScorePrompt({ siteName: site.name, language: siteLanguage(site.defaults), voice: renderSiteVoice(site.defaults) }, candidates)), candidates);
    }),
    propose: (siteId, rows) => proposeTopics(sb, rows.map((r) => ({ ...r, organization_id: organizationId, site_id: siteId, created_by: actor }))),
    approve: (t) => move(sb, t, "approved"),
  };
}

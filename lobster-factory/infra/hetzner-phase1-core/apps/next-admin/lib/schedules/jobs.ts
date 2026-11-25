// The menu of per-client routine jobs stored in client_schedules (migration 0097). A new job = one
// entry here + its run(); no table, route or Trigger task (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md §9).
// Site-watch is not here: it has its own engine and tables (adapters/site-watch.ts).

import { runCollection } from "@/lib/collect/run";
import "@/lib/collect/blocks";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadCis } from "@/lib/cs/cis";
import { applyChatwootBaseline } from "@/lib/cs/chatwoot-baseline";
import { REPORT_JOBS, runPeriodReport, type ReportKind } from "@/lib/social/reports";
import { DAILY_START_CAP } from "@/lib/content/topics/tick";
import { dailyCostTwd, planCostTwd, topicCostTwd } from "@/lib/content/topics/cost";
import { TWD_RATE } from "@/lib/ai/cost-model";
import { DEFAULT_TOPIC_CAP_TWD } from "@/lib/content/topics/budget";
import type { SiteContentDefaults } from "@/lib/content/brand-voice";
import { raiseNotice, withTopicStopNotices } from "./stop-notice";
import type { JobMeta } from "./types";
import type { Frequency, WeekdayHours } from "./schedule";
import { CLAUDE_USAGE_WINDOW_JOB, claudeUsageWindowUnavailable, fireClaudeUsageWindow } from "./claude-usage-window";
import type { StoredSchedule } from "./store";

/** A fixed USD price shown in NT$ (the page rule: every amount a person reads is NT$). */
const ntd = (usd: number) => Math.ceil(usd * TWD_RATE * 10) / 10;

/** What view.ts knows about a client when deciding whether a job can run there. */
export interface JobClientFacts {
  siteUrl: unknown;
  chatwoot: unknown;
  /** Active WordPress sites (wp_sites) of the client. */
  wpSites?: number;
}

/** The AwareWave platform organization (the same slug app/api/ops/clients/route.ts reads as first_party). */
export const PLATFORM_ORG_SLUG = "awarewave-ops";

export interface ClientJob extends JobMeta {
  /** What a client with no row reads as. enabled is always false (AGENTS.md 自動化預設 OFF). */
  defaults: { frequency: Frequency; hourUtc: number; dayOfWeekUtc: number; dayOfMonth: number; weekdayHours?: WeekdayHours };
  /** Organizations (slugs) the job exists for; absent = every client. Others get no cell, no PATCH (404) and no run. */
  onlyOrgSlugs?: readonly string[];
  /** Throws on any failure, including one the job reports instead of throwing; the sweep records it and
   * raises the incident. Returns a one-line summary. */
  run(organizationId: string, runKey: string, schedule?: StoredSchedule): Promise<string>;
  /** Why this job cannot run for the client (shown in the cell, enabling has no effect); null = it can. */
  unavailable?(client: JobClientFacts): string | null;
}

const DAILY_WEEKLY: JobMeta["frequencies"] = [
  { value: "daily", label: "每天", usesHour: true, usesDay: false },
  { value: "weekly", label: "每週", usesHour: true, usesDay: true },
];

const REPORT_COST = "免費（只讀已收集的數字，寄信用 Resend，不用 AI）。";
/** One social report job per period (lib/social/reports.ts REPORT_JOBS): its own switch, send day and hour. Default 09:00 Taipei. */
function reportJob(kind: ReportKind, label: string, description: string, frequency: JobMeta["frequencies"][number], dayOfWeekUtc = 1): ClientJob {
  return {
    key: REPORT_JOBS[kind].job, label, description, cost: REPORT_COST, frequencies: [frequency],
    // one tab for the four (operator 2026-10-25: 四個分頁太佔空間)
    group: { key: "social_reports", label: "社群報告自動寄出", item: REPORT_JOBS[kind].noun },
    // 01:00 UTC = 09:00 Taipei; day_of_month is a Taipei day (0123)
    defaults: { frequency: frequency.value as Frequency, hourUtc: 1, dayOfWeekUtc, dayOfMonth: 1 },
    run: (organizationId) => runPeriodReport(kind, organizationId),
  };
}
const REPORT_TAIL = "給品牌的擁有者和客戶；在社群發文的「報表管理」頁可以打開。";

export const CLIENT_JOBS: readonly ClientJob[] = [
  {
    key: "collect_crawl",
    label: "自動爬取",
    description: "定期整理客戶核准的網頁內容，更新客服知識庫。",
    // Prices 2026-10: OpenAI text-embedding-3-small 0.02 USD/1M tokens, Serper ~0.001, Brave ~0.005 per query;
    // caps: DEFAULT_BUDGET 200 fetches (lib/collect/run.ts), MAX_QUERIES 16 (lib/collect/search/query-plan.ts).
    cost: `網頁抓取免費；新增或變更頁面每次最多約 NT$${ntd(0.02)}。有實體檔案來源時，每次最多約 NT$${ntd(0.12)}。`,
    frequencies: DAILY_WEEKLY,
    defaults: { frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 1, dayOfMonth: 1 },
    async run(organizationId, runKey) {
      const result = await runCollection({ organizationId, runKey });
      // runCollection reports e.g. no_approved_sources in errors[] without throwing: an enabled schedule
      // that collected nothing must not read as 正常.
      if (result.errors.length) throw new Error(`collect_errors:${result.errors.join(",")} written=${result.sink.written}`);
      return `written=${result.sink.written}`;
    },
  },
  {
    key: "cs_chatwoot_baseline",
    label: "Chatwoot 基本設定檢查",
    description: "每天確認客戶的 Chatwoot 仍有「48 小時沒動靜自動結案」和結案巨集；被改掉就改回來，改不了會通知。",
    cost: "免費（只呼叫 Chatwoot，不用 AI）。",
    frequencies: DAILY_WEEKLY,
    // 02:00 UTC = 10:00 Taipei: a failure (token revoked) is raised while someone is awake to fix it.
    defaults: { frequency: "daily", hourUtc: 2, dayOfWeekUtc: 1, dayOfMonth: 1 },
    unavailable: (c) => (c.chatwoot && typeof c.chatwoot === "object" ? null : "沒有接 Chatwoot"),
    async run(organizationId) {
      const cis = await loadCis(organizationId);
      // Same answer as unavailable() in the table: an enabled row left on a client that no longer has
      // Chatwoot is skipped, not raised as an incident every day (Codex 2026-10-16 partialreview-482ab2b0).
      if (!cis.chatwoot) return "skipped: 沒有接 Chatwoot";
      // Same function the 客服 tab's token save calls (lib/cs/chatwoot-baseline.ts); it gates itself.
      const r = await applyChatwootBaseline(getSupabaseWriteClient(), organizationId, cis.chatwoot, cis);
      // A blocking system mode is a deliberate freeze, not a failure: report, raise nothing.
      if ("blocked" in r) return `skipped: system mode ${r.mode} blocks changes`;
      return r.changes.length
        ? `reapplied ${r.changes.map((c) => (c.kind === "account" ? c.field : `${c.kind}:${c.name}`)).join(",")}`
        : "unchanged";
    },
  },
  // A missed send day (host down, mail failed) is retried the next 2 days at the same hour (schedule.ts CATCH_UP_DAYS);
  // a weekly one waits for next week. Each period is sent once (runPeriodReport dedupes).
  reportJob("weekly", "社群週報自動寄出", `每週把上週一到週日的社群成效報告連結寄${REPORT_TAIL}`,
    { value: "weekly", label: "每週", usesHour: true, usesDay: true }),
  reportJob("monthly", "社群月報自動寄出", `每月把上個月的社群成效報告連結寄${REPORT_TAIL}`,
    { value: "monthly", label: "每月", usesHour: true, usesDay: false, usesDayOfMonth: true }),
  reportJob("quarterly", "社群季報自動寄出", `每季（1、4、7、10 月）把上一季的社群成效報告連結寄${REPORT_TAIL}`,
    { value: "quarterly", label: "每季", usesHour: true, usesDay: false, usesDayOfMonth: true }),
  reportJob("yearly", "社群年報自動寄出", `每年 1 月把去年一整年的社群成效報告連結寄${REPORT_TAIL}`,
    { value: "yearly", label: "每年 1 月", usesHour: true, usesDay: false, usesDayOfMonth: true }),
  {
    // N10 (O3): one draft a week per site, sending is always a person's click in FluentCRM (lib/crm/member-newsletter.ts M1-M5).
    key: "member_newsletter",
    label: "每週會員信草稿",
    description: "每週把各網站上一週（週一到週日）已發布的影片和文章排成一封信，放進那個網站自己的 FluentCRM 當草稿，並通知「會員信草稿已備好」。系統不會自己寄出，要有人到 FluentCRM 看過再按寄出。那一週沒有發布就不建；同一週只建一封；網站沒裝 FluentCRM 就跳過。",
    cost: "免費（只讀已發布的題目，透過網站外掛建草稿，不用 AI）。",
    frequencies: [{ value: "weekly", label: "每週", usesHour: true, usesDay: true }],
    // Monday 01:00 UTC = 09:00 Taipei: last week is complete in every Asian brand zone by then
    defaults: { frequency: "weekly", hourUtc: 1, dayOfWeekUtc: 1, dayOfMonth: 1 },
    unavailable: (c) => (c.wpSites ? null : "沒有 WordPress 網站"),
    async run(organizationId) {
      const sb = getSupabaseWriteClient();
      if (!sb) throw new Error("member_newsletter:no_supabase_client");
      const { runMemberNewsletter, memberNewsletterDeps } = await import("@/lib/crm/member-newsletter");
      return runMemberNewsletter(memberNewsletterDeps(sb, organizationId), new Date());
    },
  },
  {
    key: "content_pipeline",
    label: "自動內容管線",
    description: "隨時檢查題目：已核准的題目到了排定時間，就依它選的格式做成 WordPress 草稿和社群草稿；選了影片的，影片做好後自動嵌進文章、附到社群貼文，再跑規則審核。網站設成「AI 審核後自動發布」且審核全部通過才會發布，其餘留在草稿。每月自動提題目；網站打開「每日熱題」的，每天另從近兩天熱搜挑最多 3 個相關分數 70 以上的題目。題目和排定時間在「自動內容」頁設定。",
    // Prices: lib/ai/cost-model.ts TEXT_FEATURES article + syndicate (lib/content/topics/cost.ts).
    cost: `每題約 NT$${topicCostTwd().usual}（價目表估價，含配圖；文章＋社群改寫，社群太長要重寫時最多 NT$${topicCostTwd().max}），選了影片的題目再加約 NT$${topicCostTwd(["video"]).usual}（腳本；畫面用免費實拍、配音免費）。一天最多花到「每天最多開始」的題數；每一題花到「每題上限」就停在那一步（預設 NT$${DEFAULT_TOPIC_CAP_TWD}）。網站設定裡文字 AI 走法含訂閱的，文章那一段 NT$0（訂閱額度），訂閱不可用時改用 API，照上面計價。每個網站每月第一次提案另約 NT$${planCostTwd()}；打開每日熱題的網站每天打分另約 NT$${dailyCostTwd()}。沒有到期題目時免費。`,
    // every_5m is how often it looks, not a choice: the page shows no frequency for a job with one fixed cadence
    frequencies: [{ value: "every_5m", label: "每 5 分鐘", usesHour: false, usesDay: false }],
    dailyLimit: { label: "每天最多開始", unit: "題", options: Array.from({ length: 10 }, (_, i) => i + 1), default: DAILY_START_CAP },
    // NT$ a topic (0168 per_topic_cap_twd 1-1000); a topic reaching it stops at that step (lib/content/topics/budget.ts)
    perTopicCap: { label: "每題上限", options: [5, 10, 15, 20, 30, 50, 80, 100], default: DEFAULT_TOPIC_CAP_TWD },
    defaults: { frequency: "every_5m", hourUtc: 0, dayOfWeekUtc: 1, dayOfMonth: 1 },
    unavailable: (c) => (c.wpSites ? null : "沒有 WordPress 網站"),
    async run(organizationId, _runKey, schedule) {
      const sb = getSupabaseWriteClient();
      if (!sb) throw new Error("content_pipeline:no_supabase_client");
      const [{ tickTopics }, { topicDeps }, { collectTrendsIfDue }, { trendGeosFor }, { planIfDue, planDueDeps }] = await Promise.all([import("@/lib/content/topics/tick"),
        import("@/lib/content/topics/make"), import("@/lib/content/topics/collect-trends"), import("@/lib/content/topics/plan"),
        import("@/lib/content/topics/plan-due")]);
      const { dailyIfDue, dailyDeps } = await import("@/lib/content/topics/daily");
      // Trends first, once per geo per day (B5): the month's proposal reads what was stored. A trends failure must not
      // stop topics already approved, so the tick runs anyway and the failure is thrown after it (recorded + incident).
      let trendsError = "";
      try {
        const { data: sites, error } = await sb.from("wp_sites").select("id, content_defaults").eq("organization_id", organizationId).eq("active", true);
        if (error) throw new Error(`content_pipeline:sites:${error.message}`);
        await collectTrendsIfDue(sb, (sites ?? []).flatMap((s) => trendGeosFor((s.content_defaults as SiteContentDefaults | null)?.targetCountry)));
      } catch (e) {
        trendsError = e instanceof Error ? e.message : String(e);
      }
      // B3: a firing that plans a site's month does not tick (plan ~90 s + tick 200 s would pass run-due's 300 s); the next
      // firing, 5 minutes on, finds the month planned and ticks. A plan failure propagates: no tick, recorded + incident.
      // The daily trend topics (N8) the same way: a firing that scores a site's day does not tick either.
      const summary = (await planIfDue(planDueDeps(sb, organizationId, "schedule:content_pipeline"), new Date()))
        ?? (await dailyIfDue(dailyDeps(sb, organizationId, "schedule:content_pipeline"), new Date()))
        ?? await tickTopics(withTopicStopNotices(topicDeps(sb, organizationId, "schedule:content_pipeline", { capTwd: schedule?.perTopicCapTwd ?? DEFAULT_TOPIC_CAP_TWD, maker: "schedule" }), (n) => raiseNotice(sb, organizationId, n)), { cap: schedule?.dailyLimit ?? DAILY_START_CAP });
      if (trendsError) throw new Error(`${summary}; content_pipeline:trends:${trendsError}`);
      return summary;
    },
  },  {
    ...CLAUDE_USAGE_WINDOW_JOB,
    // Taipei Mon-Fri 08:00, Sat 07:00, Sun off: what the cloud routines ran before this job (2026-11-23)
    defaults: { frequency: "weekdays", hourUtc: 0, dayOfWeekUtc: 1, dayOfMonth: 1, weekdayHours: [null, 8, 8, 8, 8, 8, 7] },
    onlyOrgSlugs: [PLATFORM_ORG_SLUG],
    unavailable: () => claudeUsageWindowUnavailable(process.env),
    run: () => fireClaudeUsageWindow(process.env),
  },
];

/** False = the job does not exist for this organization (onlyOrgSlugs). The one gate the page, the PATCH and the sweep share. */
export function jobAppliesTo(job: Pick<ClientJob, "onlyOrgSlugs">, orgSlug: string | null | undefined): boolean {
  return !job.onlyOrgSlugs || (!!orgSlug && job.onlyOrgSlugs.includes(orgSlug));
}

export function clientJob(key: string): ClientJob | undefined {
  return CLIENT_JOBS.find((j) => j.key === key);
}

/** The daily limit in force for a client: its stored one, else the job's default; null = the job has no daily limit. */
/** The per-topic cap in force, NT$: the stored one, else the job's default; null = the job has no per-topic cap. */
export function perTopicCapOf(job: Pick<JobMeta, "perTopicCap">, stored: number | null | undefined): number | null {
  return job.perTopicCap ? stored ?? job.perTopicCap.default : null;
}

export function dailyLimitOf(job: Pick<JobMeta, "dailyLimit">, stored: number | null | undefined): number | null {
  return job.dailyLimit ? stored ?? job.dailyLimit.default : null;
}

/** A stored row read through the registry: a frequency the job no longer offers (a row written before the job changed --
 *  e.g. the monthly report's old 'daily' look, written by a page still open across the 0123 deploy) counts as the job's
 *  default frequency, so the sweep and the page never run or show a cadence the job does not have. */
export function asRegistered<T extends { jobKey: string; frequency: Frequency }>(row: T): T {
  const job = clientJob(row.jobKey);
  return job && !job.frequencies.some((f) => f.value === row.frequency) ? { ...row, frequency: job.defaults.frequency } : row;
}

// The menu of per-client routine jobs stored in client_schedules (migration 0097). A new job = one
// entry here + its run(); no table, route or Trigger task (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md §9).
// Site-watch is not here: it has its own engine and tables (adapters/site-watch.ts).

import { runCollection } from "@/lib/collect/run";
import "@/lib/collect/blocks";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { loadCis } from "@/lib/cs/cis";
import { applyChatwootBaseline } from "@/lib/cs/chatwoot-baseline";
import type { JobMeta } from "./types";

/** What view.ts knows about a client when deciding whether a job can run there. */
export interface JobClientFacts {
  siteUrl: unknown;
  chatwoot: unknown;
}

export interface ClientJob extends JobMeta {
  /** What a client with no row reads as. enabled is always false (AGENTS.md 自動化預設 OFF). */
  defaults: { frequency: "daily" | "weekly"; hourUtc: number; dayOfWeekUtc: number };
  /** Throws on any failure, including one the job reports instead of throwing; the sweep records it and
   * raises the incident. Returns a one-line summary. */
  run(organizationId: string, runKey: string): Promise<string>;
  /** Why this job cannot run for the client (shown in the cell, enabling has no effect); null = it can. */
  unavailable?(client: JobClientFacts): string | null;
}

const DAILY_WEEKLY: JobMeta["frequencies"] = [
  { value: "daily", label: "每天", usesHour: true, usesDay: false },
  { value: "weekly", label: "每週", usesHour: true, usesDay: true },
];

export const CLIENT_JOBS: readonly ClientJob[] = [
  {
    key: "collect_crawl",
    label: "自動爬取",
    description: "定期整理客戶核准的網頁內容，更新客服知識庫。",
    // Prices 2026-10: OpenAI text-embedding-3-small 0.02 USD/1M tokens, Serper ~0.001, Brave ~0.005 per query;
    // caps: DEFAULT_BUDGET 200 fetches (lib/collect/run.ts), MAX_QUERIES 16 (lib/collect/search/query-plan.ts).
    cost: "網頁抓取免費；新增或變更頁面每次最多約 0.02 美元。有實體檔案來源時，每次最多約 0.12 美元。",
    frequencies: DAILY_WEEKLY,
    defaults: { frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 1 },
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
    defaults: { frequency: "daily", hourUtc: 2, dayOfWeekUtc: 1 },
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
];

export function clientJob(key: string): ClientJob | undefined {
  return CLIENT_JOBS.find((j) => j.key === key);
}

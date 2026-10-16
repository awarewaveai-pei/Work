// The menu of per-client routine jobs stored in client_schedules (migration 0097). A new job = one
// entry here + its run(); no table, route or Trigger task (agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md §9).
// Site-watch is not here: it has its own engine and tables (adapters/site-watch.ts).

import { runCollection } from "@/lib/collect/run";
import "@/lib/collect/blocks";
import type { JobMeta } from "./types";

export interface ClientJob extends JobMeta {
  /** What a client with no row reads as. enabled is always false (AGENTS.md 自動化預設 OFF). */
  defaults: { frequency: "daily" | "weekly"; hourUtc: number; dayOfWeekUtc: number };
  /** Throws on any failure, including one the job reports instead of throwing; the sweep records it and
   * raises the incident. Returns a one-line summary. */
  run(organizationId: string, runKey: string): Promise<string>;
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
];

export function clientJob(key: string): ClientJob | undefined {
  return CLIENT_JOBS.find((j) => j.key === key);
}

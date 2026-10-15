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

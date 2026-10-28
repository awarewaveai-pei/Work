// The auto-content control page's first layer (AUTO_CONTENT P9.3): one row per active site, built from raw query rows.
// Pure: the loader (overview-load.ts) queries, the page draws. Gates read through aiPicksTopics/autoPublishes (B4: a missing
// or misspelt value means a person); "proposed this month" is the same condition as plan-due B1 (a non-manual topic).
import { aiPicksTopics, autoPublishes, type SiteContentDefaults } from "@/lib/content/brand-voice";
import type { TopicSource, TopicStatus } from "./store";

export interface OverviewInput {
  sites: Array<{ id: string; name: string; organizationId: string; orgName: string; defaults: SiteContentDefaults | null; attemptedAt: string | null }>;
  /** The client's `content_pipeline` rows; a client without one is off. */
  schedules: Array<{ organizationId: string; enabled: boolean; dailyLimit: number | null; lastError: string | null }>;
  /** This Taipei month's topics, one line each. */
  topics: Array<{ siteId: string; status: TopicStatus; source: TopicSource }>;
  /** organizationId -> the `content.plan` check passed (B8); a client missing here counts as not opened. */
  canPlan: Record<string, boolean>;
  /** organizationId -> this month's AI spend in USD, every tool (the /ops/costs figure). */
  spendUsd: Record<string, number>;
}

export interface OverviewRow {
  siteId: string;
  siteName: string;
  organizationId: string;
  orgName: string;
  enabled: boolean;
  dailyLimit: number | null;
  lastError: string | null;
  topicGate: "ai" | "human";
  publishGate: "auto" | "human";
  proposedThisMonth: boolean;
  attemptedAt: string | null;
  pending: number;
  inProgress: number;
  failed: number;
  notOpened: boolean;
  spendUsd: number;
  /** Shown first: a recent error, a failed topic, or a client who has not opened topic planning. */
  problem: boolean;
}

const IN_PROGRESS: ReadonlySet<TopicStatus> = new Set(["generating", "drafted", "waiting_video", "embedded"]);

export function buildOverview(input: OverviewInput): OverviewRow[] {
  const schedule = new Map(input.schedules.map((s) => [s.organizationId, s]));
  const rows = input.sites.map((s): OverviewRow => {
    const mine = input.topics.filter((t) => t.siteId === s.id);
    const sch = schedule.get(s.organizationId);
    const failed = mine.filter((t) => t.status === "failed").length;
    const notOpened = input.canPlan[s.organizationId] !== true;
    const lastError = sch?.lastError ?? null;
    return {
      siteId: s.id, siteName: s.name, organizationId: s.organizationId, orgName: s.orgName,
      enabled: sch?.enabled === true, dailyLimit: sch?.dailyLimit ?? null, lastError,
      topicGate: aiPicksTopics(s.defaults ?? undefined) ? "ai" : "human",
      publishGate: autoPublishes(s.defaults ?? undefined) ? "auto" : "human",
      proposedThisMonth: mine.some((t) => t.source !== "manual"),
      attemptedAt: s.attemptedAt,
      pending: mine.filter((t) => t.status === "proposed").length,
      inProgress: mine.filter((t) => IN_PROGRESS.has(t.status)).length,
      failed, notOpened, spendUsd: input.spendUsd[s.organizationId] ?? 0,
      problem: Boolean(lastError) || failed > 0 || notOpened,
    };
  });
  const rank = (r: OverviewRow) => (r.problem ? 0 : r.pending > 0 ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b) || a.orgName.localeCompare(b.orgName, "zh-Hant") || a.siteName.localeCompare(b.siteName, "zh-Hant"));
}

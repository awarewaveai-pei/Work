// Site-watch knobs. C-numbers refer to agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md §4.
import type { IncidentSeverity } from "@/lib/ops-inbox/types";

/**
 * C8 severity per check kind — the ONE source for both the incident row and the Telegram gate
 * (meetsMinSeverity), so the two can never disagree. Visual is `low` (operator D1, 2026-09-23): below
 * the default OPS_INBOX_TELEGRAM_NOTIFY_MIN_SEVERITY `medium`, a visual episode opens an incident and
 * records its Telegram as `skipped`. Raise to `medium` when slice 2 adds per-page mask selectors.
 */
export function severityFor(kind: "availability" | "visual"): IncidentSeverity {
  return kind === "availability" ? "high" : "low";
}

/** C10 global kill switch. Default OFF (AGENTS.md §0): unset/anything else = no renderer call at all. */
export function siteWatchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SITE_WATCH_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}

/**
 * C12: screenshots live in a PRIVATE bucket. No default on purpose — the only other bucket this app
 * knows (R2_DESIGNS_BUCKET) is publicly served, and a client's screenshots must never land there.
 * Unset = visual comparison is skipped (availability checks still run).
 */
export function siteWatchBucket(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.R2_SITE_WATCH_BUCKET?.trim() || null;
}

/** C6 per-pixel colour distance (pixelmatch threshold). */
export const PIXEL_THRESHOLD = 0.1;
/** C6 share of differing pixels above which a page counts as visually changed. */
export const VISUAL_DIFF_RATIO = 0.05;
/** C9 retention for result rows and evidence images. */
export const RETENTION_DAYS = 30;
/** C9 an unreferenced evidence object younger than this may belong to a write still in flight. */
export const ORPHAN_GRACE_MS = 24 * 3600 * 1000;

/**
 * C3 lease window: per page (15s load + 15s idle + 30s screenshot + 10s slack + ~20s storage/diff)
 * plus room for the notification step, floor 5 min (slice 1 single page), cap 15 min.
 */
export function leaseWindowSeconds(pageCount: number): number {
  return Math.min(900, Math.max(300, pageCount * 90 + 120));
}

/** C3/I1: an external send may start only if the lease outlives its hard timeouts plus 30s. */
export function minLeaseForSend(chatCount: number, perChatTimeoutMs: number): number {
  return Math.max(1, chatCount) * (perChatTimeoutMs / 1000) + 30;
}

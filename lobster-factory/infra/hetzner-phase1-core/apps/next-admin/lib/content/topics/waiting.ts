// What waits for a person (the daily schedule report's content line) and which proposals have waited too long.
// Pure. 過期 is lanes.ts' definition (proposed, its day already past); the 7-day return is that, seven days on.
import { laneCounts } from "./lanes";
import { zoned } from "@/lib/social/time";

type Row = { status: string; scheduled_for: string | null; updated_at: string };

/** A proposal whose day passed this long ago is returned by the pipeline tick (plan N7, O2). */
export const PROPOSAL_EXPIRE_MS = 7 * 24 * 3600 * 1000;
/** Days a topic may wait for a person before the daily report marks it red. */
export const WAIT_RED_DAYS = 3;

export const expiredReason = (scheduledFor: string) =>
  `排定日 ${zoned(new Date(scheduledFor), "Asia/Taipei").date} 過了七天沒人核准，已退回；要做請改日期再核准`;

/** proposed whose scheduled_for is more than seven days behind `now`. */
export function isExpiredProposal(t: Pick<Row, "status" | "scheduled_for">, now: Date): boolean {
  return t.status === "proposed" && !!t.scheduled_for && Date.parse(t.scheduled_for) < now.getTime() - PROPOSAL_EXPIRE_MS;
}

export interface Waiting { proposed: number; overdue: number; reviewed: number; oldestDays: number; red: boolean }

/** proposed = waiting for approval (overdue ones included, counted again in `overdue`); reviewed = waiting for publish.
 *  Age runs from the row's last move (updated_at). Nothing is sent or changed from here: red is only a mark in the report. */
export function waitingSummary(topics: Row[], now: Date): Waiting {
  const w = topics.filter((t) => t.status === "proposed" || t.status === "reviewed");
  const oldest = w.reduce((m, t) => Math.max(m, now.getTime() - Date.parse(t.updated_at)), 0);
  const oldestDays = Math.floor(oldest / 86_400_000);
  return {
    proposed: w.filter((t) => t.status === "proposed").length,
    overdue: laneCounts(w, now).overdue,
    reviewed: w.filter((t) => t.status === "reviewed").length,
    oldestDays,
    red: oldestDays >= WAIT_RED_DAYS,
  };
}

/** Null when nothing waits (no line). */
export function waitingLine(s: Waiting): string | null {
  if (!s.proposed && !s.reviewed) return null;
  const over = s.overdue ? `（其中 ${s.overdue} 題已過排定日）` : "";
  return `${s.red ? "🔴 " : ""}內容：等核准 ${s.proposed} 題${over}、等發布 ${s.reviewed} 題，最舊等了 ${s.oldestDays} 天`;
}

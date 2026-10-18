// The composer's pure pieces (SOCIAL_MANAGER_PLAN.md C21): the actions of the main button, comment delays, the repeat
// and time wording, and each channel's text as the sender composes it. No React, no fetch.
import { composeText } from "@/lib/social/compose";
import type { RepeatRule } from "@/lib/social/repeat-rule";
import { weekday, WEEKDAY_NAMES, type Account } from "../model";

/** ▾ of the main button (mock #menu); keep = a post in an autolist saves and stays there (lists are added to in their tab) */
export type Act = "draft" | "library" | "review" | "schedule" | "repeat" | "now" | "keep";
export const ACTS: Array<{ key: Exclude<Act, "keep">; label: string; help: string }> = [
  { key: "draft", label: "存草稿", help: "先存著，之後再排時間" },
  { key: "library", label: "存到素材庫", help: "把文字存起來，之後重複用" },
  { key: "review", label: "送審", help: "給審核人看，核准後照設定的時間發" },
  { key: "schedule", label: "設定行程", help: "到了設定的時間自動發一次" },
  { key: "repeat", label: "週期性安排", help: "照固定頻率重複發同一則，例如每週一 10:00" },
  { key: "now", label: "立即發佈", help: "不等時間，按了就發" },
];
export const actLabel = (a: Act) => (a === "keep" ? "儲存" : ACTS.find((x) => x.key === a)?.label ?? a);

/** 0105 delay_minutes; Postiz waits this long before the comment, after the one above it (lib/social/compose.ts) */
export const DELAYS = [0, 1, 5, 60] as const;
export type Delay = (typeof DELAYS)[number];
export const nextDelay = (d: Delay): Delay => DELAYS[(DELAYS.indexOf(d) + 1) % DELAYS.length];
export function delayText(d: number, first: boolean): string {
  if (!d) return first ? "貼文發出後立刻留" : "緊接著上一則留";
  return `${first ? "貼文發出後" : "上一則留完"} ${d < 60 ? `${d} 分鐘` : `${d / 60} 小時`}後留`;
}

export interface CommentDraft { key: number; body: string; delay: Delay; media_id: string | null }

/** The text a channel shows: its own or the shared one, with the link (and UTM) as the sender adds it. A link that is
 *  not a full address yet shows as typed (the save refuses it with the reason). */
export function channelText(a: Account, body: string, custom: Record<string, string>, link: string, utm: boolean): string {
  const input = { body, customBody: custom[a.id] ?? null, linkUrl: link.trim() || null, linkUtm: utm, platform: a.platform };
  try {
    return composeText(input);
  } catch {
    return composeText({ ...input, linkUtm: false });
  }
}

/** A new repeat rule: weekly on the post's weekday, until stopped (mock newRepeat). */
export const newRepeat = (date: string): RepeatRule => ({ freq: "week", days: [weekday(date)], mday: Number(date.slice(8, 10)), end: "never", count: 8 });

/** Only the keys the rule's frequency and end use (lib/social/repeat-rule.ts parseRepeat stores what it is given). */
export function cleanRepeat(r: RepeatRule): RepeatRule {
  return {
    freq: r.freq, end: r.end,
    ...(r.freq === "week" ? { days: [...(r.days ?? [])].sort((a, b) => a - b) } : {}),
    ...(r.freq === "month" ? { mday: r.mday } : {}),
    ...(r.end === "count" ? { count: r.count } : {}),
  };
}

export function whenText(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日（${WEEKDAY_NAMES[weekday(date) - 1]}）${time}`;
}

export function repeatText(r: RepeatRule, date: string, time: string): string {
  const how = r.freq === "day" ? "每天" : r.freq === "week" ? `每週${(r.days ?? []).slice().sort((a, b) => a - b).map((n) => WEEKDAY_NAMES[n - 1]).join("、")}` : `每月 ${r.mday} 號`;
  const [, m, d] = date.split("-").map(Number);
  return `${how} ${time}（${m}/${d} 起${r.end === "count" ? `，共 ${r.count} 次` : ""}）`;
}

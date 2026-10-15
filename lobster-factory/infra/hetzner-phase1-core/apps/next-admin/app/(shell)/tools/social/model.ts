// Pure helpers for the social manager page (SOCIAL_MANAGER_PLAN.md C6): the brand's time zone, the calendar's dates,
// the platform marks and the state names. No React, no fetch: tested in __tests__/model.test.ts.
// Dates are "YYYY-MM-DD" strings in the BRAND's time zone (organizations.default_timezone), never the viewer's.
import type { PostState } from "@/lib/social/state";

export interface Brand { id: string; slug: string; name: string; default_timezone: string; role: "owner" | "editor" | "reviewer" | "client" }
export interface Account { id: string; platform: string; label: string; status: "connected" | "expired" | "disabled"; postiz_integration_id: string }
export interface Target { id: string; account_id: string; custom_body: string | null; format: string; state: string; postiz_post_id: string | null; release_url: string | null; error: string | null }
export interface MediaLink { media_id: string; position: number; alt_text: string | null }
export interface Post {
  id: string; state: PostState; body: string; scheduled_at: string | null; list_id: string | null; list_position: number | null;
  first_comment: string | null; link_url: string | null; link_utm: boolean; notes: string | null; source_url: string | null;
  published_at: string | null; deleted_at: string | null; created_by: string; version: number;
  targets: Target[]; media: MediaLink[];
}

/** Platform marks: the letter and the --p-* token (globals.css). An unknown platform gets the neutral mark. */
export const PLATFORMS: Record<string, { name: string; mark: string; token: string }> = {
  facebook: { name: "Facebook", mark: "f", token: "--p-fb" },
  instagram: { name: "Instagram", mark: "IG", token: "--p-ig" },
  "instagram-standalone": { name: "Instagram", mark: "IG", token: "--p-ig" },
  threads: { name: "Threads", mark: "@", token: "--p-th" },
  linkedin: { name: "LinkedIn", mark: "in", token: "--p-li" },
  "linkedin-page": { name: "LinkedIn", mark: "in", token: "--p-li" },
  bluesky: { name: "Bluesky", mark: "B", token: "--p-bs" },
  x: { name: "X", mark: "X", token: "--p-x" },
  wordpress: { name: "WordPress", mark: "W", token: "--p-wp" },
};
export const platformOf = (p: string) => PLATFORMS[p] ?? { name: p, mark: p.slice(0, 2), token: "--status-ignored" };

/** Formats the sender can send per platform (lib/social/compose.ts SETTINGS); everything else is a plain post. */
export const FORMATS: Record<string, Array<{ key: string; label: string }>> = {
  instagram: [{ key: "post", label: "貼文" }, { key: "story", label: "限時動態" }],
  "instagram-standalone": [{ key: "post", label: "貼文" }, { key: "story", label: "限時動態" }],
  facebook: [{ key: "post", label: "貼文" }, { key: "story", label: "限時動態" }],
};
export const formatsOf = (p: string) => FORMATS[p] ?? [{ key: "post", label: "貼文" }];

export const STATE_NAMES: Record<PostState, string> = {
  draft: "草稿", review: "待審核", scheduled: "已排程", queued: "送出中", published: "已發佈", error: "發佈失敗", rotation: "輪播中", deleted: "已刪除",
};
/** ADR 016 §5: state -> app colour token. queued is scheduled's colour (it is a scheduled post on its way). */
export const STATE_TOKEN: Record<PostState, string> = {
  draft: "--status-ignored", review: "--severity-low", scheduled: "--yellow", queued: "--yellow", published: "--green", error: "--red",
  rotation: "--accent", deleted: "--text-muted",
};

// ---- dates in a time zone (lib/social/time.ts: one copy for the server's rotation slots and this page) -----------

import { addDays, weekday } from "@/lib/social/time";
export { addDays, instantAt, weekday, zoned, type ZonedParts } from "@/lib/social/time";

export const mondayOf = (date: string) => addDays(date, 1 - weekday(date));
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
/** The month grid: six weeks from the Monday on or before the 1st. */
export const monthGridStart = (date: string) => mondayOf(monthStart(date));

export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

export const WEEKDAY_NAMES = ["一", "二", "三", "四", "五", "六", "日"];

/** A drop or a click in the week grid: minutes from midnight -> "HH:MM" on the half hour. */
export function slotTime(minutes: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 30, Math.floor(minutes / 30) * 30));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** What a post's targets say right now, for the editor's hints. */
export function targetProblems(post: Post, accounts: Account[]): string[] {
  const out: string[] = [];
  for (const t of post.targets) {
    const a = accounts.find((x) => x.id === t.account_id);
    const name = a ? platformOf(a.platform).name : "已移除的帳號";
    if (t.state === "error" && t.error) out.push(`${name}：${t.error}`);
    if (a && a.status !== "connected" && !["published"].includes(t.state)) out.push(`${name} 連線失效，要先到設定重新連接`);
  }
  return out;
}

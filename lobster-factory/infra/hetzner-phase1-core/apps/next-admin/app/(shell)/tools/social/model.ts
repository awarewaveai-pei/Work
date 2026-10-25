// Pure helpers for the social manager page (SOCIAL_MANAGER_PLAN.md C6): the brand's time zone, the calendar's dates,
// the platform marks and the state names. No React, no fetch: tested in __tests__/model.test.ts.
// Dates are "YYYY-MM-DD" strings in the BRAND's time zone (organizations.default_timezone), never the viewer's.
import type { BrandRole, PostState } from "@/lib/social/state";
import { repeatSlots, type RepeatRule } from "@/lib/social/repeat-rule";

export interface Brand { id: string; slug: string; name: string; default_timezone: string; role: "owner" | "editor" | "reviewer" | "client" }
/** picture / handle: null = not looked up yet, "" = the platform has none (migration 0105) */
export interface Account {
  id: string; platform: string; label: string; status: "connected" | "expired" | "disabled"; postiz_integration_id: string;
  picture: string | null; handle: string | null; chatwoot_inbox_id: number | null;
}
export interface Target { id: string; account_id: string; custom_body: string | null; format: string; state: string; postiz_post_id: string | null; release_url: string | null; error: string | null }
export interface MediaLink { media_id: string; position: number; alt_text: string | null }
/** arrives unordered: sort by position (position 0 = first_comment) */
export interface PostComment { position: number; body: string; delay_minutes: number; media_id: string | null }
export type { RepeatRule };
export type AutoMode = "brand" | "none" | "own";
/** colour = a token key: a --red, b --accent, c --green, d --yellow, e --p-li */
export interface Tag { id: string; name: string; colour: "a" | "b" | "c" | "d" | "e" }
export interface Post {
  id: string; state: PostState; body: string; scheduled_at: string | null; list_id: string | null; list_position: number | null;
  first_comment: string | null; link_url: string | null; link_utm: boolean; notes: string | null; source_url: string | null;
  published_at: string | null; deleted_at: string | null; version: number;
  /** a series template holds repeat; its children carry repeat_of + origin_slot (a computed occurrence with a child is that child) */
  repeat: RepeatRule | null; repeat_of: string | null; origin_slot: string | null; auto_mode: AutoMode;
  targets: Target[]; media: MediaLink[]; comments: PostComment[]; tags: Array<{ tag_id: string }>;
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
  youtube: { name: "YouTube", mark: "YT", token: "--p-yt" },
  wordpress: { name: "WordPress", mark: "W", token: "--p-wp" },
};
export const platformOf = (p: string) => PLATFORMS[p] ?? { name: p, mark: p.slice(0, 2), token: "--status-ignored" };

/** Formats per platform (lib/social/compose.ts SETTINGS); everything else is a plain post. `off` = drawn, not sendable
 *  yet, with the reason shown (LinkedIn's document carousel, C21 card). A Reel is a post with one video (compose.ts). */
export const FORMATS: Record<string, Array<{ key: string; label: string; off?: string }>> = {
  instagram: [{ key: "post", label: "貼文" }, { key: "reel", label: "Reel" }, { key: "story", label: "限時動態" }],
  "instagram-standalone": [{ key: "post", label: "貼文" }, { key: "reel", label: "Reel" }, { key: "story", label: "限時動態" }],
  facebook: [{ key: "post", label: "貼文" }, { key: "reel", label: "Reel" }, { key: "story", label: "限時動態" }],
  linkedin: [{ key: "post", label: "貼文" }, { key: "document", label: "文件輪播", off: "文件輪播要上傳 PDF，一頁一張。這個功能還沒開放。" }],
  "linkedin-page": [{ key: "post", label: "貼文" }, { key: "document", label: "文件輪播", off: "文件輪播要上傳 PDF，一頁一張。這個功能還沒開放。" }],
};
export const formatsOf = (p: string) => FORMATS[p] ?? [{ key: "post", label: "貼文" }];

export const ROLE_NAMES: Record<BrandRole, string> = { owner: "擁有者", editor: "編輯", reviewer: "審核人", client: "唯讀" };
/** What a person who may not write sees where the new-post editor would be (copy by GPT, agency-os/reports/oracle/
 *  2026-10-16-inspect-3f5d29af.md). null = may write. An account an invitation created has no brand role yet = client. */
export function cannotWriteNotice(role: BrandRole): string | null {
  if (role === "reviewer") return "你可以在這裡閱讀貼文。你可以核准或退回待審核的貼文。品牌擁有者可以在設定 → 成員中將你的角色改為編輯，讓你取得發文權限。";
  if (role === "client") return "你只能在這裡閱讀貼文。你可以查看紀錄。品牌擁有者可以在設定 → 成員中將你的角色改為編輯，讓你取得發文權限。";
  return null;
}
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
/** The 1st of the month n months from `date`'s (n may be negative). */
export function addMonths(date: string, n: number): string {
  const m = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 + n;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`;
}
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

// ---- the calendar's computed rows (C22) ---------------------------------------------------------------------------

/** A post as the calendar shows it: a real one, or a computed occurrence of a repeat series (occurrenceOf = its template,
 *  which is what a click opens). */
export type CalPost = Post & { occurrenceOf?: string };

/** The states a template makes children in (0105 social_repeat_materialize), and a deleted one that was published: anything else repeats nothing yet. */
const SERIES_STATES: readonly PostState[] = ["scheduled", "queued", "published", "error"];

/** The times a series will have a child at, in [from, until), that the database has no child for yet (server and page
 *  share lib/social/repeat-rule.ts repeatSlots). `taken` = `${template id}@${origin_slot ms}` of every child in ANY state,
 *  deleted ones too: a slot whose child a person moved or deleted is never made again (0105 unique (repeat_of, origin_slot)). */
export function occurrences(template: Post, tz: string, now: Date, from: Date, until: Date, taken: ReadonlySet<string>): CalPost[] {
  const makes = SERIES_STATES.includes(template.state) || (template.state === "deleted" && !!template.published_at);   // 0105 header
  if (!template.repeat || !template.scheduled_at || !makes) return [];
  const days = Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 86_400_000));
  return repeatSlots(template.repeat, template.scheduled_at, tz, now, days)
    .filter((slot) => Date.parse(slot) >= from.getTime() && Date.parse(slot) < until.getTime() && !taken.has(`${template.id}@${Date.parse(slot)}`))
    .map((slot) => ({
      ...template, id: `${template.id}@${slot}`, state: "scheduled" as const, scheduled_at: slot, repeat: null, repeat_of: template.id, origin_slot: slot,
      occurrenceOf: template.id, version: 0,
    }));
}

/** `taken` for occurrences(): the children among `posts` and `deleted`. */
export function takenSlots(...lists: Post[][]): Set<string> {
  const out = new Set<string>();
  for (const l of lists) for (const p of l) if (p.repeat_of && p.origin_slot) out.add(`${p.repeat_of}@${Date.parse(p.origin_slot)}`);
  return out;
}

/** Best times per platform (SOCIAL_MANAGER_PLAN.md C22; the mock's BEST): reference values until social_metrics_daily
 *  has enough days to compute a brand's own. */
const BEST: Record<string, [string, string]> = { bluesky: ["12:00", "20:00"], facebook: ["13:00", "20:00"], instagram: ["11:00", "19:00"], threads: ["09:00", "21:00"], linkedin: ["08:00", "12:00"] };
const BEST_ALIAS: Record<string, string> = { "instagram-standalone": "instagram", "linkedin-page": "linkedin" };
export const bestKey = (platform: string) => { const k = BEST_ALIAS[platform] ?? platform; return k in BEST ? k : null; };
/** The platform keys that have best times among these account platforms, in first-seen order. */
export const bestPlatforms = (platforms: string[]) => [...new Set(platforms.map(bestKey).filter((k): k is string => !!k))];
/** A day's best times for a platform; on a weekend the mock offers one, an hour after the first. */
export function bestFor(platform: string, date: string): string[] {
  const t = BEST[bestKey(platform) ?? ""];
  if (!t) return [];
  if (weekday(date) < 6) return [...t];
  return [`${String(Number(t[0].slice(0, 2)) + 1).padStart(2, "0")}${t[0].slice(2)}`];
}

/** A tag's colour key (model Tag.colour) -> the app token (the mock's .tg-a .. .tg-e). */
export const TAG_TOKEN: Record<Tag["colour"], string> = { a: "--red", b: "--accent", c: "--green", d: "--yellow", e: "--p-li" };

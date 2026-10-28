// content_topics (migration 0121): one row = one piece of content a brand will make. Every status change goes through
// move(): the allowed-transition table below, and an UPDATE guarded by the status and version the caller read, so two
// sweeps (or a sweep and a button) never move the same row twice. DB errors throw: for a queue, "no rows" must never
// stand in for "could not read" (same rule as lib/schedules/store.ts).
import type { SupabaseClient } from "@supabase/supabase-js";

export const TOPIC_STATUSES = ["proposed", "approved", "rejected", "generating", "drafted", "waiting_video", "embedded",
  "reviewed", "scheduled", "published", "failed"] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];
export const TOPIC_FORMATS = ["article", "social", "video", "youtube"] as const;
export type TopicFormat = (typeof TOPIC_FORMATS)[number];
export type TopicSource = "trending" | "kb" | "plan" | "manual";

/** Where a topic may go from each status (AUTO_CONTENT_EXECUTION_PLAN.md §3.2). Anything else is refused before the DB. */
export const NEXT: Readonly<Record<TopicStatus, readonly TopicStatus[]>> = {
  proposed: ["approved", "rejected"],
  rejected: ["proposed"],
  approved: ["proposed", "generating"],
  generating: ["drafted", "failed"],
  drafted: ["waiting_video", "reviewed", "failed"],
  waiting_video: ["embedded", "failed"],
  embedded: ["reviewed", "failed"],
  reviewed: ["scheduled", "published", "failed"],
  scheduled: ["published", "failed"],
  published: [],
  failed: ["approved"],
};

export interface Topic {
  id: string;
  organization_id: string;
  site_id: string | null;
  title: string;
  keyword: string;
  angle: string | null;
  source: TopicSource;
  source_ref: Record<string, unknown>;
  month: string;
  scheduled_for: string | null;
  formats: TopicFormat[];
  status: TopicStatus;
  artifacts: Record<string, unknown>;
  review: Record<string, unknown> | null;
  version: number;
  last_error: string | null;
  started_on: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface NewTopic {
  organization_id: string;
  site_id: string | null;
  title: string;
  keyword: string;
  angle?: string | null;
  source: TopicSource;
  source_ref?: Record<string, unknown>;
  month: string;              // YYYY-MM-01
  scheduled_for?: string | null;
  formats?: TopicFormat[];
  created_by: string;
}

const fail = (what: string, e: { message: string }): never => { throw new Error(`content_topics:${what}:${e.message}`); };

/** "YYYY-MM" naming a real month (01-12): what the topic routes accept. */
export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** "2026-11" or any date in the month -> "2026-11-01". */
export function monthKey(d: string | Date): string {
  const s = typeof d === "string" ? d : d.toISOString();
  if (!isMonth(s.slice(0, 7))) throw new Error(`content_topics:bad_month:${s}`);
  return `${s.slice(0, 7)}-01`;
}

/** Taipei is UTC+8 all year (no DST): a topic's time is chosen and shown in Taipei time, stored as UTC. */
const TAIPEI_MS = 8 * 60 * 60 * 1000;
export const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
/** A stored time as the Taipei month ("YYYY-MM"), day and hour it was picked as. */
export function taipeiParts(iso: string): { month: string; day: number; hour: number } {
  const d = new Date(Date.parse(iso) + TAIPEI_MS);
  return { month: d.toISOString().slice(0, 7), day: d.getUTCDate(), hour: d.getUTCHours() };
}
/** A Taipei month / day / hour as the UTC time stored in scheduled_for. */
export function fromTaipei(month: string, day: number, hour: number): string {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, day, hour) - TAIPEI_MS).toISOString();
}

/** Most keywords one "add many" call takes (POST /api/content/topics { keywords }). */
export const MAX_BULK_TOPICS = 30;
/** `n` days spread evenly from `fromDay` to the month's end; more topics than remaining days share a day. */
export function spreadDays(month: string, n: number, fromDay: number): number[] {
  const span = daysIn(month) - fromDay + 1;
  return Array.from({ length: n }, (_, i) => fromDay + Math.floor((i * span) / n));
}

export async function listTopics(sb: SupabaseClient, organizationId: string, month: string): Promise<Topic[]> {
  const { data, error } = await sb.from("content_topics").select("*")
    .eq("organization_id", organizationId).eq("month", monthKey(month)).order("scheduled_for", { ascending: true, nullsFirst: false });
  if (error) fail("list", error);
  return (data ?? []) as Topic[];
}

/** One topic by id, any organization: the caller checks access on topic.organization_id before using it. */
export async function topicById(sb: SupabaseClient, id: string): Promise<Topic | null> {
  const { data, error } = await sb.from("content_topics").select("*").eq("id", id).maybeSingle();
  if (error) fail("get", error);
  return (data as Topic | null) ?? null;
}

/** The topic a WordPress post was made from, keyed `siteId:postId`. The calendar uses it to route a made article's date change
 *  through the topic (B12: its date lives in scheduled_for, not in WordPress). */
export async function topicsByWpPost(sb: SupabaseClient, orgId: string, siteIds: string[], postIds: number[]): Promise<Map<string, Topic>> {
  const out = new Map<string, Topic>();
  if (!siteIds.length || !postIds.length) return out;
  const { data, error } = await sb.from("content_topics").select("*").eq("organization_id", orgId).in("site_id", siteIds)
    .in("artifacts->article->>wp_post_id", postIds.map(String));
  if (error) fail("by_wp_post", error);
  for (const t of (data ?? []) as Topic[]) {
    const id = (t.artifacts as { article?: { wp_post_id?: number | null } }).article?.wp_post_id;
    if (t.site_id && id) out.set(`${t.site_id}:${id}`, t);
  }
  return out;
}

/** Inserts new topics; a keyword the brand already has that month is skipped, not an error. Returns what was added. */
export async function proposeTopics(sb: SupabaseClient, rows: NewTopic[]): Promise<Topic[]> {
  if (!rows.length) return [];
  const clean = rows.map((r) => ({ ...r, month: monthKey(r.month), keyword: r.keyword.trim(), title: r.title.trim() }));
  const { data, error } = await sb.from("content_topics")
    .upsert(clean, { onConflict: "organization_id,month,keyword", ignoreDuplicates: true }).select("*");
  if (error) fail("propose", error);
  return (data ?? []) as Topic[];
}

export class TopicMoveRefused extends Error {}

/**
 * Moves one topic from the status and version the caller read to `to`, with optional field changes. Returns the
 * updated row, or null when someone else moved it first (the caller re-reads; nothing is retried here).
 */
export async function move(sb: SupabaseClient, t: Pick<Topic, "id" | "organization_id" | "status" | "version">, to: TopicStatus,
  patch: Partial<Pick<Topic, "artifacts" | "review" | "last_error" | "scheduled_for" | "formats">> = {}): Promise<Topic | null> {
  if (!NEXT[t.status].includes(to)) throw new TopicMoveRefused(`${t.status} -> ${to} is not a topic move`);
  if (to === "generating") throw new TopicMoveRefused("approved -> generating goes through startTopic (daily cap)");
  // an error longer than the column's 500 would fail the very write that records it and leave the row stuck
  const fields = { ...patch, ...(typeof patch.last_error === "string" ? { last_error: patch.last_error.slice(0, 500) } : {}) };
  const { data, error } = await sb.from("content_topics")
    .update({ ...fields, status: to, version: t.version + 1, updated_at: new Date().toISOString() })
    .eq("id", t.id).eq("organization_id", t.organization_id).eq("status", t.status).eq("version", t.version)
    .select("*");
  if (error) fail("move", error);
  return ((data ?? []) as Topic[])[0] ?? null;
}

/** Takes a row for a step that writes outside the database (auto publish): bumps the version it was read at, status
 *  unchanged. null = another caller took it first; only the winner goes on to the outside write. */
export async function claimTopic(sb: SupabaseClient, t: Pick<Topic, "id" | "organization_id" | "status" | "version">,
  patch: Partial<Pick<Topic, "artifacts">> = {}): Promise<Topic | null> {
  const { data, error } = await sb.from("content_topics")
    .update({ ...patch, version: t.version + 1, updated_at: new Date().toISOString() })
    .eq("id", t.id).eq("organization_id", t.organization_id).eq("status", t.status).eq("version", t.version)
    .select("*");
  if (error) fail("claim", error);
  return ((data ?? []) as Topic[])[0] ?? null;
}

/** Changes what will be made, only while nothing is made yet (proposed / approved); same status and version guard as move. */
export async function setFormats(sb: SupabaseClient, t: Pick<Topic, "id" | "organization_id" | "status" | "version">, formats: TopicFormat[]): Promise<Topic | null> {
  if (!["proposed", "approved"].includes(t.status)) throw new TopicMoveRefused(`formats are fixed once a topic is ${t.status}`);
  const clean = [...new Set(formats)].filter((f) => (TOPIC_FORMATS as readonly string[]).includes(f));
  if (!clean.length) throw new TopicMoveRefused("a topic needs at least one format");
  const { data, error } = await sb.from("content_topics")
    .update({ formats: clean, version: t.version + 1, updated_at: new Date().toISOString() })
    .eq("id", t.id).eq("organization_id", t.organization_id).eq("status", t.status).eq("version", t.version)
    .select("*");
  if (error) fail("formats", error);
  return ((data ?? []) as Topic[])[0] ?? null;
}

/** Whether a person may move the topic's time now. Never a row the publisher may be holding: it claims a 'scheduled' row
 *  (version bump, status unchanged) once its time has passed, writes to WordPress and the social tool, then moves it by
 *  that version -- a change in between would leave it published but recorded as waiting, and publish it again later.
 *  'reviewed' is claimed in passing inside one tick, so it is not movable at all; a manual site's reviewed draft does
 *  not publish by itself, so its time means nothing. While a topic is being made (generating .. embedded) its maker
 *  moves it by the version it read, so a change then would strand the making; published is done. */
export function canReschedule(t: Pick<Topic, "status" | "scheduled_for">, now: Date): boolean {
  if (t.status === "scheduled") return !!t.scheduled_for && Date.parse(t.scheduled_for) > now.getTime();
  return (["proposed", "approved", "rejected", "failed"] as TopicStatus[]).includes(t.status);
}

/** Moves a topic to another time (and the month it falls in, Taipei); same status and version guard as move. A topic
 *  waiting to publish ('scheduled') goes out at the new time; one moved into the past goes out at the next check. */
export async function reschedule(sb: SupabaseClient, t: Pick<Topic, "id" | "organization_id" | "status" | "version" | "scheduled_for">, scheduledFor: string): Promise<Topic | null> {
  const now = new Date();
  if (!canReschedule(t, now)) throw new TopicMoveRefused(t.status === "scheduled" ? "已經到排定時間，正在發布，不能改" : `the time is fixed while a topic is ${t.status}`);
  let q = sb.from("content_topics")
    .update({ scheduled_for: scheduledFor, month: monthKey(taipeiParts(scheduledFor).month), version: t.version + 1, updated_at: now.toISOString() })
    .eq("id", t.id).eq("organization_id", t.organization_id).eq("status", t.status).eq("version", t.version);
  // checked again in the write: its time may pass between the read and here
  if (t.status === "scheduled") q = q.gt("scheduled_for", now.toISOString());
  const { data, error } = await q.select("*");
  // (organization_id, month, keyword) is unique: that month already has this keyword
  if (error?.code === "23505") throw new TopicMoveRefused("那個月已經有同一個關鍵字的題目");
  if (error) fail("reschedule", error);
  return ((data ?? []) as Topic[])[0] ?? null;
}

/**
 * approved -> generating within the brand's daily cap (plan I8): one database call that locks the organization,
 * counts the day's starts and moves the row only if still under the cap and still at the version read (0121
 * content_topics_start). null = cap reached or someone else moved it.
 */
export async function startTopic(sb: SupabaseClient, t: Pick<Topic, "id" | "organization_id" | "version">, day: string, cap: number): Promise<Topic | null> {
  const { data, error } = await sb.rpc("content_topics_start", { p_org: t.organization_id, p_id: t.id, p_version: t.version, p_day: day, p_cap: cap });
  if (error) fail("start", error);
  return ((data ?? []) as Topic[])[0] ?? null;
}

/** How many topics of a brand left 'approved' on this UTC day (the daily cap, plan I8). */
export async function startedOn(sb: SupabaseClient, organizationId: string, day: string): Promise<number> {
  const { count, error } = await sb.from("content_topics").select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId).eq("started_on", day);
  if (error) fail("started_on", error);
  return count ?? 0;
}

/** What a sweep may start now: approved, its day reached or none set, making one of `formats`, earliest first. The format
 *  filter is in the query, before the limit: topics nobody can make yet must not fill the page and hide the rest. */
export async function dueApproved(sb: SupabaseClient, organizationId: string, now: Date, formats: TopicFormat[], limit = 10): Promise<Topic[]> {
  const { data, error } = await sb.from("content_topics").select("*")
    .eq("organization_id", organizationId).eq("status", "approved").overlaps("formats", formats)
    .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)
    .order("scheduled_for", { ascending: true, nullsFirst: true }).limit(limit);
  if (error) fail("due", error);
  return (data ?? []) as Topic[];
}

/** A brand's topics in these statuses (the sweep's in-progress rows). */
export async function inStatus(sb: SupabaseClient, organizationId: string, statuses: TopicStatus[]): Promise<Topic[]> {
  const { data, error } = await sb.from("content_topics").select("*").eq("organization_id", organizationId).in("status", statuses);
  if (error) fail("in_status", error);
  return (data ?? []) as Topic[];
}

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

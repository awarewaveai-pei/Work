// Channel numbers for 數據分析 (SOCIAL_MANAGER_PLAN.md C24; tables 0105 social_metrics_daily / social_post_metrics).
// G6 (WORKLOG 2026-10-18): Postiz v2.25.1 GET /public/v1/analytics/{integration} answers for Facebook pages only
// (Bluesky answers []), so Facebook comes through Postiz and Bluesky from its public API (no login); every other
// platform waits for its analytics review. A number a platform does not give stays null and the page says why --
// never a made-up 0. The daily task social-metrics (POST /api/internal/social/metrics) takes the snapshot; fetching a
// day again overwrites the fields the fetch brings and keeps the others (mergeDays).
// Days are "YYYY-MM-DD". Bluesky's are the brand's days; Facebook's are Facebook's own (Pacific) days.

import type { SupabaseClient } from "@supabase/supabase-js";
import { accountAnalytics, postAnalytics, type PostizAnalyticsSeries } from "@/lib/content/postiz";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { selectAll } from "@/lib/supabase-paging";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { SocialStoreError } from "./store";
import { addDays, instantAt, zoned } from "./time";

export const STORED = ["followers", "reach", "impressions", "engagement", "posts"] as const;
export type Stored = (typeof STORED)[number];
/** the page's six cards, in the mock's order (rate = engagement / reach, computed) */
export const METRICS = ["followers", "reach", "impressions", "engagement", "rate", "posts"] as const;
export type Metric = (typeof METRICS)[number];
export type DayValues = Record<Stored, number | null>;
export interface DayRow extends DayValues { account_id: string; day: string }
export const PERIODS = [7, 28, 90] as const;

/** Every run fetches the longest period again (late Facebook counts; Bluesky engagement keeps growing; a cut-short first
 *  run heals itself): the upsert merge makes that safe. */
export const BACKFILL_DAYS = 90;
const POOL = 5;               // post-number fetches at once
const DEADLINE_MS = 240_000;  // no new post fetch after this long into a run (the route has 300 s)
const SNAPSHOT_POSTS = 200;   // newest targets per channel

/** Why a channel has no value for a field; null = it has one (or will, once collected). Shown on the page as is. */
export function missingReason(platform: string, field: Stored): string | null {
  if (platform === "facebook") {
    if (field === "followers") return "Postiz 只提供每天新增的追蹤數，沒有追蹤者總數";
    if (field === "posts") return "Postiz 沒有提供每天的發文數";
    return null;
  }
  if (platform === "bluesky") return field === "reach" || field === "impressions" ? "Bluesky 不提供觸及和曝光數" : null;
  return "要等這個平台審核通過分析權限";
}
export const collects = (platform: string) => platform === "facebook" || platform === "bluesky";

const emptyDay = (): DayValues => ({ followers: null, reach: null, impressions: null, engagement: null, posts: null });
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const count = (v: unknown): number | null => {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;   // Number("") is 0: missing must stay null
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

// ---- Facebook through Postiz ------------------------------------------------------------------------------------

/** Postiz's labels (facebook.provider.js analytics): Page Impressions = page_total_media_view_unique (people reached),
 *  Media views = page_media_view, Posts Engagement = page_post_engagements. Page followers = page_daily_follows, new
 *  follows a day, not the total: not stored (missingReason). */
const FB_FIELD: Record<string, Stored> = { "Page Impressions": "reach", "Media views": "impressions", "Posts Engagement": "engagement" };

/** `date` is Facebook's end_time printed in UTC, so the day measured is the day before; a Pacific day ends by 08:00
 *  UTC, and one whose end has not passed is still counting (its 0 is not a number yet): left out. */
export function facebookDays(series: PostizAnalyticsSeries[], now: Date): Map<string, Partial<DayValues>> {
  const out = new Map<string, Partial<DayValues>>();
  for (const s of Array.isArray(series) ? series : []) {
    const f = FB_FIELD[s?.label];
    if (!f) continue;
    for (const p of s.data ?? []) {
      const n = count(p?.total);
      if (!isDay(p?.date) || n === null || Date.parse(`${p.date}T08:00:00Z`) > now.getTime()) continue;
      const day = addDays(p.date, -1);
      out.set(day, { ...out.get(day), [f]: n });
    }
  }
  return out;
}

/** A Facebook post (postAnalytics; one value each, as of now): reach = Impressions (post_total_media_view_unique; a
 *  video's total_video_impressions); engagement = Engagement (video) or Reactions + Clicks. */
export function facebookPost(series: PostizAnalyticsSeries[]): { reach: number | null; engagement: number | null } {
  const v = (label: string) => { const s = (Array.isArray(series) ? series : []).find((x) => x?.label === label); return s ? count(s.data?.[0]?.total) : null; };
  const reactions = v("Reactions"), clicks = v("Clicks");
  return { reach: v("Impressions"), engagement: v("Engagement") ?? (reactions === null && clicks === null ? null : (reactions ?? 0) + (clicks ?? 0)) };
}

// ---- Bluesky's public API ---------------------------------------------------------------------------------------

const BSKY = "https://public.api.bsky.app/xrpc";
export interface BskyProfile { did: string; followersCount?: number }
export interface BskyFeedItem {
  post: { uri: string; author: { did: string }; record: { createdAt?: string }; indexedAt?: string; likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number };
  reason?: unknown;
}
const engagementOf = (p: BskyFeedItem["post"]) => (p.likeCount ?? 0) + (p.repostCount ?? 0) + (p.replyCount ?? 0) + (p.quoteCount ?? 0);
const rkeyOf = (uri: string) => uri.split("/").pop() ?? "";

/** The channel's own posts (no reposts, no replies) back past `since`, newest first; complete = the feed was read past
 *  it (more than 10 x 100 posts in the window, or the run's deadline passed: only the days read are counted). */
async function blueskyFeed(actor: string, since: number, deadline: number): Promise<{ profile: BskyProfile; items: BskyFeedItem[]; complete: boolean }> {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${BSKY}/${path}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Bluesky ${path.split("?")[0]} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  };
  const profile = await get<BskyProfile>(`app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
  const items: BskyFeedItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10 && Date.now() < deadline; page++) {
    const q = new URLSearchParams({ actor: profile.did, limit: "100", filter: "posts_no_replies", ...(cursor ? { cursor } : {}) });
    const r = await get<{ feed: BskyFeedItem[]; cursor?: string }>(`app.bsky.feed.getAuthorFeed?${q}`);
    items.push(...r.feed);
    const last = r.feed.at(-1)?.post;
    const oldest = Date.parse(last?.record?.createdAt ?? last?.indexedAt ?? "");
    if (!r.cursor || !r.feed.length || oldest < since) return { profile, items, complete: true };
    cursor = r.cursor;
  }
  return { profile, items, complete: false };
}

/** Days from `from` through yesterday (the brand's): posts = the channel's own posts made that day, engagement =
 *  likes + reposts + replies + quotes those posts have now (Bluesky keeps no per-day history); followers = the count
 *  now, kept as yesterday's (the run is a few hours after midnight). Today is still going: not written. */
export function blueskyDays(profile: BskyProfile, items: BskyFeedItem[], complete: boolean, tz: string, now: Date, from: string): Map<string, Partial<DayValues>> {
  const yesterday = addDays(zoned(now, tz).date, -1);
  const own = items.filter((x) => !x.reason && x.post?.author?.did === profile.did)
    .map((x) => ({ day: zoned(x.post.record?.createdAt ?? x.post.indexedAt ?? "", tz).date, e: engagementOf(x.post) }))
    .filter((x) => isDay(x.day));
  // cut short: a day older than the oldest post read may have had posts we did not see
  const start = complete ? from : own.length ? [from, addDays(own.reduce((a, x) => (x.day < a ? x.day : a), own[0].day), 1)].sort()[1] : addDays(yesterday, 1);
  const out = new Map<string, Partial<DayValues>>();
  for (let d = start; d <= yesterday; d = addDays(d, 1)) out.set(d, { posts: 0, engagement: 0 });
  for (const x of own) {
    const v = out.get(x.day);
    if (v) { v.posts = (v.posts ?? 0) + 1; v.engagement = (v.engagement ?? 0) + x.e; }
  }
  const f = count(profile.followersCount);
  if (f !== null && from <= yesterday) out.set(yesterday, { ...out.get(yesterday), followers: f });
  return out;
}

// ---- snapshots ----------------------------------------------------------------------------------------------------

/** What a fetch brings over what is stored for the same channel and day: each field the fetch has wins, a field it does
 *  not have keeps its stored value (a day fetched twice is the later fetch; a followers count is not wiped by a feed). */
export function mergeDays(existing: readonly DayRow[], incoming: readonly DayRow[]): DayRow[] {
  const had = new Map(existing.map((r) => [`${r.account_id}|${r.day}`, r]));
  return incoming.map((r) => {
    const old = had.get(`${r.account_id}|${r.day}`);
    const merged: DayRow = { account_id: r.account_id, day: r.day, ...emptyDay() };
    for (const f of STORED) merged[f] = r[f] ?? old?.[f] ?? null;
    return merged;
  });
}

const toRows = (accountId: string, days: Map<string, Partial<DayValues>>): DayRow[] =>
  [...days].map(([day, v]) => ({ account_id: accountId, day, ...emptyDay(), ...v }));

function db(): SupabaseClient {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new SocialStoreError(500, "Supabase client not configured");
  return sb;
}

interface SnapAccount { id: string; platform: string; label: string; handle: string | null; postiz_integration_id: string; organization: { id: string; default_timezone: string } | null }
export interface SnapshotResult { accounts: number; days: number; posts: number; skipped: number; errors: string[] }

export interface PubTarget { id: string; account_id: string; post_id: string; postiz_post_id: string | null; release_url: string | null; published_at: string }

/** Published targets on these channels whose post went out in [from, to) (ISO instants; `to` open), newest post first.
 *  The snapshot and the page both select through this, so what is collected is what is shown. `brandId` also pins the
 *  post's brand. Filters run in SQL (a JS filter after a cap loses a channel's older posts). */
export async function publishedTargets(sb: SupabaseClient, o: { accountIds: readonly string[]; from: string; to?: string; brandId?: string }): Promise<PubTarget[]> {
  if (!o.accountIds.length) return [];
  const raw = await selectAll((f, t) => {
    let q = sb.from("social_post_targets")
      .select("id, account_id, post_id, postiz_post_id, release_url, post:social_posts!inner(published_at)")
      .in("account_id", [...o.accountIds]).eq("state", "published").eq("post.state", "published").gte("post.published_at", o.from);
    if (o.to) q = q.lt("post.published_at", o.to);
    if (o.brandId) q = q.eq("post.organization_id", o.brandId);
    return q.order("id").range(f, t);
  }, (e) => { throw new SocialStoreError(500, `posts: ${e.message}`); }) as unknown as Array<Omit<PubTarget, "published_at"> & { post: { published_at: string } | Array<{ published_at: string }> | null }>;
  const out: PubTarget[] = [];
  for (const { post, ...r } of raw) {
    const at = (Array.isArray(post) ? post[0] : post)?.published_at;
    if (at) out.push({ ...r, published_at: at });
  }
  return out.sort((a, b) => (a.published_at < b.published_at ? 1 : a.published_at > b.published_at ? -1 : a.id < b.id ? -1 : 1));
}

/** Runs `fn` over `items` with `limit` at a time; an item reached after `deadline` (epoch ms) is not started.
 *  Returns how many were not started. */
async function pool<T>(items: readonly T[], limit: number, deadline: number, fn: (x: T) => Promise<void>): Promise<number> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && Date.now() < deadline) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return items.length - next;
}

/** One run: every connected channel that has a source gets its days and its published posts' numbers. Nothing new starts
 *  after the deadline, and everything not done -- a channel not started or failed, a feed cut short, a post not reached
 *  or whose fetch failed -- is in `errors` (the route answers 502), never dropped silently. */
export async function runMetricsSnapshot(now = new Date()): Promise<SnapshotResult> {
  const deadline = Date.now() + DEADLINE_MS;
  const sb = db();
  const result: SnapshotResult = { accounts: 0, days: 0, posts: 0, skipped: 0, errors: [] };
  const { data, error } = await sb.from("social_accounts")
    .select("id, platform, label, handle, postiz_integration_id, organization:organizations(id, default_timezone)").eq("status", "connected");
  if (error) throw new SocialStoreError(500, `metrics accounts: ${error.message}`);
  for (const a of (data ?? []) as unknown as SnapAccount[]) {
    if (!collects(a.platform)) { result.skipped++; continue; }
    if (Date.now() >= deadline) { result.errors.push(`${a.platform} ${a.id}: not started: run deadline passed`); continue; }
    try {
      const r = await snapshotAccount(sb, a, now, deadline);
      result.accounts++; result.days += r.days; result.posts += r.posts;
      for (const gap of r.gaps) result.errors.push(`${a.platform} ${a.id}: ${gap}`);
    } catch (e) {
      result.errors.push(`${a.platform} ${a.id}: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
    }
  }
  return result;
}

async function snapshotAccount(sb: SupabaseClient, a: SnapAccount, now: Date, deadline: number): Promise<{ days: number; posts: number; gaps: string[] }> {
  const gate = await checkProductionChangeAllowed(sb, a.organization?.id ?? null);
  if (!gate.allowed) throw new Error(`metrics writes blocked: ${gate.reason ?? gate.mode}`);
  if (Date.now() >= deadline) throw new Error("not started: run deadline passed");
  const tz = a.organization?.default_timezone ?? "UTC";
  const window = BACKFILL_DAYS;
  const from = addDays(zoned(now, tz).date, -window);
  let days: Map<string, Partial<DayValues>>;
  let postNumbers: (t: { postiz_post_id: string | null; release_url: string | null }) => Promise<{ reach: number | null; engagement: number | null } | null>;
  const gaps: string[] = [];
  if (a.platform === "facebook") {
    days = facebookDays(await accountAnalytics(a.postiz_integration_id, window), now);
    postNumbers = async (t) => (t.postiz_post_id ? facebookPost(await postAnalytics(t.postiz_post_id, window)) : null);
  } else {
    const feed = await blueskyFeed(a.handle || a.label, Date.parse(instantAt(from, "00:00", tz)), deadline);
    if (!feed.complete) gaps.push("feed cut short (1000 posts or run deadline): older days not counted");
    days = blueskyDays(feed.profile, feed.items, feed.complete, tz, now, from);
    const byKey = new Map(feed.items.filter((x) => !x.reason).map((x) => [rkeyOf(x.post.uri), engagementOf(x.post)]));
    postNumbers = async (t) => {
      const e = t.release_url ? byKey.get(rkeyOf(t.release_url)) : undefined;
      return e === undefined ? null : { reach: null, engagement: e };
    };
  }
  const incoming = toRows(a.id, days);
  if (incoming.length) {
    const { data: old, error: e1 } = await sb.from("social_metrics_daily").select("account_id, day, followers, reach, impressions, engagement, posts")
      .eq("account_id", a.id).in("day", incoming.map((r) => r.day));
    if (e1) throw new Error(`read days: ${e1.message}`);
    const { error: e2 } = await sb.from("social_metrics_daily").upsert(mergeDays((old ?? []) as DayRow[], incoming), { onConflict: "account_id,day" });
    if (e2) throw new Error(`write days: ${e2.message}`);
  }
  // the channel's newest posts that went out inside the window (same selection as the page)
  const targets = (await publishedTargets(sb, { accountIds: [a.id], from: instantAt(from, "00:00", tz) })).slice(0, SNAPSHOT_POSTS);
  const rows: Array<{ target_id: string; reach: number | null; engagement: number | null; fetched_at: string }> = [];
  let failed = 0, firstFailure = "";
  const notCollected = await pool(targets, POOL, deadline, async (t) => {
    // one post's failure is not worth the channel's run; counted, not swallowed
    const n = await postNumbers(t).catch((e: unknown) => { failed++; firstFailure ||= (e instanceof Error ? e.message : String(e)).slice(0, 200); return null; });
    if (n) rows.push({ target_id: t.id, ...n, fetched_at: now.toISOString() });
  });
  if (notCollected) gaps.push(`stopped at deadline: ${notCollected} posts not collected`);
  if (failed) gaps.push(`${failed} post fetches failed (first: ${firstFailure})`);
  if (rows.length) {
    const { error: e4 } = await sb.from("social_post_metrics").upsert(rows, { onConflict: "target_id" });
    if (e4) throw new Error(`write posts: ${e4.message}`);
  }
  return { days: incoming.length, posts: rows.length, gaps };
}

// ---- the page -----------------------------------------------------------------------------------------------------

export interface Period { from: string; to: string; prevFrom: string; prevTo: string; days: string[]; prevDays: string[] }

/** The last n whole days (through yesterday) and the n before them. */
export function periodOf(today: string, n: number): Period {
  const to = addDays(today, -1), from = addDays(to, -(n - 1)), prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(n - 1));
  const span = (a: string) => Array.from({ length: n }, (_, i) => addDays(a, i));
  return { from, to, prevFrom, prevTo, days: span(from), prevDays: span(prevFrom) };
}

export interface Kpi { value: number | null; prev: number | null }
export type Summary = { kpis: Record<Metric, Kpi>; series: Record<Metric, { cur: Array<number | null>; prev: Array<number | null> }> };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The cards and the chart for the given channels. Sums count only the channels that have the field (the page lists the
 *  others with their reason); a field nobody has is null, not 0. Followers is a level: the last count in the period. */
export function summarize(rows: readonly DayRow[], accountIds: readonly string[], p: Period): Summary {
  const at = new Map(rows.map((r) => [`${r.account_id}|${r.day}`, r]));
  const sumDay = (f: Stored, day: string) => {
    let s: number | null = null;
    for (const id of accountIds) { const v = at.get(`${id}|${day}`)?.[f]; if (v != null) s = (s ?? 0) + v; }
    return s;
  };
  const rateDay = (day: string) => {
    let e = 0, r = 0;
    for (const id of accountIds) { const x = at.get(`${id}|${day}`); if (x?.engagement != null && x.reach != null) { e += x.engagement; r += x.reach; } }
    return r > 0 ? { e, r } : null;
  };
  const total = (vs: Array<number | null>) => vs.reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null);
  const lastLevel = (days: string[]) => {
    let s: number | null = null;
    for (const id of accountIds) {
      for (let i = days.length - 1; i >= 0; i--) { const v = at.get(`${id}|${days[i]}`)?.followers; if (v != null) { s = (s ?? 0) + v; break; } }
    }
    return s;
  };
  const rateOf = (days: string[]) => {
    const xs = days.map(rateDay).filter((x): x is { e: number; r: number } => !!x);
    const r = xs.reduce((s, x) => s + x.r, 0);
    return r > 0 ? r1((xs.reduce((s, x) => s + x.e, 0) / r) * 100) : null;
  };
  const kpis = {} as Summary["kpis"], series = {} as Summary["series"];
  for (const m of METRICS) {
    const line = (days: string[]) => days.map((d) => { if (m !== "rate") return sumDay(m, d); const x = rateDay(d); return x ? r1((x.e / x.r) * 100) : null; });
    series[m] = { cur: line(p.days), prev: line(p.prevDays) };
    kpis[m] = m === "followers" ? { value: lastLevel(p.days), prev: lastLevel(p.prevDays) }
      : m === "rate" ? { value: rateOf(p.days), prev: rateOf(p.prevDays) }
      : { value: total(series[m].cur), prev: total(series[m].prev) };
  }
  return { kpis, series };
}

export interface AnalyticsAccount { id: string; platform: string; label: string; status: string; picture: string | null; handle: string | null }
export interface AnalyticsPost {
  id: string; body: string; published_at: string; account_ids: string[]; thumb: string | null;
  reach: number | null; engagement: number | null; rate: number | null;
}
export interface Analytics extends Summary {
  period: Omit<Period, "days" | "prevDays">; days: string[]; accounts: AnalyticsAccount[];
  /** per channel, the fields it has no number for and why; collected = it has a row in the period */
  gaps: Array<{ account_id: string; fields: Stored[]; reason: string }>; empty: string[];
  posts: AnalyticsPost[]; latestDay: string | null;
}

const POSTS_CAP = 200;

/** What 數據分析 shows for a brand: `account` = one channel or null for all of them, the last `n` days. `postsCap` = how many of
 *  the newest posts get their numbers (the page: 200; a report: all of the period's). */
export async function loadAnalytics(brandId: string, tz: string, account: string | null, n: number, now = new Date(), postsCap = POSTS_CAP): Promise<Analytics> {
  const sb = db();
  const p = periodOf(zoned(now, tz).date, n);
  const { data: accs, error: e1 } = await sb.from("social_accounts").select("id, platform, label, status, picture, handle")
    .eq("organization_id", brandId).neq("status", "disabled").order("platform");
  if (e1) throw new SocialStoreError(500, `accounts: ${e1.message}`);
  const accounts = (accs ?? []) as AnalyticsAccount[];
  if (account && !accounts.some((a) => a.id === account)) throw new SocialStoreError(404, "no such channel in this brand");
  const ids = account ? [account] : accounts.map((a) => a.id);
  const rows = ids.length ? await selectAll((f, t) => sb.from("social_metrics_daily").select("account_id, day, followers, reach, impressions, engagement, posts")
    .in("account_id", ids).gte("day", p.prevFrom).lte("day", p.to).order("day").order("account_id").range(f, t), (e) => { throw new SocialStoreError(500, `metrics: ${e.message}`); }) as DayRow[] : [];

  const gaps: Analytics["gaps"] = [];
  for (const a of accounts.filter((x) => ids.includes(x.id))) {
    const byReason = new Map<string, Stored[]>();
    for (const f of STORED) { const why = missingReason(a.platform, f); if (why) byReason.set(why, [...(byReason.get(why) ?? []), f]); }
    for (const [reason, fields] of byReason) gaps.push({ account_id: a.id, fields, reason });
  }
  const inPeriod = (r: DayRow) => r.day >= p.from && r.day <= p.to;
  const empty = accounts.filter((a) => ids.includes(a.id) && collects(a.platform) && !rows.some((r) => r.account_id === a.id && inPeriod(r))).map((a) => a.id);

  // published posts of the period on these channels, with their numbers
  const found = await publishedTargets(sb, { accountIds: ids, brandId, from: instantAt(p.from, "00:00", tz), to: instantAt(addDays(p.to, 1), "00:00", tz) });
  const byPost = new Map<string, PubTarget[]>();
  for (const t of found) byPost.set(t.post_id, [...(byPost.get(t.post_id) ?? []), t]);
  const newest = [...byPost.values()].slice(0, postsCap);   // `found` is newest first, so are the groups
  type P = { id: string; body: string; published_at: string; media: Array<{ position: number; item: { postiz_path: string | null } | null }> };
  const detail = new Map<string, P>();
  for (let i = 0; i < newest.length; i += 100) {
    const { data, error: e2 } = await sb.from("social_posts").select("id, body, published_at, media:social_post_media(position, item:social_media(postiz_path))")
      .in("id", newest.slice(i, i + 100).map((g) => g[0].post_id));
    if (e2) throw new SocialStoreError(500, `posts: ${e2.message}`);
    for (const x of (data ?? []) as unknown as P[]) detail.set(x.id, x);
  }
  const posts = newest.flatMap((g) => { const x = detail.get(g[0].post_id); return x ? [{ ...x, targets: g.map((t) => ({ id: t.id, account_id: t.account_id })) }] : []; });
  const tids = posts.flatMap((x) => x.targets.map((t) => t.id));
  const pm = new Map<string, { reach: number | null; engagement: number | null }>();
  for (let i = 0; i < tids.length; i += 100) {
    const { data, error } = await sb.from("social_post_metrics").select("target_id, reach, engagement").in("target_id", tids.slice(i, i + 100));
    if (error) throw new SocialStoreError(500, `post metrics: ${error.message}`);
    for (const m of (data ?? []) as Array<{ target_id: string; reach: number | null; engagement: number | null }>) pm.set(m.target_id, m);
  }
  const sum = (vs: Array<number | null | undefined>) => vs.reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null);
  const outPosts: AnalyticsPost[] = posts.map((x) => {
    const reach = sum(x.targets.map((t) => pm.get(t.id)?.reach)), engagement = sum(x.targets.map((t) => pm.get(t.id)?.engagement));
    const reachPaired = sum(x.targets.map((t) => (pm.get(t.id)?.reach != null && pm.get(t.id)?.engagement != null ? pm.get(t.id)!.reach : null)));
    const engPaired = sum(x.targets.map((t) => (pm.get(t.id)?.reach != null ? pm.get(t.id)?.engagement : null)));
    return {
      id: x.id, body: x.body, published_at: x.published_at, account_ids: x.targets.map((t) => t.account_id),
      thumb: [...x.media].sort((a, b) => a.position - b.position)[0]?.item?.postiz_path ?? null,
      reach, engagement, rate: reachPaired && engPaired != null ? r1((engPaired / reachPaired) * 100) : null,
    };
  });
  const latestDay = rows.filter(inPeriod).reduce<string | null>((a, r) => (!a || r.day > a ? r.day : a), null);
  const { from, to, prevFrom, prevTo } = p;
  return { period: { from, to, prevFrom, prevTo }, days: p.days, accounts, gaps, empty, posts: outPosts, latestDay, ...summarize(rows, ids, p) };
}

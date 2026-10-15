// Data access for /api/social (SOCIAL_MANAGER_PLAN.md C4). Tables: migration 0096; atomic writes: 0098's
// social_save_post / social_set_state / social_save_list (supabase-js has no transactions). Every query is scoped by
// organization_id = the brand; the composite foreign keys of 0096 refuse a child row pointing into another brand even
// if a query forgot.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { selectAll } from "@/lib/supabase-paging";
import { connectUrl, listAllIntegrations, uploadMedia, type RawIntegration } from "@/lib/content/postiz";
import type { PostSnapshot, PostState, Transition } from "./state";

export class SocialStoreError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 500 | 502, message: string) {
    super(message);
    this.name = "SocialStoreError";
  }
}

function db(): SupabaseClient {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new SocialStoreError(500, "Supabase client not configured");
  return sb;
}

/** Database refusals the caller can act on, by SQLSTATE (0098: SC404/SC409; 0096: checks and keys; malformed input). */
function fail(error: { code?: string; message: string }, what: string): never {
  const byCode: Record<string, 400 | 404 | 409> = {
    SC404: 404, SC409: 409, "23505": 409, "23503": 409,
    "23514": 400, "22P02": 400, "22023": 400, "23502": 400, "22003": 400, "21000": 400,
  };
  throw new SocialStoreError(byCode[error.code ?? ""] ?? 500, `${what}: ${error.message}`);
}

// ---- brands ---------------------------------------------------------------------------------------------------

export interface Brand { id: string; slug: string; name: string; default_timezone: string }

export async function listBrands(onlyId: string | null): Promise<Brand[]> {
  let q = db().from("organizations").select("id, slug, name, default_timezone").order("name");
  if (onlyId) q = q.eq("id", onlyId);
  const { data, error } = await q;
  if (error) fail(error, "brands");
  return (data ?? []) as Brand[];
}

// ---- accounts -------------------------------------------------------------------------------------------------

export interface Account { id: string; platform: string; label: string; status: "connected" | "expired" | "disabled"; postiz_integration_id: string }
export interface OpenAttempt { id: string; platform: string; started_at: string }

const ATTEMPT_TTL_MS = 15 * 60 * 1000;   // a connection nobody finished frees the brand and the instance again
const POSTIZ_INSTANCE = "ks-aw-01";        // 0096/0098 default: the one Postiz every brand shares

export async function listAccounts(brandId: string): Promise<Account[]> {
  const { data, error } = await db().from("social_accounts").select("id, platform, label, status, postiz_integration_id")
    .eq("organization_id", brandId).order("platform");
  if (error) fail(error, "accounts");
  return (data ?? []) as Account[];
}

/** The integration a new-channel attempt produced: new since the press, of its platform, and no brand's yet. Two such
 *  cannot be told apart (ADR 016 §4): null, and the attempt stays open. */
export function pickFreshIntegration(live: RawIntegration[], known: readonly string[], owned: ReadonlySet<string>,
  platform: string): RawIntegration | null {
  const fresh = live.filter((i) => i.identifier === platform && !known.includes(i.id) && !owned.has(i.id));
  return fresh.length === 1 ? fresh[0] : null;
}

/** Every brand's attempts: an abandoned one would otherwise hold the instance-wide new-channel slot (0098). */
async function expireStaleAttempts(sb: SupabaseClient): Promise<void> {
  const { error } = await sb.from("social_connect_attempts").update({ outcome: "expired", resolved_at: new Date().toISOString() })
    .is("outcome", null).lt("started_at", new Date(Date.now() - ATTEMPT_TTL_MS).toISOString());
  if (error) fail(error, "expire connect attempts");
}

async function closeAttempt(sb: SupabaseClient, id: string, outcome: "connected" | "expired" | "cancelled", accountId: string | null = null): Promise<void> {
  const { error } = await sb.from("social_connect_attempts")
    .update({ outcome, resolved_at: new Date().toISOString(), account_id: accountId }).eq("id", id).is("outcome", null);
  if (error) fail(error, "close connect attempt");
}

/** Closes stale attempts, then attaches what the brand's open attempt produced: a refreshed channel back to
 *  connected, or the one new integration (pickFreshIntegration). `failed` = the attempt ended without a channel. */
export async function resolveConnectAttempt(brandId: string): Promise<{ open: OpenAttempt | null; connected?: string; failed?: string }> {
  const sb = db();
  await expireStaleAttempts(sb);
  const { data: open, error } = await sb.from("social_connect_attempts")
    .select("id, platform, refresh_account_id, known_integration_ids, started_at").eq("organization_id", brandId).is("outcome", null).maybeSingle();
  if (error) fail(error, "connect attempt");
  if (!open) return { open: null };
  const live = await listAllIntegrations();
  let accountId: string | null = null;
  if (open.refresh_account_id) {
    const { data: acc, error: accErr } = await sb.from("social_accounts").select("id, postiz_integration_id").eq("id", open.refresh_account_id).maybeSingle();
    if (accErr) fail(accErr, "account");
    const now = live.find((i) => i.id === acc?.postiz_integration_id);
    if (acc && now && !now.disabled) {
      const { error: upErr } = await sb.from("social_accounts").update({ status: "connected" }).eq("id", acc.id);
      if (upErr) fail(upErr, "account status");
      accountId = acc.id;
    }
  } else {
    const candidates = live.filter((i) => i.identifier === open.platform && !open.known_integration_ids.includes(i.id)).map((i) => i.id);
    const owned = new Set<string>();
    if (candidates.length) {
      const { data: taken, error: takenErr } = await sb.from("social_accounts").select("postiz_integration_id")
        .eq("postiz_instance", POSTIZ_INSTANCE).in("postiz_integration_id", candidates);
      if (takenErr) fail(takenErr, "accounts");
      for (const r of taken ?? []) owned.add(r.postiz_integration_id as string);
    }
    const fresh = pickFreshIntegration(live, open.known_integration_ids, owned, open.platform);
    if (fresh) {
      const { data: acc, error: insErr } = await sb.from("social_accounts")
        .insert({ organization_id: brandId, postiz_integration_id: fresh.id, platform: fresh.identifier, label: fresh.name, status: fresh.disabled ? "expired" : "connected" })
        .select("id").single();
      if (insErr?.code === "23505") {   // attached elsewhere between the check and the insert: end it, never loop on it
        await closeAttempt(sb, open.id, "expired");
        return { open: null, failed: "that channel already belongs to a brand" };
      }
      if (insErr) fail(insErr, "attach the new channel");
      accountId = acc.id;
    }
  }
  if (!accountId) return { open: { id: open.id, platform: open.platform, started_at: open.started_at } };
  await closeAttempt(sb, open.id, "connected", accountId);
  return { open: null, connected: accountId };
}

export async function startConnect(brandId: string, platform: string, refreshAccountId: string | null, actor: string): Promise<{ attemptId: string; url: string }> {
  const sb = db();
  const { open } = await resolveConnectAttempt(brandId);
  if (open) throw new SocialStoreError(409, `a ${open.platform} connection for this brand is already in progress since ${open.started_at}`);
  const busy = () => new SocialStoreError(409, "another brand is connecting a new channel; try again when it finishes (at most 15 minutes)");
  if (!refreshAccountId) {
    const { data: other, error } = await sb.from("social_connect_attempts").select("id")
      .eq("postiz_instance", POSTIZ_INSTANCE).is("outcome", null).is("refresh_account_id", null).limit(1);
    if (error) fail(error, "connect attempts");
    if (other?.length) throw busy();
  }
  let refreshIntegration: string | undefined;
  if (refreshAccountId) {
    const { data: acc, error } = await sb.from("social_accounts").select("postiz_integration_id, platform").eq("id", refreshAccountId).eq("organization_id", brandId).maybeSingle();
    if (error) fail(error, "account");
    if (!acc) throw new SocialStoreError(404, "no such account in this brand");
    if (acc.platform !== platform) throw new SocialStoreError(400, `account is ${acc.platform}, not ${platform}`);
    refreshIntegration = acc.postiz_integration_id;
  }
  const known = (await listAllIntegrations()).map((i) => i.id);
  const { data: attempt, error } = await sb.from("social_connect_attempts")
    .insert({ organization_id: brandId, platform, refresh_account_id: refreshAccountId, known_integration_ids: known, started_by: actor })
    .select("id").single();
  if (error?.code === "23505" && !refreshAccountId) throw busy();   // another brand started between the check and here
  if (error) fail(error, "start connect");
  let url: string;
  try {
    url = await connectUrl(platform, refreshIntegration);
  } catch (e) {
    await closeAttempt(sb, attempt.id, "cancelled");
    throw new SocialStoreError(502, `Postiz did not give a connect URL: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { attemptId: attempt.id, url };
}

/** The person gave up on a connection: frees the brand (and the instance's new-channel slot) now, not after the TTL. */
export async function cancelConnect(brandId: string, attemptId: string): Promise<void> {
  const { data, error } = await db().from("social_connect_attempts").update({ outcome: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", attemptId).eq("organization_id", brandId).is("outcome", null).select("id");
  if (error) fail(error, "cancel connect");
  if (!data?.length) throw new SocialStoreError(404, "no open connection with that id in this brand");
}

/** Unlinks the channel from the brand (the Postiz integration itself stays). Refused while posts target it. */
export async function unlinkAccount(brandId: string, accountId: string): Promise<void> {
  const { data, error } = await db().from("social_accounts").delete().eq("id", accountId).eq("organization_id", brandId).select("id");
  if (error) fail(error, "unlink account (posts still target it?)");
  if (!data?.length) throw new SocialStoreError(404, "no such account in this brand");
}

// ---- posts ----------------------------------------------------------------------------------------------------

export const POST_COLUMNS = "id, state, body, scheduled_at, list_id, list_position, first_comment, link_url, link_utm, notes, source_url, " +
  "published_at, deleted_at, created_by, version, created_at, updated_at, " +
  "targets:social_post_targets(id, account_id, custom_body, format, state, postiz_post_id, release_url, error), " +
  "media:social_post_media(media_id, position, alt_text)";

export interface PostRow {
  id: string; state: PostState; body: string; scheduled_at: string | null; list_id: string | null; list_position: number | null;
  first_comment: string | null; link_url: string | null; link_utm: boolean; notes: string | null; source_url: string | null;
  published_at: string | null; deleted_at: string | null; created_by: string; version: number;
  targets: Array<{ id: string; account_id: string; custom_body: string | null; format: string; state: string; postiz_post_id: string | null; release_url: string | null; error: string | null }>;
  media: Array<{ media_id: string; position: number; alt_text: string | null }>;
}

export function snapshotOf(p: PostRow): PostSnapshot {
  const text = (s: string | null) => !!s?.trim();
  return {
    state: p.state, scheduledAt: p.scheduled_at, listId: p.list_id, listPosition: p.list_position, publishedAt: p.published_at,
    targetCount: p.targets.length,
    // something to send on every target: the post's text, a media item, or every target's own text
    hasContent: text(p.body) || p.media.length > 0 || (p.targets.length > 0 && p.targets.every((t) => text(t.custom_body))),
  };
}

const UNDATED_CAP = 500;   // drafts, review and rotation posts grow without a window; the newest are shown

/** Posts timed inside [start, end) (all of them: the window bounds it), plus the newest UNDATED_CAP not-deleted posts
 *  without a time; `undatedTruncated` says when there were more. */
export async function listPosts(brandId: string, start: string, end: string): Promise<{ posts: PostRow[]; undatedTruncated: boolean }> {
  const sb = db();
  const [timed, undated] = await Promise.all([
    selectAll((f, t) => sb.from("social_posts").select(POST_COLUMNS).eq("organization_id", brandId).neq("state", "deleted")
      .gte("scheduled_at", start).lt("scheduled_at", end).order("scheduled_at").order("id").range(f, t), (e) => fail(e, "posts")),
    sb.from("social_posts").select(POST_COLUMNS).eq("organization_id", brandId).neq("state", "deleted")
      .is("scheduled_at", null).order("created_at", { ascending: false }).order("id").limit(UNDATED_CAP + 1),
  ]);
  if (undated.error) fail(undated.error, "posts");
  const rows = undated.data ?? [];
  return { posts: [...timed, ...rows.slice(0, UNDATED_CAP)] as unknown as PostRow[], undatedTruncated: rows.length > UNDATED_CAP };
}

const TRASH_CAP = 200;

/** The bin (C6): deleted posts, most recently deleted first (social_posts_trash_idx). */
export async function listTrash(brandId: string): Promise<PostRow[]> {
  const { data, error } = await db().from("social_posts").select(POST_COLUMNS).eq("organization_id", brandId).eq("state", "deleted")
    .order("deleted_at", { ascending: false }).order("id").limit(TRASH_CAP);
  if (error) fail(error, "deleted posts");
  return (data ?? []) as unknown as PostRow[];
}

// ---- saved texts (C6 editor 常用文字) ------------------------------------------------------------------------------

export async function listTexts(brandId: string): Promise<Array<{ id: string; body: string }>> {
  const { data, error } = await db().from("social_saved_texts").select("id, body").eq("organization_id", brandId).order("created_at").limit(200);
  if (error) fail(error, "saved texts");
  return (data ?? []) as Array<{ id: string; body: string }>;
}

export async function addText(brandId: string, body: string): Promise<{ id: string; body: string }> {
  const { data, error } = await db().from("social_saved_texts").insert({ organization_id: brandId, body }).select("id, body").single();
  if (error) fail(error, "save text");
  return data as { id: string; body: string };
}

export async function deleteText(brandId: string, id: string): Promise<void> {
  const { data, error } = await db().from("social_saved_texts").delete().eq("id", id).eq("organization_id", brandId).select("id");
  if (error) fail(error, "delete text");
  if (!data?.length) throw new SocialStoreError(404, "no such saved text in this brand");
}

export async function getPost(brandId: string, id: string): Promise<PostRow> {
  const { data, error } = await db().from("social_posts").select(POST_COLUMNS).eq("organization_id", brandId).eq("id", id).maybeSingle();
  if (error) fail(error, "post");
  if (!data) throw new SocialStoreError(404, "no such post in this brand");
  return data as unknown as PostRow;
}

/** The post as the caller last saw it. A decision taken against version N is written with N (0098 CAS), so a newer
 *  row is refused here, not decided against one state and written onto another (review 2026-10-15). */
export async function getPostAt(brandId: string, id: string, version: number): Promise<PostRow> {
  const post = await getPost(brandId, id);
  if (post.version !== version) throw new SocialStoreError(409, `post changed since version ${version} (now ${post.version}); reload it`);
  return post;
}

export interface PostFields { body?: string; first_comment?: string | null; link_url?: string | null; link_utm?: boolean; notes?: string | null; source_url?: string | null }
export interface TargetInput { account_id: string; custom_body?: string | null; format?: string }
export interface MediaInput { media_id: string; position?: number; alt_text?: string | null }

export async function savePost(brandId: string, id: string | null, expectedVersion: number | null, fields: PostFields,
  targets: TargetInput[] | null, media: MediaInput[] | null, actor: string): Promise<{ id: string; version: number }> {
  const { data, error } = await db().rpc("social_save_post", {
    p_org: brandId, p_post_id: id, p_expected_version: expectedVersion, p_post: fields, p_targets: targets, p_media: media, p_actor: actor,
  });
  if (error) fail(error, "save post");
  const row = (data as Array<{ saved_post_id: string; saved_version: number }>)[0];
  return { id: row.saved_post_id, version: row.saved_version };
}

export async function setState(brandId: string, id: string, expectedVersion: number, next: Transition, actor: string,
  action: string, detail: Record<string, unknown> = {}): Promise<{ id: string; version: number }> {
  const { data, error } = await db().rpc("social_set_state", {
    p_org: brandId, p_post_id: id, p_expected_version: expectedVersion, p_state: next.state, p_scheduled_at: next.scheduledAt,
    p_list_id: next.listId, p_list_position: next.listPosition, p_actor: actor, p_action: action, p_detail: detail,
  });
  if (error) fail(error, `${action} post`);
  const row = (data as Array<{ saved_post_id: string; saved_version: number }>)[0];
  return { id: row.saved_post_id, version: row.saved_version };
}

/** A queued post changed by a person, after withdraw.ts deleted its Postiz posts (0100 social_release_post). */
export async function releasePost(brandId: string, id: string, expectedVersion: number, deletedPostizIds: string[], next: Transition,
  actor: string, action: string, detail: Record<string, unknown> = {}): Promise<{ id: string; version: number }> {
  const { data, error } = await db().rpc("social_release_post", {
    p_org: brandId, p_post_id: id, p_expected_version: expectedVersion, p_deleted_postiz_ids: deletedPostizIds, p_state: next.state,
    p_scheduled_at: next.scheduledAt, p_actor: actor, p_action: action, p_detail: detail,
  });
  if (error) fail(error, `${action} post`);
  const row = (data as Array<{ saved_post_id: string; saved_version: number }>)[0];
  return { id: row.saved_post_id, version: row.saved_version };
}

/** Platform per account of this brand, for the body limits. An account of another brand is simply absent. */
export async function accountPlatforms(brandId: string, accountIds: string[]): Promise<Map<string, string>> {
  if (!accountIds.length) return new Map();
  const { data, error } = await db().from("social_accounts").select("id, platform").eq("organization_id", brandId).in("id", accountIds);
  if (error) fail(error, "accounts");
  return new Map((data ?? []).map((a) => [a.id as string, a.platform as string]));
}

// ---- rotation lists --------------------------------------------------------------------------------------------

export interface ListInput { name: string; weekdays: number[]; send_time?: string; active?: boolean; account_ids: string[] }

export async function listLists(brandId: string) {
  const { data, error } = await db().from("social_lists")
    .select("id, name, weekdays, send_time, active, cursor, accounts:social_list_accounts(account_id)").eq("organization_id", brandId).order("name");
  if (error) fail(error, "lists");
  return data ?? [];
}

/** The list and its account set in one transaction (0098 social_save_list): a refused account leaves both as they were. */
export async function saveList(brandId: string, id: string | null, input: ListInput): Promise<string> {
  const { data, error } = await db().rpc("social_save_list", {
    p_org: brandId, p_list_id: id, p_name: input.name, p_weekdays: input.weekdays, p_send_time: input.send_time ?? "10:00",
    p_active: input.active ?? false, p_account_ids: input.account_ids,
  });
  if (error) fail(error, "save list");
  return data as string;
}

/** Refused (409) while the list still holds rotation posts: they move out first (C7 or a person); 0096 refuses it too. */
export async function deleteList(brandId: string, id: string): Promise<void> {
  const sb = db();
  const { count, error: countErr } = await sb.from("social_posts").select("id", { count: "exact", head: true })
    .eq("organization_id", brandId).eq("list_id", id).eq("state", "rotation");
  if (countErr) fail(countErr, "list items");
  if (count) throw new SocialStoreError(409, `the list still holds ${count} rotation post(s); move them out first`);
  const { data, error } = await sb.from("social_lists").delete().eq("id", id).eq("organization_id", brandId).select("id");
  if (error) fail(error, "delete list");
  if (!data?.length) throw new SocialStoreError(404, "no such list in this brand");
}

// ---- media and log ---------------------------------------------------------------------------------------------

export async function listMedia(brandId: string) {
  const { data, error } = await db().from("social_media").select("id, kind, file_name, postiz_path, bytes, created_at, uses:social_post_media(count)")
    .eq("organization_id", brandId).order("created_at", { ascending: false }).limit(200);
  if (error) fail(error, "media");
  // C9: how many posts use each item (the library's 「用過 N 次」); PostgREST answers the embed as [{ count }]
  return ((data ?? []) as Array<Record<string, unknown> & { uses?: Array<{ count: number }> }>)
    .map(({ uses, ...m }) => ({ ...m, used: uses?.[0]?.count ?? 0 }));
}

/** Uploads through Postiz (its storage holds the file until the media library card moves storage, C9). */
export async function addImage(brandId: string, imageUrl: string, fileName: string, actor: string) {
  let up: { id: string; path: string };
  try {
    up = await uploadMedia({ imageUrl, filename: fileName });
  } catch (e) {
    throw new SocialStoreError(400, `upload refused: ${e instanceof Error ? e.message : String(e)}`);
  }
  const { data, error } = await db().from("social_media")
    .insert({ organization_id: brandId, kind: "image", file_name: fileName, storage_path: up.path, postiz_media_id: up.id, postiz_path: up.path, created_by: actor })
    .select("id, kind, file_name, postiz_path, created_at").single();
  if (error) fail(error, "media");
  return data;
}

export async function listLog(brandId: string, beforeId: number | null, limit: number) {
  let q = db().from("social_audit_log").select("id, at, actor, action, post_id, detail").eq("organization_id", brandId)
    .order("id", { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (beforeId) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) fail(error, "log");
  return data ?? [];
}

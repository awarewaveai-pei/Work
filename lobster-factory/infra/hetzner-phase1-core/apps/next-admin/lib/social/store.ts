// Data access for /api/social (SOCIAL_MANAGER_PLAN.md C4). Tables: migration 0096 (+0105 V1.5); atomic writes: 0098's
// social_save_post / social_set_state / social_save_list as 0105 left them (supabase-js has no transactions). Every query is scoped by
// organization_id = the brand; the composite foreign keys of 0096 refuse a child row pointing into another brand even
// if a query forgot.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { selectAll } from "@/lib/supabase-paging";
import { ACCOUNT_COPY } from "@/lib/accounts/invite-copy";
import { connectUrl, listAllIntegrations, uploadMedia, uploadVideo, type RawIntegration } from "@/lib/content/postiz";
import { repeatSlots, type RepeatRule } from "./repeat-rule";
import type { BrandRole, PostSnapshot, PostState, Transition } from "./state";

export class SocialStoreError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 500 | 502, message: string) {
    super(message);
    this.name = "SocialStoreError";
  }
}

export type MetaAssetKind = "facebook_page" | "instagram_account" | "ad_account";

export interface MetaAsset {
  id: string;
  organizationId: string;
  kind: MetaAssetKind;
  externalId: string;
  pageExternalId: string | null;
  label: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const META_ASSET_COLUMNS = "id, organization_id, kind, external_id, page_external_id, label, enabled, created_at, updated_at";

function metaAssetOf(row: Record<string, unknown>): MetaAsset {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    kind: row.kind as MetaAssetKind,
    externalId: row.external_id as string,
    pageExternalId: (row.page_external_id as string | null) ?? null,
    label: (row.label as string | null) ?? null,
    enabled: row.enabled === true,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function db(): SupabaseClient {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new SocialStoreError(500, "Supabase client not configured");
  return sb;
}

/** Database refusals the caller can act on, by SQLSTATE (0098: SC404/SC409; 0096: checks and keys; malformed input). */
/** One row in the brand's log for an action that is not a post's state change (C11). Never undoes the action. */
async function logAction(sb: SupabaseClient, brandId: string, actor: string, action: string, detail: Record<string, unknown>): Promise<void> {
  const { error } = await sb.from("social_audit_log").insert({ organization_id: brandId, actor, action, detail });
  if (error) console.error(`[social] log ${action} for ${brandId}: ${error.message}`);
}

export function fail(error: { code?: string; message: string }, what: string): never {
  const byCode: Record<string, 400 | 404 | 409> = {
    SC404: 404, SC409: 409, "23505": 409, "23503": 409,
    "23514": 400, "22P02": 400, "22023": 400, "23502": 400, "22003": 400, "21000": 400, "22007": 400, "22008": 400,
  };
  throw new SocialStoreError(byCode[error.code ?? ""] ?? 500, `${what}: ${error.message}`);
}

// ---- Meta asset map (0116; provider ids are never trusted without a brand scope) -------------------------------

export async function listMetaAssets(brandId: string, kind?: MetaAssetKind): Promise<MetaAsset[]> {
  let q = db().from("social_meta_assets").select(META_ASSET_COLUMNS).eq("organization_id", brandId);
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q.order("kind").order("label").order("external_id");
  if (error) fail(error, "Meta assets");
  return ((data ?? []) as Array<Record<string, unknown>>).map(metaAssetOf);
}

/** Resolves a webhook entry globally by provider asset id; disabled rows intentionally resolve to null. */
export async function findEnabledMetaAsset(kind: MetaAssetKind, externalId: string): Promise<MetaAsset | null> {
  const { data, error } = await db().from("social_meta_assets").select(META_ASSET_COLUMNS)
    .eq("kind", kind).eq("external_id", externalId).eq("enabled", true).maybeSingle();
  if (error) fail(error, "Meta asset");
  return data ? metaAssetOf(data as Record<string, unknown>) : null;
}

/** Brand-scoped lookup used before every ads read/write; this is the cross-brand isolation guard. */
export async function findEnabledMetaAssetForBrand(brandId: string, kind: MetaAssetKind, externalId: string): Promise<MetaAsset | null> {
  const { data, error } = await db().from("social_meta_assets").select(META_ASSET_COLUMNS)
    .eq("organization_id", brandId).eq("kind", kind).eq("external_id", externalId).eq("enabled", true).maybeSingle();
  if (error) fail(error, "Meta asset");
  return data ? metaAssetOf(data as Record<string, unknown>) : null;
}

export type MetaAssetInput = {
  kind: MetaAssetKind;
  externalId: string;
  pageExternalId: string | null;
  label: string | null;
};

export async function addMetaAsset(brandId: string, input: MetaAssetInput, actor: string): Promise<MetaAsset> {
  const { data, error } = await db().from("social_meta_assets").insert({
    organization_id: brandId, kind: input.kind, external_id: input.externalId,
    page_external_id: input.pageExternalId, label: input.label, enabled: true,
  }).select(META_ASSET_COLUMNS).single();
  if (error) fail(error, "add Meta asset");
  await logAction(db(), brandId, actor, "meta_asset_add", { kind: input.kind, external_id: input.externalId });
  return metaAssetOf(data as Record<string, unknown>);
}

export async function setMetaAssetEnabled(brandId: string, assetId: string, enabled: boolean, actor: string): Promise<MetaAsset> {
  const { data, error } = await db().from("social_meta_assets").update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", assetId).eq("organization_id", brandId).select(META_ASSET_COLUMNS).maybeSingle();
  if (error) fail(error, "update Meta asset");
  if (!data) throw new SocialStoreError(404, "no such Meta asset in this brand");
  await logAction(db(), brandId, actor, "meta_asset_enable", { asset_id: assetId, enabled });
  return metaAssetOf(data as Record<string, unknown>);
}

/** Ads status writes spend money: actor = the staff user, organization_id = the brand acted for (on_behalf_of). */
export async function recordMetaAdsStatusChange(brandId: string, actor: string, detail: Record<string, unknown>): Promise<void> {
  await logAction(db(), brandId, actor, "meta_ads_campaign_status", detail);
}

// ---- brands ---------------------------------------------------------------------------------------------------

export interface Brand { id: string; slug: string; name: string; default_timezone: string }

/** null = every brand (staff); otherwise only these ids (a client: its own organization and its member brands). */
export async function listBrands(onlyIds: readonly string[] | null): Promise<Brand[]> {
  if (onlyIds && onlyIds.length === 0) return [];
  let q = db().from("organizations").select("id, slug, name, default_timezone").order("name");
  if (onlyIds) q = q.in("id", [...onlyIds]);
  const { data, error } = await q;
  if (error) fail(error, "brands");
  return (data ?? []) as Brand[];
}

/** This person's per-brand roles (social_brand_members, 0096). user_id = the auth user id middleware injects. */
export async function memberRoles(userId: string): Promise<Map<string, BrandRole>> {
  const { data, error } = await db().from("social_brand_members").select("organization_id, role").eq("user_id", userId);
  if (error) fail(error, "brand members");
  return new Map((data ?? []).map((r: { organization_id: string; role: BrandRole }) => [r.organization_id, r.role]));
}

// ---- members (0103) -------------------------------------------------------------------------------------------

export interface Member { user_id: string; email: string | null; role: BrandRole; created_at: string }

/** The member functions' refusals in words a brand owner can act on (customers see these; the database text is not). */
const MEMBER_REFUSALS: Array<[string, RegExp, 400 | 404 | 409, string]> = [
  ["SC404", /no account/, 404, ACCOUNT_COPY.members_no_account_error],
  ["SC404", /not a member/, 404, "這個人已經不是此品牌的成員"],
  ["SC409", /already a member/, 409, "這個人已經是此品牌的成員"],
  ["SC409", /last owner/, 409, "品牌至少要留一位擁有者：先把另一位成員設成擁有者"],
  ["22023", /more than one account/, 409, "這個 email 對到不只一個帳號，請聯絡 AwareWave 處理"],
  ["22023", /role must be/, 400, "角色只能是擁有者、編輯、審核人或唯讀"],
];
function memberFail(error: { code?: string; message: string }, what: string): never {
  const hit = MEMBER_REFUSALS.find(([code, re]) => error.code === code && re.test(error.message));
  if (hit) throw new SocialStoreError(hit[2], hit[3]);
  fail(error, what);
}

export async function listMembers(brandId: string): Promise<Member[]> {
  const { data, error } = await db().rpc("social_list_members", { p_org: brandId });
  if (error) memberFail(error, "members");
  return (data ?? []) as Member[];
}

/** By email; the account must exist (0103 social_add_member). Returns the member's user id. */
export async function addMember(brandId: string, email: string, role: BrandRole, actor: string): Promise<string> {
  const { data, error } = await db().rpc("social_add_member", { p_org: brandId, p_email: email, p_role: role, p_actor: actor });
  if (error) memberFail(error, "add member");
  return data as string;
}

/** The last owner row stays (0103 social_lock_members_for_change). */
export async function setMemberRole(brandId: string, userId: string, role: BrandRole, actor: string): Promise<void> {
  const { error } = await db().rpc("social_set_member_role", { p_org: brandId, p_user: userId, p_role: role, p_actor: actor });
  if (error) memberFail(error, "member role");
}

export async function removeMember(brandId: string, userId: string, actor: string): Promise<void> {
  const { error } = await db().rpc("social_remove_member", { p_org: brandId, p_user: userId, p_actor: actor });
  if (error) memberFail(error, "remove member");
}

// ---- accounts -------------------------------------------------------------------------------------------------

/** picture / handle: null = not looked up yet, "" = Postiz has none (0105). */
export interface Account {
  id: string; platform: string; label: string; status: "connected" | "expired" | "disabled"; postiz_integration_id: string;
  picture: string | null; handle: string | null; chatwoot_inbox_id: number | null;
}
export interface OpenAttempt { id: string; platform: string; started_at: string }

const ATTEMPT_TTL_MS = 15 * 60 * 1000;   // a connection nobody finished frees the brand and the instance again
const POSTIZ_INSTANCE = "ks-aw-01";        // 0096/0098 default: the one Postiz every brand shares

const profileOf = (i: RawIntegration) => ({ picture: (i.picture ?? "").slice(0, 2048), handle: (i.profile ?? "").slice(0, 200) });

export async function listAccounts(brandId: string, options: { hydrateProfile?: boolean } = {}): Promise<Account[]> {
  const sb = db();
  const { data, error } = await sb.from("social_accounts").select("id, platform, label, status, postiz_integration_id, picture, handle, chatwoot_inbox_id")
    .eq("organization_id", brandId).order("platform");
  if (error) fail(error, "accounts");
  const accounts = (data ?? []) as Account[];
  if (options.hydrateProfile !== false && accounts.some((a) => a.picture === null || a.handle === null)) await fillProfiles(sb, accounts);
  return accounts;
}

/** 0105 backfill: picture and handle from Postiz for accounts never looked up. Best effort: without an answer the
 *  list is shown without them and the next load tries again. */
async function fillProfiles(sb: SupabaseClient, accounts: Account[]): Promise<void> {
  let live: RawIntegration[];
  try {
    live = await listAllIntegrations();
  } catch (e) {
    console.error(`[social] channel pictures: Postiz did not answer: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  for (const a of accounts) {
    if (a.picture !== null && a.handle !== null) continue;
    const i = live.find((x) => x.id === a.postiz_integration_id);
    // Postiz answered without it: "" (none), or every load would ask Postiz again (critic 2026-10-17); a reconnect refills
    const p = i ? profileOf(i) : { picture: "", handle: "" };
    const { error } = await sb.from("social_accounts").update(p).eq("id", a.id);
    if (error) console.error(`[social] channel picture for ${a.id}: ${error.message}`);
    else Object.assign(a, p);
  }
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
      const { error: upErr } = await sb.from("social_accounts").update({ status: "connected", ...profileOf(now) }).eq("id", acc.id);
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
        .insert({ organization_id: brandId, postiz_integration_id: fresh.id, platform: fresh.identifier, label: fresh.name, status: fresh.disabled ? "expired" : "connected", ...profileOf(fresh) })
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
  await logAction(sb, brandId, "system:social-connect", "connected", { account_id: accountId, platform: open.platform });
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
  await logAction(sb, brandId, actor, "connect_start", { platform, attempt_id: attempt.id, reconnect: refreshAccountId });
  return { attemptId: attempt.id, url };
}

/** The person gave up on a connection: frees the brand (and the instance's new-channel slot) now, not after the TTL. */
export async function cancelConnect(brandId: string, attemptId: string, actor: string): Promise<void> {
  const sb = db();
  const { data, error } = await sb.from("social_connect_attempts").update({ outcome: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", attemptId).eq("organization_id", brandId).is("outcome", null).select("id, platform");
  if (error) fail(error, "cancel connect");
  if (!data?.length) throw new SocialStoreError(404, "no open connection with that id in this brand");
  await logAction(sb, brandId, actor, "connect_cancel", { attempt_id: attemptId, platform: data[0].platform });
}

/** Unlinks the channel from the brand (the Postiz integration itself stays). Refused while posts target it. */
export async function unlinkAccount(brandId: string, accountId: string, actor: string): Promise<void> {
  const sb = db();
  const { data, error } = await sb.from("social_accounts").delete().eq("id", accountId).eq("organization_id", brandId).select("id, platform, label");
  if (error) fail(error, "unlink account (posts still target it?)");
  if (!data?.length) throw new SocialStoreError(404, "no such account in this brand");
  await logAction(sb, brandId, actor, "unlink", { account_id: accountId, platform: data[0].platform, label: data[0].label });
}

// ---- posts ----------------------------------------------------------------------------------------------------

// No created_by: it holds actorOf() (staff role + auth user id) and posts go to customers too; the audit log, which
// filters it per viewer (authz.ts actorForViewer), is where "who" is shown.
// first_comment = comments[position 0] until C21 moves the sender to comments (0105 header). Embedded comments come
// back unordered: sort by position.
export const POST_COLUMNS = "id, state, body, scheduled_at, list_id, list_position, first_comment, link_url, link_utm, notes, source_url, " +
  "published_at, deleted_at, version, created_at, updated_at, repeat, repeat_of, origin_slot, auto_mode, " +
  "targets:social_post_targets(id, account_id, custom_body, format, state, postiz_post_id, meta_post_id, release_url, error), " +
  "media:social_post_media(media_id, position, alt_text), " +
  "comments:social_post_comments(position, body, delay_minutes, media_id), tags:social_post_tags(tag_id)";

export type AutoMode = "brand" | "none" | "own";
export interface CommentInput { body: string; delay_minutes?: 0 | 1 | 5 | 60; media_id?: string | null }

export interface PostRow {
  id: string; state: PostState; body: string; scheduled_at: string | null; list_id: string | null; list_position: number | null;
  first_comment: string | null; link_url: string | null; link_utm: boolean; notes: string | null; source_url: string | null;
  published_at: string | null; deleted_at: string | null; version: number;
  /** 0105: a template holds repeat; its children carry repeat_of + origin_slot (neither ever changes) */
  repeat: RepeatRule | null; repeat_of: string | null; origin_slot: string | null; auto_mode: AutoMode;
  targets: Array<{ id: string; account_id: string; custom_body: string | null; format: string; state: string; postiz_post_id: string | null; meta_post_id?: string | null; release_url: string | null; error: string | null }>;
  media: Array<{ media_id: string; position: number; alt_text: string | null }>;
  comments: Array<{ position: number; body: string; delay_minutes: number; media_id: string | null }>;
  tags: Array<{ tag_id: string }>;
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

/** Who put each of these posts in the bin, and from which state: the newest `delete` row of the audit log per post (C22's
 *  已刪除貼文). Actors are raw; the route filters them per viewer (authz.ts actorForViewer). */
export async function listDeletions(brandId: string, postIds: string[]): Promise<Record<string, { actor: string; from: string | null }>> {
  if (!postIds.length) return {};
  const { data, error } = await db().from("social_audit_log").select("post_id, actor, detail").eq("organization_id", brandId)
    .eq("action", "delete").in("post_id", postIds).order("id", { ascending: false });
  if (error) fail(error, "who deleted");
  const out: Record<string, { actor: string; from: string | null }> = {};
  for (const r of (data ?? []) as Array<{ post_id: string | null; actor: string; detail: { from?: unknown } | null }>) {
    if (r.post_id && !(r.post_id in out)) out[r.post_id] = { actor: r.actor, from: typeof r.detail?.from === "string" ? r.detail.from : null };
  }
  return out;
}

// ---- saved texts (C6 editor 常用文字; 0112 keeps the chosen media order) -----------------------------------------

export async function listTexts(brandId: string): Promise<Array<{ id: string; body: string; mediaIds: string[] }>> {
  const { data, error } = await db().rpc("social_list_saved_texts", { p_org: brandId });
  if (error) fail(error, "saved texts");
  return ((data ?? []) as Array<{ id: string; body: string; media_ids: string[] | null }>).map((row) => ({
    id: row.id, body: row.body, mediaIds: Array.isArray(row.media_ids) ? row.media_ids : [],
  }));
}

export async function addText(brandId: string, body: string, mediaIds: string[] = []): Promise<{ id: string; body: string; mediaIds: string[] }> {
  const { data, error } = await db().rpc("social_save_text", { p_org: brandId, p_body: body, p_media_ids: mediaIds });
  if (error) fail(error, "save text");
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; body: string; media_ids?: string[] | null };
  return { id: row.id, body: row.body, mediaIds: Array.isArray(row.media_ids) ? row.media_ids : mediaIds };
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

/** A published Meta target owns the provider's post/media id; unknown ids deliberately return null. */
export async function findPostIdByMetaId(brandId: string, platform: string, metaPostId: string): Promise<string | null> {
  const { data: targets, error: targetError } = await db().from("social_post_targets")
    .select("post_id, account_id").eq("organization_id", brandId).eq("meta_post_id", metaPostId).eq("state", "published").limit(10);
  if (targetError) fail(targetError, "Meta post mapping");
  const rows = (targets ?? []) as Array<{ post_id: string; account_id: string }>;
  if (!rows.length) return null;
  const { data: accounts, error: accountError } = await db().from("social_accounts")
    .select("id").eq("organization_id", brandId).eq("platform", platform).in("id", rows.map((row) => row.account_id));
  if (accountError) fail(accountError, "Meta account mapping");
  const accountIds = new Set((accounts ?? []).map((account) => account.id as string));
  return rows.find((row) => accountIds.has(row.account_id))?.post_id ?? null;
}

/** The post as the caller last saw it. A decision taken against version N is written with N (0098 CAS), so a newer
 *  row is refused here, not decided against one state and written onto another (review 2026-10-15). */
export async function getPostAt(brandId: string, id: string, version: number): Promise<PostRow> {
  const post = await getPost(brandId, id);
  if (post.version !== version) throw new SocialStoreError(409, `post changed since version ${version} (now ${post.version}); reload it`);
  return post;
}

export interface PostFields {
  body?: string; first_comment?: string | null; link_url?: string | null; link_utm?: boolean; notes?: string | null; source_url?: string | null;
  repeat?: RepeatRule | null; auto_mode?: AutoMode;
}
export interface TargetInput { account_id: string; custom_body?: string | null; format?: string }
export interface MediaInput { media_id: string; position?: number; alt_text?: string | null }
/** null / absent = unchanged; comments replace the set in this order (position 0 = first_comment, 0105) */
export interface PostChildren { comments?: CommentInput[] | null; tags?: string[] | null }
/** repeat: a template's children made right after the write; error = they were not now (the daily run makes them) */
export interface SavedPost { id: string; version: number; repeat?: { made: number } | { error: string } }

const REPEAT_ACTOR = "system:social-repeat";

export interface SeriesRow {
  id: string; organization_id: string; version: number; repeat: RepeatRule | null; scheduled_at: string | null;
  organization: { default_timezone: string } | null;
}
export const SERIES_COLUMNS = "id, organization_id, version, repeat, scheduled_at, organization:organizations(default_timezone)";

/** A template's children for the next REPEAT_DAYS (0105 social_repeat_materialize: once per slot, only for a template
 *  that may send). `withdraw` first takes back the untouched ones: 0105's save and state functions already did that
 *  in their own transaction, 0100's release did not. The slots are computed from the version read; when the template
 *  moved meanwhile the database answers -1 (0109) and it is read again -- old slots never get new content. */
export async function materializeSeries(sb: SupabaseClient, post: SeriesRow, withdraw: boolean, now = new Date()): Promise<number> {
  let row: SeriesRow | null = post;
  for (let attempt = 0; attempt < 3 && row; attempt++) {
    const tz = row.organization?.default_timezone ?? "UTC";
    const slots = row.repeat && row.scheduled_at ? repeatSlots(row.repeat, row.scheduled_at, tz, now) : [];
    if (!withdraw && !slots.length) return 0;
    const { data, error } = await sb.rpc("social_repeat_materialize", {
      p_org: row.organization_id, p_template: row.id, p_slots: slots, p_withdraw: withdraw, p_actor: REPEAT_ACTOR, p_expected_version: row.version,
    });
    if (error) fail(error, "repeat series");
    if (data !== -1) return (data as number) ?? 0;
    const again = await sb.from("social_posts").select(SERIES_COLUMNS).eq("id", row.id).eq("organization_id", row.organization_id).maybeSingle();
    if (again.error) fail(again.error, "repeat series");
    row = again.data as unknown as SeriesRow | null;
  }
  if (!row) return 0;   // the template is gone
  throw new SocialStoreError(409, `repeat series ${post.id}: the template kept changing; the next run makes its children`);
}

/** After a person's write: a template's children again. Never fails the write, which already landed. */
async function refreshSeries(sb: SupabaseClient, brandId: string, id: string, withdraw: boolean): Promise<SavedPost["repeat"]> {
  try {
    const { data, error } = await sb.from("social_posts").select(SERIES_COLUMNS).eq("id", id).eq("organization_id", brandId).maybeSingle();
    if (error) fail(error, "repeat series");
    if (!data?.repeat) return undefined;
    return { made: await materializeSeries(sb, data as unknown as SeriesRow, withdraw) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[social] repeat series of ${id}: ${message}`);
    return { error: message };
  }
}

export async function savePost(brandId: string, id: string | null, expectedVersion: number | null, fields: PostFields,
  targets: TargetInput[] | null, media: MediaInput[] | null, actor: string, children: PostChildren = {}): Promise<SavedPost> {
  const sb = db();
  const { data, error } = await sb.rpc("social_save_post", {
    p_org: brandId, p_post_id: id, p_expected_version: expectedVersion, p_post: fields, p_targets: targets, p_media: media, p_actor: actor,
    p_comments: children.comments ?? null, p_tags: children.tags ?? null,
  });
  if (error) fail(error, "save post");
  const row = (data as Array<{ saved_post_id: string; saved_version: number }>)[0];
  const repeat = await refreshSeries(sb, brandId, row.saved_post_id, false);
  return { id: row.saved_post_id, version: row.saved_version, ...(repeat ? { repeat } : {}) };
}

export async function setState(brandId: string, id: string, expectedVersion: number, next: Transition, actor: string,
  action: string, detail: Record<string, unknown> = {}): Promise<SavedPost> {
  const sb = db();
  const { data, error } = await sb.rpc("social_set_state", {
    p_org: brandId, p_post_id: id, p_expected_version: expectedVersion, p_state: next.state, p_scheduled_at: next.scheduledAt,
    p_list_id: next.listId, p_list_position: next.listPosition, p_actor: actor, p_action: action, p_detail: detail,
  });
  if (error) fail(error, `${action} post`);
  const row = (data as Array<{ saved_post_id: string; saved_version: number }>)[0];
  const repeat = await refreshSeries(sb, brandId, row.saved_post_id, false);
  return { id: row.saved_post_id, version: row.saved_version, ...(repeat ? { repeat } : {}) };
}

/** 「全部」 on a series (0105 social_stop_repeat): the rule and the untouched children go; the template stays. */
export async function stopRepeat(brandId: string, id: string, expectedVersion: number, actor: string): Promise<{ id: string; version: number; withdrawn: number }> {
  const { data, error } = await db().rpc("social_stop_repeat", { p_org: brandId, p_template: id, p_expected_version: expectedVersion, p_actor: actor });
  if (error) fail(error, "stop repeat");
  const row = (data as Array<{ saved_post_id: string; saved_version: number; withdrawn: number }>)[0];
  return { id: row.saved_post_id, version: row.saved_version, withdrawn: row.withdrawn };
}

/** A queued post changed by a person, after withdraw.ts deleted its Postiz posts (0100 social_release_post). */
export async function releasePost(brandId: string, id: string, expectedVersion: number, deletedPostizIds: string[], next: Transition,
  actor: string, action: string, detail: Record<string, unknown> = {}): Promise<SavedPost> {
  const sb = db();
  const { data, error } = await sb.rpc("social_release_post", {
    p_org: brandId, p_post_id: id, p_expected_version: expectedVersion, p_deleted_postiz_ids: deletedPostizIds, p_state: next.state,
    p_scheduled_at: next.scheduledAt, p_actor: actor, p_action: action, p_detail: detail,
  });
  if (error) fail(error, `${action} post`);
  const row = (data as Array<{ saved_post_id: string; saved_version: number }>)[0];
  const repeat = await refreshSeries(sb, brandId, row.saved_post_id, true);   // 0100's release withdraws no children
  return { id: row.saved_post_id, version: row.saved_version, ...(repeat ? { repeat } : {}) };
}

/** Platform per account of this brand, for the body limits. An account of another brand is simply absent. */
export async function accountPlatforms(brandId: string, accountIds: string[]): Promise<Map<string, string>> {
  if (!accountIds.length) return new Map();
  const { data, error } = await db().from("social_accounts").select("id, platform").eq("organization_id", brandId).in("id", accountIds);
  if (error) fail(error, "accounts");
  return new Map((data ?? []).map((a) => [a.id as string, a.platform as string]));
}

// ---- rotation lists --------------------------------------------------------------------------------------------

/** slots (0105 social_list_slots) win; without them weekdays x send_time are the slots (the callers before C23). */
export interface ListSlot { weekday: number; send_time: string }
export interface ListInput { name: string; weekdays: number[]; send_time?: string; active?: boolean; account_ids: string[]; slots?: ListSlot[] }

export async function listLists(brandId: string) {
  const { data, error } = await db().from("social_lists")
    .select("id, name, weekdays, send_time, active, cursor, accounts:social_list_accounts(account_id), slots:social_list_slots(weekday, send_time)")
    .eq("organization_id", brandId).order("name");
  if (error) fail(error, "lists");
  return data ?? [];
}

/** The list and its account set in one transaction (0101 social_save_list): a refused account leaves both as they
 *  were; the save also withdraws what the list had materialised and not sent (the caller materialises again). */
export async function saveList(brandId: string, id: string | null, input: ListInput, actor: string): Promise<string> {
  const { data, error } = await db().rpc("social_save_list", {
    p_org: brandId, p_list_id: id, p_name: input.name, p_weekdays: input.weekdays, p_send_time: input.send_time ?? "10:00",
    p_active: input.active ?? false, p_account_ids: input.account_ids, p_actor: actor, p_slots: input.slots ?? null,
  });
  if (error) fail(error, "save list");
  return data as string;
}

// ---- tags (0105) -----------------------------------------------------------------------------------------------

/** colour = a token key (the page maps a..e to --red / --accent / --green / --yellow / --p-li) */
export interface Tag { id: string; name: string; colour: "a" | "b" | "c" | "d" | "e" }

export async function listTags(brandId: string): Promise<Tag[]> {
  const { data, error } = await db().from("social_tags").select("id, name, colour").eq("organization_id", brandId).order("name");
  if (error) fail(error, "tags");
  return (data ?? []) as Tag[];
}

/** id null = a new tag. The name is unique per brand ignoring case (409); logged as action tag. */
export async function saveTag(brandId: string, id: string | null, name: string, colour: Tag["colour"], actor: string): Promise<string> {
  const { data, error } = await db().rpc("social_save_tag", { p_org: brandId, p_tag_id: id, p_name: name, p_colour: colour, p_actor: actor });
  if (error) fail(error, "save tag");
  return data as string;
}

/** Off every post it was on, too. */
export async function deleteTag(brandId: string, id: string, actor: string): Promise<void> {
  const { error } = await db().rpc("social_delete_tag", { p_org: brandId, p_tag_id: id, p_actor: actor });
  if (error) fail(error, "delete tag");
}

// ---- auto-reply rules (0105; the composer's 這則的自動回覆 C21, the brand's rules tab C27) ------------------------

/** post_id null = the brand's rule; set = that post's own, which wins over the brand's (ADR 016 §5 decision 6) */
export interface AutoRule {
  id: string; post_id: string | null; name: string; trigger: "comment" | "dm"; keywords: string[]; platforms: string[];
  action: "reply" | "dm" | "both"; reply: string; active: boolean; hits: number;
}
export type AutoRuleInput = Omit<AutoRule, "id" | "hits">;
const RULE_COLUMNS = "id, post_id, name, trigger, keywords, platforms, action, reply, active, hits";

/** postId undefined = the brand's rules; a post id = that post's own rules. */
export async function listAutoRules(brandId: string, postId?: string): Promise<AutoRule[]> {
  const q = db().from("social_auto_rules").select(RULE_COLUMNS).eq("organization_id", brandId);
  const { data, error } = await (postId ? q.eq("post_id", postId) : q.is("post_id", null)).order("created_at").limit(200);
  if (error) fail(error, "auto-reply rules");
  return (data ?? []) as AutoRule[];
}

/** The post an existing rule belongs to (null = the brand's rule); 404 when the rule is not this brand's. */
export async function autoRulePost(brandId: string, ruleId: string): Promise<string | null> {
  const { data, error } = await db().from("social_auto_rules").select("post_id").eq("id", ruleId).eq("organization_id", brandId).maybeSingle();
  if (error) fail(error, "auto-reply rule");
  if (!data) throw new SocialStoreError(404, "no such auto-reply rule in this brand");
  return (data.post_id as string | null) ?? null;
}

/** A post's own rule is its child: saving or deleting one updates the post row, so 0111 refuses a queued post (SC409:
 *  a version moved mid-send makes the sender's record refused and its Postiz post an orphan; the composer unschedules
 *  first) and returns the post's version from the same transaction, for the editor's next compare-and-set. A series
 *  template's untouched children were taken back by the touch (0105); they are made again here. The remake never updates
 *  the template, so the returned version stays current. */
async function afterRuleWrite(brandId: string, postId: string | null): Promise<void> {
  if (postId) await refreshSeries(db(), brandId, postId, false);
}

/** id null = a new rule; post_id is fixed at creation (0105). Logged as action auto_rule. */
export async function saveAutoRule(brandId: string, id: string | null, rule: AutoRuleInput, actor: string): Promise<{ id: string; postVersion: number | null }> {
  const postId = id ? await autoRulePost(brandId, id) : rule.post_id;
  const { data, error } = await db().rpc("social_save_post_rule", { p_org: brandId, p_rule_id: id, p_rule: rule, p_actor: actor });
  if (error) fail(error, "save auto-reply rule");
  const row = (data as Array<{ rule_id: string; post_version: number | null }>)[0];
  await afterRuleWrite(brandId, postId);
  return { id: row.rule_id, postVersion: row.post_version };
}

export async function deleteAutoRule(brandId: string, id: string, actor: string): Promise<{ postVersion: number | null }> {
  const postId = await autoRulePost(brandId, id);
  const { data, error } = await db().rpc("social_delete_post_rule", { p_org: brandId, p_rule_id: id, p_actor: actor });
  if (error) fail(error, "delete auto-reply rule");
  await afterRuleWrite(brandId, postId);
  return { postVersion: (data as number | null) ?? null };
}

/** Claim before the external send; the unique key serialises Meta redeliveries. */
export async function claimAutoRuleEvent(brandId: string, eventId: string, ruleId: string, postId: string | null): Promise<boolean> {
  const { error } = await db().from("social_auto_rule_events").insert({
    organization_id: brandId, event_id: eventId, rule_id: ruleId, post_id: postId, status: "claimed",
  });
  if (error?.code === "23505") return false;
  if (error) fail(error, "auto-reply event claim");
  return true;
}

/** Mark the claimed event after the external send. A failed send stays terminal to prevent a duplicate reply. */
export async function completeAutoRuleEvent(brandId: string, eventId: string, status: "replied" | "failed", errorMessage?: string): Promise<void> {
  const { error } = await db().from("social_auto_rule_events").update({
    status, error: errorMessage?.slice(0, 2000) ?? null, updated_at: new Date().toISOString(),
  }).eq("organization_id", brandId).eq("event_id", eventId).eq("status", "claimed");
  if (error) fail(error, "auto-reply event result");
}

/** 0105's database function increments hits and appends the audit row atomically. */
export async function recordAutoRuleHit(brandId: string, ruleId: string, actor: string, detail: Record<string, unknown>): Promise<number | null> {
  const { data, error } = await db().rpc("social_auto_rule_hit", {
    p_org: brandId, p_rule_id: ruleId, p_actor: actor, p_detail: detail,
  });
  if (error) fail(error, "auto-reply hit");
  return typeof data === "number" ? data : null;
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
  const sb = db();
  const { data, error } = await sb.from("social_media")
    .insert({ organization_id: brandId, kind: "image", file_name: fileName, storage_path: up.path, postiz_media_id: up.id, postiz_path: up.path, created_by: actor })
    .select("id, kind, file_name, postiz_path, created_at").single();
  if (error) fail(error, "media");
  await logAction(sb, brandId, actor, "media_upload", { media_id: data.id, file_name: fileName });
  return { ...data, used: 0 };
}

/** Video counterpart of addImage; kind is stored explicitly so previews do not infer it from a URL. */
export async function addVideo(brandId: string, videoUrl: string, fileName: string, actor: string) {
  let up: { id: string; path: string };
  try {
    up = await uploadVideo({ videoUrl, filename: fileName });
  } catch (e) {
    throw new SocialStoreError(400, `upload refused: ${e instanceof Error ? e.message : String(e)}`);
  }
  const sb = db();
  const { data, error } = await sb.from("social_media")
    .insert({ organization_id: brandId, kind: "video", file_name: fileName, storage_path: up.path, postiz_media_id: up.id, postiz_path: up.path, created_by: actor })
    .select("id, kind, file_name, postiz_path, created_at").single();
  if (error) fail(error, "media");
  await logAction(sb, brandId, actor, "media_upload", { media_id: data.id, file_name: fileName, kind: "video" });
  return { ...data, used: 0 };
}

export async function listLog(brandId: string, beforeId: number | null, limit: number) {
  let q = db().from("social_audit_log").select("id, at, actor, action, post_id, detail").eq("organization_id", brandId)
    .order("id", { ascending: false }).limit(Math.min(Math.max(limit, 1), 200));
  if (beforeId) q = q.lt("id", beforeId);
  const { data, error } = await q;
  if (error) fail(error, "log");
  return data ?? [];
}

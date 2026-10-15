// Review, the per-brand setting and what needs someone (SOCIAL_MANAGER_PLAN.md C8; migration 0102).
//   * require_review (default off): lib/social/state.ts refuses an editor's schedule / publish_now; an editor may not
//     edit an approved (scheduled / queued) post's content without unscheduling it (assertCanEditContent).
//   * needs(): the 「通知 N」 list -- failed posts, channels whose authorisation died, and for an approver the posts
//     waiting for review. One query set, used by the header count and the log's 「需處理」 filter (C11).
//   * Telegram goes through the ops inbox (ingestIncident -> the operator Telegram notifier): a failed post (raised by
//     the sender, dispatch.ts), a channel that expired (reconcileAccounts, daily), a post submitted for review.
// V1 roles come from ops_role (authz.ts); per-person brand members (social_brand_members) need the user id in the
// middleware's identity headers -- an auth change, listed for go-ahead with C12.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { listAllIntegrations } from "@/lib/content/postiz";
import { SocialStoreError } from "./store";
import type { BrandRole, PostState } from "./state";

function db(): SupabaseClient {
  const sb = getSupabaseWriteClient();
  if (!sb) throw new SocialStoreError(500, "Supabase client not configured");
  return sb;
}

function fail(error: { message: string }, what: string): never {
  throw new SocialStoreError(500, `${what}: ${error.message}`);
}

export async function requiresReview(brandId: string): Promise<boolean> {
  const { data, error } = await db().from("social_brand_settings").select("require_review").eq("organization_id", brandId).maybeSingle();
  if (error) fail(error, "brand settings");
  return data?.require_review === true;
}

export async function setRequiresReview(brandId: string, on: boolean, actor: string): Promise<void> {
  const sb = db();
  const { error } = await sb.from("social_brand_settings")
    .upsert({ organization_id: brandId, require_review: on, updated_by: actor, updated_at: new Date().toISOString() });
  if (error) fail(error, "brand settings");
  const { error: logErr } = await sb.from("social_audit_log").insert({ organization_id: brandId, actor, action: "review_setting", detail: { require_review: on } });
  if (logErr) fail(logErr, "log");
}

/** With review required, an editor changes an approved post's content only after unscheduling it. */
export function assertCanEditContent(requireReview: boolean, role: BrandRole, state: PostState): void {
  if (requireReview && role === "editor" && (state === "scheduled" || state === "queued")) {
    throw new SocialStoreError(409, "this brand needs review: unschedule the approved post first, edit it, then submit it again");
  }
}

export interface Needs {
  failed: Array<{ id: string; body: string; scheduled_at: string | null; errors: string[] }>;
  expired: Array<{ id: string; platform: string; label: string }>;
  review: Array<{ id: string; body: string; scheduled_at: string | null }>;
  n: number;
}

export async function needs(brandId: string, role: BrandRole): Promise<Needs> {
  const sb = db();
  const approver = role === "owner" || role === "reviewer";
  const [failed, expired, review] = await Promise.all([
    sb.from("social_posts").select("id, body, scheduled_at, targets:social_post_targets(error)").eq("organization_id", brandId).eq("state", "error")
      .order("scheduled_at", { ascending: false }).limit(100),
    sb.from("social_accounts").select("id, platform, label").eq("organization_id", brandId).eq("status", "expired"),
    approver
      ? sb.from("social_posts").select("id, body, scheduled_at").eq("organization_id", brandId).eq("state", "review").order("updated_at").limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const [r, what] of [[failed, "failed posts"], [expired, "accounts"], [review, "review posts"]] as const) if (r.error) fail(r.error, what);
  const out: Needs = {
    failed: ((failed.data ?? []) as Array<{ id: string; body: string; scheduled_at: string | null; targets: Array<{ error: string | null }> }>)
      .map((p) => ({ id: p.id, body: p.body, scheduled_at: p.scheduled_at, errors: p.targets.map((t) => t.error).filter((e): e is string => !!e) })),
    expired: (expired.data ?? []) as Needs["expired"],
    review: (review.data ?? []) as Needs["review"],
    n: 0,
  };
  out.n = out.failed.length + out.expired.length + out.review.length;
  return out;
}

async function incident(sb: SupabaseClient, organizationId: string, fingerprint: string, title: string, message: string,
  severity: "low" | "medium"): Promise<string | null> {
  const { data: org } = await sb.from("organizations").select("slug").eq("id", organizationId).maybeSingle();
  const r = await ingestIncident(sb, {
    source: "social", external_id: fingerprint, fingerprint, signal_type: "business", severity, service: "social-manager",
    environment: process.env.NODE_ENV === "production" ? "production" : "development", title, message,
    raw: { organization_id: organizationId }, tags: { product: "social" }, client_slug: (org?.slug as string | undefined) ?? null,
  });
  return r.error;
}

/** A post submitted for review: the approvers hear it through the ops inbox's Telegram. Never fails the submit. */
export async function notifyReview(brandId: string, postId: string, body: string): Promise<void> {
  const err = await incident(db(), brandId, `social:review:${postId}`, "社群貼文等待審核", body.slice(0, 300) || "(沒有文字)", "low")
    .catch((e) => String(e));
  if (err) console.error(`[social/review] notify ${postId}: ${err}`);
}

/** Daily (social-rotation run): a channel Postiz shows as disabled is expired here, and someone hears it once. */
export async function reconcileAccounts(): Promise<{ expired: number; errors: string[] }> {
  const sb = db();
  const live = new Map((await listAllIntegrations()).map((i) => [i.id, i]));
  const { data, error } = await sb.from("social_accounts").select("id, organization_id, platform, label, status, postiz_integration_id").eq("status", "connected");
  if (error) fail(error, "accounts");
  const out = { expired: 0, errors: [] as string[] };
  for (const a of data ?? []) {
    const i = live.get(a.postiz_integration_id as string);
    if (i && !i.disabled) continue;
    const { error: upErr } = await sb.from("social_accounts").update({ status: "expired" }).eq("id", a.id).eq("status", "connected");
    if (upErr) { out.errors.push(`${a.id}: ${upErr.message}`); continue; }
    out.expired++;
    const err = await incident(sb, a.organization_id as string, `social:account:${a.id}`, "社群帳號連線失效",
      `${a.platform} ${a.label}：${i ? "Postiz 顯示已停用" : "Postiz 已沒有這個頻道"}，到社群發文的設定重新連接。`, "medium");
    if (err) out.errors.push(`${a.id}: incident ${err}`);
  }
  return out;
}

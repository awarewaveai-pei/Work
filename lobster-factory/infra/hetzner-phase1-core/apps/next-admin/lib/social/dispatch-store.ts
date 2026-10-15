// The database and Postiz side of the sender (dispatch.ts DispatchPorts). Every write is a migration 0100 function, so
// the locks and the claim checks live in one transaction each; reads are plain selects (service role).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { ingestIncident } from "@/lib/ops-inbox/ingest";
import { checkProductionChangeAllowed } from "@/lib/system-modes/production-change-gate";
import { createPost, deletePost, listAllIntegrations, listPosts } from "@/lib/content/postiz";
import { LEASE, type DispatchPorts, type LeaseResult, type QueuedPost, type QueuedTarget } from "./dispatch";

const ACTOR = "system:social-dispatch";
const INSTANCE = "ks-aw-01";   // 0096 default: the one Postiz every brand shares

const SELECT = "id, organization_id, version, state, scheduled_at, updated_at, body, first_comment, link_url, link_utm, " +
  "targets:social_post_targets(id, account_id, custom_body, format, state, postiz_post_id, updated_at, " +
  "account:social_accounts(platform, postiz_integration_id, status)), " +
  "media:social_post_media(position, alt_text, item:social_media(postiz_media_id, postiz_path))";

type Row = {
  id: string; organization_id: string; version: number; state: string; scheduled_at: string; updated_at: string; body: string;
  first_comment: string | null; link_url: string | null; link_utm: boolean;
  targets: Array<{ id: string; account_id: string; custom_body: string | null; format: string; state: QueuedTarget["state"]; postiz_post_id: string | null; updated_at: string;
    account: { platform: string; postiz_integration_id: string; status: string } | null }>;
  media: Array<{ position: number; alt_text: string | null; item: { postiz_media_id: string | null; postiz_path: string | null } | null }>;
};

function toPost(row: Row): QueuedPost {
  return {
    id: row.id, organizationId: row.organization_id, version: row.version, state: row.state, scheduledAt: row.scheduled_at, updatedAt: row.updated_at,
    body: row.body, firstComment: row.first_comment, linkUrl: row.link_url, linkUtm: row.link_utm,
    media: [...row.media].sort((a, b) => a.position - b.position)
      .map((m) => ({ postizMediaId: m.item?.postiz_media_id ?? null, postizPath: m.item?.postiz_path ?? null, altText: m.alt_text })),
    targets: row.targets.map((t) => ({
      id: t.id, accountId: t.account_id, customBody: t.custom_body, format: t.format, state: t.state, postizPostId: t.postiz_post_id, updatedAt: t.updated_at,
      platform: t.account?.platform ?? "", integrationId: t.account?.postiz_integration_id ?? "", accountStatus: t.account?.status ?? "",
    })),
  };
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export function dispatchPorts(sb: SupabaseClient | null = getSupabaseWriteClient()): DispatchPorts {
  if (!sb) throw new Error("Supabase client not configured");
  const ids = (post: QueuedPost) => ({ p_org: post.organizationId, p_post_id: post.id, p_version: post.version });
  return {
    async getBackoff() {
      const data = check(await sb.from("social_dispatch_state").select("backoff_until").eq("postiz_instance", INSTANCE).maybeSingle(), "backoff");
      return data?.backoff_until ? new Date(data.backoff_until as string) : null;
    },
    async setBackoff(until) {
      check(await sb.from("social_dispatch_state").upsert({ postiz_instance: INSTANCE, backoff_until: until.toISOString(), updated_at: new Date().toISOString() }), "set backoff");
    },
    async claimDue(until, limit) {
      const data = check(await sb.rpc("social_claim_due", { p_until: until.toISOString(), p_limit: limit, p_actor: ACTOR }), "claim");
      return (data as unknown[] | null)?.length ?? 0;
    },
    async loadDue(until, limit) {
      const data = check(await sb.from("social_posts").select(SELECT).eq("state", "scheduled").lte("scheduled_at", until.toISOString())
        .order("scheduled_at").limit(limit), "due posts");
      return (data as unknown as Row[]).map(toPost);
    },
    async loadQueued(limit) {
      const data = check(await sb.from("social_posts").select(SELECT).eq("state", "queued").order("scheduled_at").limit(limit), "queued posts");
      return (data as unknown as Row[]).map(toPost);
    },
    async beginSend(post, targetId) {
      const rows = check(await sb.rpc("social_begin_send", { ...ids(post), p_target_id: targetId, p_lease: LEASE }), "begin send") as Array<{ lease: LeaseResult; send_key: string | null }>;
      return { lease: rows[0]?.lease ?? "stale", sendKey: rows[0]?.send_key ?? null };
    },
    async recordSend(post, targetId, postizPostId, error) {
      return check(await sb.rpc("social_record_send", { ...ids(post), p_target_id: targetId, p_postiz_post_id: postizPostId, p_error: error, p_actor: ACTOR }), "record send") as boolean;
    },
    async resetTarget(post, targetId, deleted) {
      return check(await sb.rpc("social_reset_target", { ...ids(post), p_target_id: targetId, p_deleted_postiz_post_id: deleted }), "reset target") as boolean;
    },
    async recordOutcome(post, changes) {
      return check(await sb.rpc("social_record_outcome", { ...ids(post), p_targets: changes, p_actor: ACTOR }), "record outcome") as string | null;
    },
    async setAccountStatus(accountId, status) {
      check(await sb.from("social_accounts").update({ status }).eq("id", accountId).neq("status", "disabled"), "account status");
    },
    async sendAllowed(organizationId) {
      return (await checkProductionChangeAllowed(sb, organizationId)).allowed;
    },
    async raiseIncident(post, message) {
      const { data: org } = await sb.from("organizations").select("slug").eq("id", post.organizationId).maybeSingle();
      const fingerprint = `social:post:${post.id}`;
      const res = await ingestIncident(sb, {
        source: "social", external_id: fingerprint, fingerprint, signal_type: "error", severity: "medium", service: "social-dispatch",
        environment: process.env.NODE_ENV === "production" ? "production" : "development",
        title: "社群貼文送出失敗", message, raw: { post_id: post.id, organization_id: post.organizationId },
        tags: { product: "social" }, client_slug: (org?.slug as string | undefined) ?? null,
      });
      return res.error;
    },
    async loadOrphans(limit) {
      const data = check(await sb.from("social_postiz_orphans").select("postiz_post_id").eq("postiz_instance", INSTANCE)
        .order("found_at").limit(limit), "orphans");
      return (data ?? []).map((r) => r.postiz_post_id as string);
    },
    async orphanGone(postizPostId) {
      check(await sb.from("social_postiz_orphans").delete().eq("postiz_post_id", postizPostId), "orphan gone");
    },
    async orphanFailed(postizPostId, error) {
      const { data } = await sb.from("social_postiz_orphans").select("attempts").eq("postiz_post_id", postizPostId).maybeSingle();
      check(await sb.from("social_postiz_orphans").update({ attempts: ((data?.attempts as number) ?? 0) + 1, last_error: error.slice(0, 2000) })
        .eq("postiz_post_id", postizPostId), "orphan failed");
    },
    postiz: {
      integrations: listAllIntegrations,
      listPosts: (start, end) => listPosts({ start, end }),
      createPost: (o) => createPost(o),
      deletePost,
    },
  };
}

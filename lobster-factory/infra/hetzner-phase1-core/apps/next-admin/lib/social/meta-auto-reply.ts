// C27 execution service. It deliberately runs only after both deployment switches are on;
// Standard Access is the operator's approved path, and IG comment auto-reply is unsupported.
import { matchAutoRule } from "./auto-rules";
import { can } from "@/lib/entitlements/can";
import { autoReplyReady, parseMetaWebhookPayload, replyToMetaEvent, type MetaSocialEnv } from "./meta-webhook";
import { claimAutoRuleEvent, completeAutoRuleEvent, findEnabledMetaAsset, findPostIdByMetaId, listAutoRules, recordAutoRuleHit } from "./store";

export type MetaAutoReplyResult = {
  enabled: boolean;
  received: number;
  matched: number;
  replied: number;
  skipped: number;
  failed: number;
};

const emptyResult = (enabled: boolean): MetaAutoReplyResult => ({ enabled, received: 0, matched: 0, replied: 0, skipped: 0, failed: 0 });

export async function processMetaWebhook(payload: unknown, env: MetaSocialEnv = process.env): Promise<MetaAutoReplyResult> {
  if (!autoReplyReady(env)) return emptyResult(false);
  const events = parseMetaWebhookPayload(payload);
  const result = { ...emptyResult(true), received: events.length };
  if (!events.length) return result;
  for (const event of events) {
    // Meta documents IG comments as an Advanced Access-only notification. Keep parsing the branch for
    // observability/forward compatibility, but never build an auto-reply on that unsupported path.
    if (event.platform === "instagram" && event.kind === "comment") {
      result.skipped++;
      continue;
    }
    const asset = await findEnabledMetaAsset(event.platform === "instagram" ? "instagram_account" : "facebook_page", event.channelId);
    if (!asset) {
      result.skipped++;
      continue;
    }
    const brandRules = await listAutoRules(asset.organizationId);
    const postId = event.metaPostId ? await findPostIdByMetaId(asset.organizationId, event.platform, event.metaPostId) : null;
    const postRules = postId ? await listAutoRules(asset.organizationId, postId) : [];
    const rules = [...brandRules, ...postRules];
    const rule = matchAutoRule(rules, { postId, trigger: event.kind, platform: event.platform, text: event.text });
    const canReply = rule && (event.kind === "comment" ? (rule.action === "reply" || rule.action === "both") : (rule.action === "dm" || rule.action === "both"));
    if (!rule || !canReply) {
      result.skipped++;
      continue;
    }
    const entitlement = await can({ orgId: asset.organizationId, kind: "customer" }, "social.auto-reply", "system:meta-webhook");
    if (!entitlement.allowed) {
      result.skipped++;
      continue;
    }
    if (!(await claimAutoRuleEvent(asset.organizationId, event.eventId, rule.id, postId))) {
      result.skipped++;
      continue;
    }
    result.matched++;
    try {
      await replyToMetaEvent(event, rule.reply, asset, env);
    } catch (error) {
      result.failed++;
      try {
        await completeAutoRuleEvent(asset.organizationId, event.eventId, "failed", error instanceof Error ? error.message : String(error));
      } catch (resultError) {
        console.error(`[social/meta] auto-reply result record failed for ${event.eventId}:`, resultError instanceof Error ? resultError.message : String(resultError));
      }
      console.error(`[social/meta] auto-reply failed for ${event.eventId}:`, error instanceof Error ? error.message : String(error));
      continue;
    }
    // The reply is out: a bookkeeping error below must not relabel it failed. The claim already blocks a resend.
    result.replied++;
    try {
      await completeAutoRuleEvent(asset.organizationId, event.eventId, "replied");
    } catch (error) {
      console.error(`[social/meta] auto-reply result record failed for ${event.eventId}:`, error instanceof Error ? error.message : String(error));
    }
    try {
      await recordAutoRuleHit(asset.organizationId, rule.id, "meta:webhook", {
        event_id: event.eventId, platform: event.platform, kind: event.kind, target_id: event.targetId,
      });
    } catch (error) {
      console.error(`[social/meta] auto-reply hit record failed for ${event.eventId}:`, error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}

// C27 execution service. It deliberately runs only after both deployment switches are on;
// the Meta review switch is set by the operator after Meta approves the requested use case.
import { matchAutoRule } from "./auto-rules";
import { autoReplyReady, getMetaSocialConfig, parseMetaWebhookPayload, replyToMetaEvent, type MetaSocialEnv } from "./meta-webhook";
import { claimAutoRuleEvent, completeAutoRuleEvent, findPostIdByMetaId, listAutoRules, recordAutoRuleHit } from "./store";

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
  const config = getMetaSocialConfig(env);
  const events = parseMetaWebhookPayload(payload);
  const result = { ...emptyResult(true), received: events.length };
  if (!events.length) return result;
  const brandRules = await listAutoRules(config.organizationId);
  for (const event of events) {
    const postId = event.metaPostId ? await findPostIdByMetaId(config.organizationId, event.platform, event.metaPostId) : null;
    const postRules = postId ? await listAutoRules(config.organizationId, postId) : [];
    const rules = [...brandRules, ...postRules];
    const rule = matchAutoRule(rules, { postId, trigger: event.kind, platform: event.platform, text: event.text });
    const canReply = rule && (event.kind === "comment" ? (rule.action === "reply" || rule.action === "both") : (rule.action === "dm" || rule.action === "both"));
    if (!rule || !canReply) {
      result.skipped++;
      continue;
    }
    if (!(await claimAutoRuleEvent(config.organizationId, event.eventId, rule.id, postId))) {
      result.skipped++;
      continue;
    }
    result.matched++;
    try {
      await replyToMetaEvent(event, rule.reply, env);
    } catch (error) {
      result.failed++;
      try {
        await completeAutoRuleEvent(config.organizationId, event.eventId, "failed", error instanceof Error ? error.message : String(error));
      } catch (resultError) {
        console.error(`[social/meta] auto-reply result record failed for ${event.eventId}:`, resultError instanceof Error ? resultError.message : String(resultError));
      }
      console.error(`[social/meta] auto-reply failed for ${event.eventId}:`, error instanceof Error ? error.message : String(error));
      continue;
    }
    // The reply is out: a bookkeeping error below must not relabel it failed. The claim already blocks a resend.
    result.replied++;
    try {
      await completeAutoRuleEvent(config.organizationId, event.eventId, "replied");
    } catch (error) {
      console.error(`[social/meta] auto-reply result record failed for ${event.eventId}:`, error instanceof Error ? error.message : String(error));
    }
    try {
      await recordAutoRuleHit(config.organizationId, rule.id, "meta:webhook", {
        event_id: event.eventId, platform: event.platform, kind: event.kind, target_id: event.targetId,
      });
    } catch (error) {
      console.error(`[social/meta] auto-reply hit record failed for ${event.eventId}:`, error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}

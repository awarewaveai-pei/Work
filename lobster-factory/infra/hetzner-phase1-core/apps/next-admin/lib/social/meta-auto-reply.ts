// C27 execution service. It deliberately runs only after both deployment switches are on;
// the Meta review switch is set by the operator after Meta approves the requested use case.
import { matchAutoRule } from "./auto-rules";
import { autoReplyReady, getMetaSocialConfig, parseMetaWebhookPayload, replyToMetaEvent, type MetaSocialEnv } from "./meta-webhook";
import { autoRuleEventHandled, listAutoRules, recordAutoRuleHit } from "./store";

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
  const rules = await listAutoRules(config.organizationId);
  for (const event of events) {
    if (await autoRuleEventHandled(config.organizationId, event.eventId)) {
      result.skipped++;
      continue;
    }
    const rule = matchAutoRule(rules, { trigger: event.kind, platform: event.platform, text: event.text });
    const canReply = rule && (event.kind === "comment" ? (rule.action === "reply" || rule.action === "both") : (rule.action === "dm" || rule.action === "both"));
    if (!rule || !canReply) {
      result.skipped++;
      continue;
    }
    result.matched++;
    try {
      await replyToMetaEvent(event, rule.reply, env);
      await recordAutoRuleHit(config.organizationId, rule.id, "meta:webhook", {
        event_id: event.eventId, platform: event.platform, kind: event.kind, target_id: event.targetId,
      });
      result.replied++;
    } catch (error) {
      result.failed++;
      console.error(`[social/meta] auto-reply failed for ${event.eventId}:`, error instanceof Error ? error.message : String(error));
    }
  }
  return result;
}

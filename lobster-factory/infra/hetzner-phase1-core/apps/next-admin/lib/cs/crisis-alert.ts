// A customer message about self-harm / suicide (lib/cs/config.ts CS_CRISIS_KEYWORDS) pages the operator
// on Telegram at once (operator decision 2026-10-16, WORKLOG). Same channel, switch and chats as
// ops-inbox and site-watch (buildOperatorTelegramNotifier). Sent before any Chatwoot call, so a failed
// handoff or acknowledgement cannot cost the page; the text therefore claims nothing about either
// (the customer may or may not have received the help-line acknowledgement by the time it is read).
// The customer's words never leave Chatwoot: only a link to the conversation.

import type { TelegramDelivery } from "@/lib/ops-inbox/notify/telegram";
import type { ChatwootConfig } from "@/lib/cs/types";

/** What the page is about: self-harm / suicide, or a threat to hurt other people (CS_THREAT_KEYWORDS). */
export type CrisisPageKind = "self_harm" | "threat";

const PAGE_TITLE: Record<CrisisPageKind, string> = {
  self_harm: "🔴 客服：客人的訊息提到自傷或自殺",
  threat: "🔴 客服：客人的訊息提到要傷害別人",
};

export function crisisAlertText(organizationId: string, conversationId: string, chatwoot?: ChatwootConfig, kind: CrisisPageKind = "self_harm"): string {
  const link = chatwoot
    ? `${chatwoot.baseUrl.replace(/\/+$/, "")}/app/accounts/${chatwoot.accountId}/conversations/${conversationId}`
    : `Chatwoot 對話 #${conversationId}`;
  return [
    PAGE_TITLE[kind],
    "請馬上打開對話，親自確認並回覆客人。",
    link,
    `（org=${organizationId}）`,
  ].join("\n");
}

/** Best-effort by design: a failed page is reported by the caller, not retried. */
export async function alertOperatorOfCrisis(
  send: ((text: string) => Promise<TelegramDelivery>) | null,
  organizationId: string,
  conversationId: string,
  chatwoot?: ChatwootConfig,
  kind: CrisisPageKind = "self_harm",
): Promise<TelegramDelivery> {
  if (!send) return { kind: "rejected", code: "telegram_notify_disabled" };
  return send(crisisAlertText(organizationId, conversationId, chatwoot, kind));
}

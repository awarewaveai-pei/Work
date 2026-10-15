// Chatwoot Account API client — the OUTBOUND half of the AgentBot integration (Pattern A, plan §16).
// Inbound (webhook → handleInbound) lives in app/api/webhooks/chatwoot/route.ts, which imports this
// module to (a) verify the webhook really came from Chatwoot and (b) send the engine's decision back.
//
// Live against a real Chatwoot instance (chatwoot.aware-wave.com, Account #1) since 2026-09-11 — this
// is no longer a written-against-docs-only, unexercised module.

import { timingSafeEqual } from "crypto";
import { getSecret } from "@/lib/secret-vault";
import { CS_TIMEOUTS } from "@/lib/cs/config";
import type { ChatwootConfig } from "@/lib/cs/types";

/**
 * CORRECTED 2026-09-11 after a real, deployed, signed-nowhere delivery: the ORIGINAL version of this
 * function checked X-Chatwoot-Signature/X-Chatwoot-Timestamp — a real Chatwoot header scheme, but for
 * a DIFFERENT feature (the general-purpose "Webhooks" resource under Settings > Integrations).
 * Pattern A (D8, this integration's actual design) delivers via the inbox's `webhook_url` and the
 * AgentBot's `outgoing_url`, both of which route through `Webhooks::Trigger#perform_request` — read
 * directly from the deployed Chatwoot image (`/app/app/services/webhooks/trigger.rb`): the outbound
 * POST sends only `{content_type: :json, accept: :json}`, no signature header, ever. The original
 * function would reject 100% of real traffic on this path — confirmed live (every real delivery
 * 401'd; `chatwoot-sidekiq` logs showed Chatwoot receiving and logging the 401 as a delivery failure).
 *
 * Fix: a shared token in the webhook URL's query string (`?token=...`), the standard workaround for
 * this documented Chatwoot gap — Chatwoot POSTs to whatever URL string is configured, query string
 * included, so this needs no cooperation from Chatwoot's own (nonexistent, for this path) signing.
 * Same secret this app already stores as `cs:chatwoot:{orgId}:webhook_secret` (the inbox's hmac_token,
 * reused as a shared secret rather than an HMAC key — value doesn't change, only how it's checked).
 */
export function verifyWebhookToken(providedToken: string | null, expectedToken: string | undefined): boolean {
  if (!providedToken || !expectedToken) return false;
  const a = Buffer.from(providedToken);
  const b = Buffer.from(expectedToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vault-backed secret lookup, scoped to ONE key (not both — the webhook path only ever needs
 * webhook_secret, and paying for the api_token round-trip on every inbound message was wasted work).
 * Degrades to null on any vault error — getSecret() throws (secret-vault.ts's documented behavior);
 * every lib/cs/ module promises callers it never throws (db.ts's own header states this), so the
 * throw is caught and swallowed HERE, at the vault boundary, not left for route.ts to guard against. */
async function loadSecret(name: string): Promise<string | null> {
  try {
    return await getSecret(name);
  } catch {
    return null;
  }
}

export async function loadWebhookSecret(organizationId: string): Promise<string | null> {
  return loadSecret(`cs:chatwoot:${organizationId}:webhook_secret`);
}

async function loadApiToken(organizationId: string): Promise<string | null> {
  return loadSecret(`cs:chatwoot:${organizationId}:api_token`);
}

interface ChatwootRequestOpts {
  config: ChatwootConfig;
  apiToken: string;
  path: string; // e.g. `/conversations/123/messages`
  method?: "GET" | "POST" | "PATCH" | "PUT";
  body?: unknown;
}

async function chatwootRequest<T>({ config, apiToken, path, method = "POST", body }: ChatwootRequestOpts): Promise<T> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/v1/accounts/${config.accountId}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", api_access_token: apiToken },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Every other outbound fetch in lib/cs/ bounds itself (see llm.ts + CS_TIMEOUTS) — this one
    // didn't, so an unreachable/hung Chatwoot could block the webhook handler past even the platform
    // function timeout, meaning route.ts's own catch-block Sentry capture might never run either.
    signal: AbortSignal.timeout(CS_TIMEOUTS.chatwootMs),
  });
  if (!res.ok) throw new Error(`chatwoot_api_${res.status}`);
  return (await res.json()) as T;
}

/** Send a customer-visible message (auto_sent reply, handoff acknowledgement). */
export async function sendReply(organizationId: string, config: ChatwootConfig, conversationId: string, text: string): Promise<void> {
  const apiToken = await loadApiToken(organizationId);
  if (!apiToken) throw new Error("chatwoot_api_token_missing");
  await chatwootRequest({ config, apiToken, path: `/conversations/${conversationId}/messages`, body: { content: text, message_type: "outgoing" } });
}

/** Rename a contact (PUT /contacts/:id; other fields are left as stored). */
export async function updateContactName(organizationId: string, config: ChatwootConfig, contactId: number, name: string): Promise<void> {
  const apiToken = await loadApiToken(organizationId);
  if (!apiToken) throw new Error("chatwoot_api_token_missing");
  await chatwootRequest({ config, apiToken, method: "PUT", path: `/contacts/${contactId}`, body: { name } });
}

/** The contact's current name (contacts/show.json.jbuilder wraps it in payload). */
export async function getContactName(organizationId: string, config: ChatwootConfig, contactId: number): Promise<string | undefined> {
  const apiToken = await loadApiToken(organizationId);
  if (!apiToken) throw new Error("chatwoot_api_token_missing");
  const res = await chatwootRequest<{ payload?: { name?: unknown } }>({ config, apiToken, method: "GET", path: `/contacts/${contactId}` });
  return typeof res.payload?.name === "string" ? res.payload.name : undefined;
}

export interface ChatwootMessageSummary {
  id: number;
  /** 0 incoming, 1 outgoing, 2 activity, 3 template (message_type_before_type_cast). */
  messageType: number;
  private: boolean;
  content: string;
}

/**
 * Chatwoot MessageFinder: `after` = up to 100 messages with id > after; `before` = the 20 latest with
 * id < before. Both oldest first.
 */
export async function listMessages(
  organizationId: string,
  config: ChatwootConfig,
  conversationId: string,
  window: { after: number } | { before: number },
): Promise<ChatwootMessageSummary[]> {
  const apiToken = await loadApiToken(organizationId);
  if (!apiToken) throw new Error("chatwoot_api_token_missing");
  const query = "after" in window ? `after=${window.after}` : `before=${window.before}`;
  const res = await chatwootRequest<{ payload?: Array<{ id?: unknown; message_type?: unknown; private?: unknown; content?: unknown }> }>({
    config, apiToken, method: "GET", path: `/conversations/${conversationId}/messages?${query}`,
  });
  return (res.payload ?? [])
    .filter((m) => typeof m.id === "number" && typeof m.message_type === "number")
    .map((m) => ({
      id: m.id as number,
      messageType: m.message_type as number,
      private: m.private === true,
      content: typeof m.content === "string" ? m.content : "",
    }));
}

/** Draft path (answerLevel L1): a PRIVATE note, visible only to the agent, never sent to the customer. */
export async function sendPrivateDraft(organizationId: string, config: ChatwootConfig, conversationId: string, text: string): Promise<void> {
  const apiToken = await loadApiToken(organizationId);
  if (!apiToken) throw new Error("chatwoot_api_token_missing");
  await chatwootRequest({ config, apiToken, path: `/conversations/${conversationId}/messages`, body: { content: text, message_type: "outgoing", private: true } });
}

/** Hand off to a human: flip pending → open so the conversation surfaces in the agent inbox (plan §6).
 * Deliberately does NOT pick an assignee — no assignment policy exists yet (who's on shift, load
 * balancing, etc.); Chatwoot's own team/inbox routing rules own that until a real policy is designed. */
export async function handoffToHuman(organizationId: string, config: ChatwootConfig, conversationId: string): Promise<void> {
  const apiToken = await loadApiToken(organizationId);
  if (!apiToken) throw new Error("chatwoot_api_token_missing");
  await chatwootRequest({ config, apiToken, path: `/conversations/${conversationId}/toggle_status`, body: { status: "open" } });
}

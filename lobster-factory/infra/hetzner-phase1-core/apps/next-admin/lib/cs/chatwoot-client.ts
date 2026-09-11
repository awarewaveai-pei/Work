// Chatwoot Account API client — the OUTBOUND half of the AgentBot integration (Pattern A, plan §16).
// Inbound (webhook → handleInbound) lives in app/api/webhooks/chatwoot/route.ts, which imports this
// module to (a) verify the webhook really came from Chatwoot and (b) send the engine's decision back.
//
// Live against a real Chatwoot instance (chatwoot.aware-wave.com, Account #1) since 2026-09-11 — this
// is no longer a written-against-docs-only, unexercised module.

import { createHmac, timingSafeEqual } from "crypto";
import { getSecret } from "@/lib/secret-vault";
import { CS_TIMEOUTS } from "@/lib/cs/config";
import type { ChatwootConfig } from "@/lib/cs/types";

/**
 * Verify X-Chatwoot-Signature per Chatwoot's documented webhook-signing scheme:
 *   sha256=HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 * KNOWN CAVEAT (chatwoot/chatwoot#13809, still open as of this writing): some Chatwoot versions sign
 * with an internal `hmac_token` that does NOT match the `secret` field the REST API returns for the
 * same webhook — i.e. the value you'd fetch via the API to configure this function may not be the
 * value actually used to sign. If verification fails 100% of the time once U6 is live, this is the
 * first thing to check: get the secret from the Chatwoot admin UI directly, not the API.
 */
export function verifyChatwootSignature(rawBody: string, signatureHeader: string | null, timestampHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !signatureHeader || !timestampHeader) return false;
  const prefix = "sha256=";
  const stripped = signatureHeader.startsWith(prefix) ? signatureHeader.slice(prefix.length) : signatureHeader;
  const provided = stripped.toLowerCase(); // tolerate an uppercase-hex sender; never widens what's accepted, only case
  const computed = createHmac("sha256", secret).update(`${timestampHeader}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(computed);
  const b = Buffer.from(provided);
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
  method?: "GET" | "POST" | "PATCH";
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

/** Send the engine's reply as an outgoing message (answerLevel L2 / auto_sent path). */
export async function sendReply(organizationId: string, config: ChatwootConfig, conversationId: string, text: string): Promise<void> {
  const apiToken = await loadApiToken(organizationId);
  if (!apiToken) throw new Error("chatwoot_api_token_missing");
  await chatwootRequest({ config, apiToken, path: `/conversations/${conversationId}/messages`, body: { content: text, message_type: "outgoing" } });
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

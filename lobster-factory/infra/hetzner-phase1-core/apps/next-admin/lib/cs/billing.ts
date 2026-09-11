// cs-engine billing bridge — deliberately reuses the EXISTING media_credit_reserve RPC (0066) instead
// of building a second parallel ledger. agency-os/docs/architecture/decisions/012-shared-platform-layer.md
// (proposed 2026-09-10) already analyzed cross-product billing and decided the eventual shape is
// "generalize 0066 in place" (drop the media_ prefix, add product_key) — NOT a second cs_billing_*
// pair. That ADR is still PROPOSED, not accepted, and its own decision-8 ordering puts ledger work
// LAST behind a product registry + signed entitlements neither of which exist yet. Building the full
// ADR is out of scope for the customer-service feature; this module is the bridge: reuse what's
// already live, tag CS usage distinctly via reference_type, and do nothing that the eventual
// "generalize 0066" migration would need to undo. When that migration lands, only the RPC name this
// file calls needs to change — the call site and its semantics stay identical.
//
// OPT-IN, not a blocking gate: an organization with NO media_billing_accounts row is treated as
// unmetered (internal/canary usage, e.g. Account#0) — see reserveCsCredit's early return. Wiring this
// as a hard default-deny gate would have silently broken every existing CS conversation the moment
// this shipped, since no org has ever been granted CS-specific credits.

import { getSupabaseWriteClient } from "@/lib/supabase-server";

export interface CreditReserveResult {
  metered: boolean; // false = org has no billing account row; call was a no-op, always proceed
  allowed: boolean; // only meaningful when metered
  balance?: number;
}

/**
 * Reserve 1 unit of CS usage against the org's existing (media-labelled) credit ledger, if and only
 * if that org has opted into billing (has a media_billing_accounts row). Idempotent per Chatwoot
 * message id — safe to call once per message.
 *
 * The RAW Chatwoot message id (a short decimal string, e.g. "42") must NEVER be passed straight
 * through as the ledger's idempotency_key: (1) 0066's CHECK requires length BETWEEN 8 AND 128 —
 * every message id under 8 digits (i.e. nearly all of them, for a long time) would fail that CHECK
 * inside the RPC, which this function's own fail-open `if (error)` branch would then silently
 * swallow, making metering a complete no-op with zero visible signal; (2) each org's Chatwoot
 * account has its own independent message-id sequence, so two DIFFERENT orgs can produce the SAME
 * bare id — and 0066's RPC explicitly raises when one idempotency_key is claimed by two organization
 * ids. Namespacing by organizationId fixes both: it's always long enough, and it's globally unique
 * across orgs even when the underlying Chatwoot ids collide.
 */
export async function reserveCsCredit(organizationId: string, chatwootMessageId: string): Promise<CreditReserveResult> {
  const sb = getSupabaseWriteClient();
  if (!sb) return { metered: false, allowed: true };

  const { data: account, error: accountError } = await sb
    .from("media_billing_accounts")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (accountError) {
    // eslint-disable-next-line no-console -- best-effort visibility only; must not block a reply
    console.error("[cs/billing] media_billing_accounts lookup failed, treating as unmetered", accountError);
  }
  if (!account) return { metered: false, allowed: true }; // unmetered org — proceed, no ledger write

  const idempotencyKey = `cs:${organizationId}:${chatwootMessageId}`;
  const { data, error } = await sb.rpc("media_credit_reserve", {
    p_organization_id: organizationId,
    p_units: 1,
    p_idempotency_key: idempotencyKey,
    p_reference_type: "cs_reply",
    p_reference_id: chatwootMessageId,
  });
  if (error) {
    // eslint-disable-next-line no-console -- same rationale: visible, but never blocking
    console.error("[cs/billing] media_credit_reserve failed, allowing through unmetered for this message", error);
    return { metered: true, allowed: true };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { metered: true, allowed: Boolean(row?.allowed), balance: Number(row?.balance ?? 0) };
}

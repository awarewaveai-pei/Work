// The one place a one-time sign-in link into a door is minted (ADR 018 §1: each door has its own session, cookie is
// host-only). Two callers prove who the person is, then both come here: wp-handoff (a cash-register site's signed request,
// lib/auth/sources/awarewave-wp.ts) and POST /portal/api/door (the person's own portal session). The checks after the
// proof are the same for both, so there is exactly one copy of them.
import type { SupabaseClient } from "@supabase/supabase-js";

export type DoorLinkOutcome =
  | { ok: true; url: string }
  | { ok: false; status: 403 | 503; error: "auth_lookup_failed" | "not_this_account" | "email_unverified" | "link_failed" };

/** `next`: where the door's /login/wp page sends the person after the exchange; the caller has already restricted it. */
export async function mintDoorLink(db: SupabaseClient, account: { userId: string; organizationId: string }, host: string, next?: string): Promise<DoorLinkOutcome> {
  const { data: got, error: getErr } = await db.auth.admin.getUserById(account.userId);
  if (getErr || !got?.user?.email) return { ok: false, status: 503, error: "auth_lookup_failed" };
  // Still this organization's client (as client-invite.ts belongsTo): a later app_metadata change must not open a door.
  const meta = (got.user.app_metadata ?? {}) as Record<string, unknown>;
  if (String(meta.user_kind ?? "").toLowerCase() !== "client" || meta.org_id !== account.organizationId) {
    return { ok: false, status: 403, error: "not_this_account" };
  }
  // Only an email the person proved (the mailed set-password link) may be signed in from WordPress: WooCommerce does
  // not verify emails, and verifying a recovery token marks the email proven (client-invite.ts header) -- without this
  // check, registering on aware-wave.com with someone else's address would hand that address's account to the payer
  // and fake the 0103 proof. The first entry is always the mailed link. (critic 2026-10-25 High)
  if (!got.user.email_confirmed_at) return { ok: false, status: 403, error: "email_unverified" };
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "recovery", email: got.user.email });
  const hashed = link?.properties?.hashed_token;
  // generateLink goes by email; it must have resolved the same account (an email changed in between is not this member).
  if (linkErr || !hashed || link.user?.id !== account.userId) return { ok: false, status: 503, error: "link_failed" };
  const target = next ? `&next=${encodeURIComponent(next)}` : "";
  // uid: the account the link signs in to, so a door already signed in to that same account just continues (WpSignIn).
  return { ok: true, url: `https://${host}/login/wp#token_hash=${encodeURIComponent(hashed)}&type=recovery&uid=${encodeURIComponent(account.userId)}${target}` };
}

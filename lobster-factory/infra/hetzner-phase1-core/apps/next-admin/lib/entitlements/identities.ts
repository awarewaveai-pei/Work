import type { SupabaseClient } from "@supabase/supabase-js";
import { isCustomerRoot } from "./subject";

/** A member of one cash-register site (0133: an outside id is unique only within its site). provider follows the
 *  site: aware-wave.com = awarewave-wp, every other site = customer-wp (lib/payments/sites.ts siteIdentityProvider). */
export interface Identity {
  provider: "awarewave-wp" | "customer-wp";
  siteId: string;
  externalId: string;
}

export interface BillingAccountIdentity {
  organizationId: string;
  userId: string;
}

type IdentityRow = {
  external_id: string;
  organization_id: string;
  user_id: string;
};

function account(row: IdentityRow): BillingAccountIdentity {
  return { organizationId: row.organization_id, userId: row.user_id };
}

export async function findBillingAccount(
  db: SupabaseClient,
  id: Identity,
): Promise<BillingAccountIdentity | null> {
  const { data, error } = await db
    .from("customer_identities")
    .select("external_id, organization_id, user_id")
    .eq("provider", id.provider)
    .eq("site_id", id.siteId)
    .eq("external_id", id.externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? account(data as IdentityRow) : null;
}

async function findExistingIdentity(
  db: SupabaseClient,
  input: Identity & { userId: string; organizationId: string },
): Promise<IdentityRow | null> {
  const byExternalId = await db
    .from("customer_identities")
    .select("external_id, organization_id, user_id")
    .eq("site_id", input.siteId)
    .eq("external_id", input.externalId)
    .maybeSingle();
  if (byExternalId.error) throw new Error(byExternalId.error.message);
  if (byExternalId.data) return byExternalId.data as IdentityRow;

  const byUserId = await db
    .from("customer_identities")
    .select("external_id, organization_id, user_id")
    .eq("site_id", input.siteId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (byUserId.error) throw new Error(byUserId.error.message);
  return byUserId.data ? byUserId.data as IdentityRow : null;
}

export async function linkIdentity(
  db: SupabaseClient,
  input: Identity & { userId: string; organizationId: string },
): Promise<BillingAccountIdentity & { created: boolean }> {
  const { data, error } = await db
    .from("customer_identities")
    .insert({
      provider: input.provider,
      site_id: input.siteId,
      external_id: input.externalId,
      user_id: input.userId,
      organization_id: input.organizationId,
    })
    .select("external_id, organization_id, user_id")
    .single();

  if (!error && data) return { ...account(data as IdentityRow), created: true };
  if (error?.code !== "23505") {
    throw new Error(`linkIdentity insert failed: ${error?.message ?? "no row returned"}`);
  }

  const existing = await findExistingIdentity(db, input);
  if (!existing
      || existing.external_id !== input.externalId
      || existing.user_id !== input.userId
      || existing.organization_id !== input.organizationId) {
    throw new Error("identity_conflict");
  }
  return { ...account(existing), created: false };
}

/** The unit's manager = the app account holding the unit's member link (ADR 021 D5). Fails closed: a failed or empty
 *  lookup reads as "not the manager" (a screen shows less, never more). */
export async function isAccountManager(db: SupabaseClient, organizationId: string, userId: string): Promise<boolean> {
  const { data, error } = await db
    .from("customer_identities")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

// ── Staff sign an existing account up as a member (ADR 021 D4, G1; migration 0180 member_invites) ─────────────────────
// Staff name the account and its contact's email; the member proves that email on aware-wave.com, whose signed event
// carries the one-time code back (wp-customers.ts redeemMemberInvite). Never found by email: the code names the account.
// Only the code's sha256 is stored; the plain code leaves this module once, to the staff screen that created it.

export const MEMBER_INVITE_DAYS = 14;
const INVITE_CODE_RE = /^[A-Za-z0-9_-]{43}$/;   // 32 random bytes, base64url

export interface MemberInvite {
  id: string;
  organizationId: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  usedSiteId: string | null;
  usedExternalId: string | null;
  voidedAt: string | null;
}
type InviteRow = {
  id: string; organization_id: string; email: string; expires_at: string; created_at: string;
  used_at: string | null; used_site_id: string | null; used_external_id: string | null; voided_at: string | null;
};
const INVITE_COLS = "id, organization_id, email, expires_at, created_at, used_at, used_site_id, used_external_id, voided_at";
const invite = (r: InviteRow): MemberInvite => ({
  id: r.id, organizationId: r.organization_id, email: r.email, expiresAt: r.expires_at, createdAt: r.created_at,
  usedAt: r.used_at, usedSiteId: r.used_site_id, usedExternalId: r.used_external_id, voidedAt: r.voided_at,
});

export async function hashInviteCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const isInviteCode = (code: unknown): code is string => typeof code === "string" && INVITE_CODE_RE.test(code);

/** Whether this account may be invited: a root customer or test account (0180's trigger says the same) that no member
 *  holds yet (one member, one organization). */
export async function inviteTarget(db: SupabaseClient, organizationId: string): Promise<{ customerRoot: boolean; linked: boolean }> {
  const org = await db.from("organizations").select("kind, parent_organization_id").eq("id", organizationId).maybeSingle();
  if (org.error) throw new Error(org.error.message);
  const row = org.data as { kind: string; parent_organization_id: string | null } | null;
  const held = await db.from("customer_identities").select("organization_id").eq("organization_id", organizationId).limit(1);
  if (held.error) throw new Error(held.error.message);
  return {
    customerRoot: isCustomerRoot(row),
    linked: (held.data ?? []).length > 0,
  };
}

/** The account's live invite (not used, not voided; it may be past its expiry), null if none. */
export async function liveMemberInvite(db: SupabaseClient, organizationId: string): Promise<MemberInvite | null> {
  const { data, error } = await db.from("member_invites").select(INVITE_COLS)
    .eq("organization_id", organizationId).is("used_at", null).is("voided_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? invite(data as InviteRow) : null;
}

/** Voids the account's live invite; true when there was one. */
export async function voidMemberInvite(db: SupabaseClient, organizationId: string): Promise<boolean> {
  const { data, error } = await db.from("member_invites").update({ voided_at: new Date().toISOString() })
    .eq("organization_id", organizationId).is("used_at", null).is("voided_at", null).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** A new invite for this account, voiding the live one (作廢重發). Returns the plain code: shown once, never stored.
 *  The caller checked inviteTarget; 0180's trigger refuses a non-customer account again. A second staff pressing at the
 *  same moment loses on the one-live-invite index: "invite_busy", press again. */
export async function createMemberInvite(db: SupabaseClient, input: { organizationId: string; email: string; createdBy: string },
): Promise<{ ok: true; code: string; invite: MemberInvite } | { ok: false; error: "invite_busy" }> {
  await voidMemberInvite(db, input.organizationId);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = Buffer.from(bytes).toString("base64url");
  const expires = new Date(Date.now() + MEMBER_INVITE_DAYS * 86_400_000).toISOString();
  const { data, error } = await db.from("member_invites")
    .insert({ organization_id: input.organizationId, email: input.email, code_hash: await hashInviteCode(code), expires_at: expires, created_by: input.createdBy })
    .select(INVITE_COLS).single();
  if (error?.code === "23505") return { ok: false, error: "invite_busy" };
  if (error || !data) throw new Error(`member invite insert failed: ${error?.message ?? "no row"}`);
  return { ok: true, code, invite: invite(data as InviteRow) };
}

/** The invite a code names (used and voided ones too, so the caller can say why), null for an unknown code. */
export async function findMemberInviteByCode(db: SupabaseClient, code: string): Promise<MemberInvite | null> {
  const { data, error } = await db.from("member_invites").select(INVITE_COLS).eq("code_hash", await hashInviteCode(code)).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? invite(data as InviteRow) : null;
}

/** Marks the invite used by this member. True also when this same member used it before (a retried event); false when
 *  someone else took it, staff voided it, or it expired in the meantime. */
export async function claimMemberInvite(db: SupabaseClient, inviteId: string, by: { siteId: string; externalId: string }): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await db.from("member_invites")
    .update({ used_at: now, used_site_id: by.siteId, used_external_id: by.externalId })
    .eq("id", inviteId).is("used_at", null).is("voided_at", null).gt("expires_at", now).select("id");
  if (error) throw new Error(error.message);
  if ((data ?? []).length > 0) return true;
  const again = await db.from("member_invites").select("used_site_id, used_external_id").eq("id", inviteId).maybeSingle();
  if (again.error) throw new Error(again.error.message);
  const row = again.data as { used_site_id: string | null; used_external_id: string | null } | null;
  return !!row && row.used_site_id === by.siteId && row.used_external_id === by.externalId;
}

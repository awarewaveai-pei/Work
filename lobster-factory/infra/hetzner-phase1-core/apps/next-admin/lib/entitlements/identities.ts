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

/** PAYMENT PATH ONLY (wp-customers.ts ensureWpCustomer): the account a member managed before a transfer replaced them
 *  (0182 former_customer_identities, latest replacement first), so money they moved while managing it stays its. Never
 *  for sign-in or visibility (wp-handoff, wp-summary, awarewave-wp source, isAccountManager use the current identity
 *  only): the replaced manager is out. A caller asks findBillingAccount first -- a current identity always wins. */
export async function findFormerAccount(db: SupabaseClient, id: Identity): Promise<{ organizationId: string } | null> {
  const { data, error } = await db
    .from("former_customer_identities")
    .select("organization_id")
    .eq("provider", id.provider)
    .eq("site_id", id.siteId)
    .eq("external_id", id.externalId)
    .order("replaced_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { organization_id: string } | undefined;
  return row ? { organizationId: row.organization_id } : null;
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

/** A new invite for this account, voiding the live one (作廢重發) in the same transaction (0180 member_invite_issue): a
 *  failed insert leaves the old code valid. Returns the plain code: shown once, never stored. The caller checked
 *  inviteTarget; 0180's trigger refuses a non-customer account again. A unique clash: "invite_busy", press again. */
export async function createMemberInvite(db: SupabaseClient, input: { organizationId: string; email: string; createdBy: string },
): Promise<{ ok: true; code: string; invite: MemberInvite } | { ok: false; error: "invite_busy" }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = Buffer.from(bytes).toString("base64url");
  const expires = new Date(Date.now() + MEMBER_INVITE_DAYS * 86_400_000).toISOString();
  const { data, error } = await db.rpc("member_invite_issue", {
    p_organization_id: input.organizationId, p_email: input.email, p_code_hash: await hashInviteCode(code),
    p_expires_at: expires, p_created_by: input.createdBy,
  });
  if (error?.code === "23505") return { ok: false, error: "invite_busy" };
  if (error || !data) throw new Error(`member invite issue failed: ${error?.message ?? "no row"}`);
  return { ok: true, code, invite: invite(data as InviteRow) };
}

/** The invite a code names (used and voided ones too, so the caller can say why), null for an unknown code. */
export async function findMemberInviteByCode(db: SupabaseClient, code: string): Promise<MemberInvite | null> {
  const { data, error } = await db.from("member_invites").select(INVITE_COLS).eq("code_hash", await hashInviteCode(code)).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? invite(data as InviteRow) : null;
}

/** Links this member to the invite's account and marks the invite used, in one transaction under the account's lock
 *  (0180 member_invite_redeem): every check is made again there, so two invites of one account never both link.
 *  "ok" also for this member's retried event; else a refusal code (invite_used, invite_org_linked, ...).
 *  Since 0184 service_role may not call it: the member-event route passes redeemMemberInviteEvent (stamped) instead. */
export async function redeemMemberInviteAtomic(db: SupabaseClient, input: Identity & { inviteId: string; userId: string; email: string },
): Promise<string> {
  const { data, error } = await db.rpc("member_invite_redeem", {
    p_invite_id: input.inviteId, p_provider: input.provider, p_site_id: input.siteId, p_external_id: input.externalId,
    p_user_id: input.userId, p_email: input.email,
  });
  if (error) throw new Error(`member invite redeem failed: ${error.message}`);
  if (typeof data !== "string" || !data) throw new Error("member invite redeem returned no reason");
  return data;
}

// ── Transfer the membership to another person (ADR 021 D5, G5; migration 0182) ─────────────────────────────────────────
// A transfer is a member invite that names the identity it replaces (member_invites.transfer_of). Nothing changes until
// the new person redeems it on aware-wave.com: then 0182 member_invite_redeem deletes the old identity, writes the audit
// row and the new identity in one transaction under the account's lock. Before that the old member stays the manager.

export interface MemberTransferStatus {
  /** the current manager (the identity holder); email null when its profile has none */
  manager: { userId: string; email: string | null } | null;
  /** the live transfer, null if none (an expired one stays live until staff reissue or void it) */
  transfer: { email: string; reason: string; createdAt: string; expiresAt: string } | null;
}

export async function memberTransferStatus(db: SupabaseClient, organizationId: string): Promise<MemberTransferStatus> {
  const held = await db.from("customer_identities").select("user_id").eq("organization_id", organizationId).maybeSingle();
  if (held.error) throw new Error(held.error.message);
  const userId = (held.data as { user_id: string } | null)?.user_id ?? null;
  let manager: MemberTransferStatus["manager"] = null;
  if (userId) {
    const prof = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
    if (prof.error) throw new Error(prof.error.message);
    manager = { userId, email: (prof.data as { email: string | null } | null)?.email ?? null };
  }
  const live = await db.from("member_invites").select("email, transfer_reason, created_at, expires_at, transfer_of")
    .eq("organization_id", organizationId).is("used_at", null).is("voided_at", null).maybeSingle();
  if (live.error) throw new Error(live.error.message);
  const row = live.data as { email: string; transfer_reason: string | null; created_at: string; expires_at: string; transfer_of: string | null } | null;
  const transfer = row?.transfer_of
    ? { email: row.email, reason: row.transfer_reason ?? "", createdAt: row.created_at, expiresAt: row.expires_at }
    : null;
  return { manager, transfer };
}

/** The identity a transfer invite replaces, null for an ordinary invite. */
export async function memberInviteTransferOf(db: SupabaseClient, inviteId: string): Promise<string | null> {
  const { data, error } = await db.from("member_invites").select("transfer_of").eq("id", inviteId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { transfer_of: string | null } | null)?.transfer_of ?? null;
}

const TRANSFER_REFUSALS = ["not_linked", "same_member"] as const;
export type MemberTransferRefusal = (typeof TRANSFER_REFUSALS)[number] | "invite_busy";

/** A transfer invite for this account (0182 member_transfer_issue: voids the live invite in the same transaction). The
 *  account must have a member, and the email must not be that member's own. Returns the plain code: shown once. */
export async function createMemberTransfer(db: SupabaseClient, input: {
  organizationId: string; email: string; reason: string; createdBy: string; actorRole: "owner" | "admin";
}): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: MemberTransferRefusal }> {
  const code = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const expires = new Date(Date.now() + MEMBER_INVITE_DAYS * 86_400_000).toISOString();
  const { data, error } = await db.rpc("member_transfer_issue", {
    p_organization_id: input.organizationId, p_email: input.email, p_code_hash: await hashInviteCode(code),
    p_expires_at: expires, p_created_by: input.createdBy, p_reason: input.reason, p_actor_role: input.actorRole,
  });
  if (error?.code === "23505") return { ok: false, error: "invite_busy" };
  const refused = TRANSFER_REFUSALS.find((r) => error?.message?.includes(`member_transfer:${r}`));
  if (refused) return { ok: false, error: refused };
  if (error || !data) throw new Error(`member transfer issue failed: ${error?.message ?? "no row"}`);
  return { ok: true, code, expiresAt: (data as InviteRow).expires_at };
}

// ── Member events: stamped, decided once, never stale (ADR 021 G10; migration 0184) ──────────────────────────────────
// Every member event a site signs carries event_id (the payment events' format) and occurred_at. The database decides
// under the member's lock: the same event_id answers its first result again; an event older than the member's latest
// applied state change (an invite that linked, a deletion) is event_stale. member_deleted moves the identity to
// former_customer_identities (reason "deleted"), so sign-in answers not_a_member; money keeps findFormerAccount.

/** bodySha256: sha256 (hex) of the signed body -- the same event_id with other content is event_id_reused. */
export interface MemberEventStamp { eventId: string; occurredAt: string; bodySha256: string }
export type MemberEventKind = "member_invite" | "member_deleted" | "member_email_changed";

async function rpcText(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  if (typeof data !== "string" || !data) throw new Error(`${fn} returned no result`);
  return data;
}

/** The early answer before any app account is made (no lock; the decision is the stamped function's): a known event's
 *  stored result and account, or event_stale; null = a new event. */
export async function memberEventCheck(db: SupabaseClient, input: Identity & MemberEventStamp & { kind: MemberEventKind },
): Promise<{ result: string; organizationId: string | null } | null> {
  const { data, error } = await db.rpc("member_event_check", {
    p_site_id: input.siteId, p_event_id: input.eventId, p_kind: input.kind, p_external_id: input.externalId, p_occurred_at: input.occurredAt,
    p_body_sha256: input.bodySha256,
  });
  if (error) throw new Error(`member_event_check failed: ${error.message}`);
  const row = data as { result?: unknown; organization_id?: unknown } | null;
  if (!row || typeof row.result !== "string") return null;
  return { result: row.result, organizationId: typeof row.organization_id === "string" ? row.organization_id : null };
}

/** member_invite_redeem behind the event rules (0184 member_event_invite): same answers, plus event_stale / event_id_reused. */
export async function redeemMemberInviteEvent(db: SupabaseClient,
  input: Identity & MemberEventStamp & { inviteId: string; userId: string; email: string }): Promise<string> {
  return rpcText(db, "member_event_invite", {
    p_site_id: input.siteId, p_event_id: input.eventId, p_occurred_at: input.occurredAt, p_body_sha256: input.bodySha256, p_invite_id: input.inviteId,
    p_provider: input.provider, p_external_id: input.externalId, p_user_id: input.userId, p_email: input.email,
  });
}

/** deleted | no_identity | event_stale | event_id_reused */
export async function memberDeletedEvent(db: SupabaseClient, input: Identity & MemberEventStamp): Promise<string> {
  return rpcText(db, "member_event_deleted", {
    p_site_id: input.siteId, p_event_id: input.eventId, p_occurred_at: input.occurredAt, p_body_sha256: input.bodySha256,
    p_provider: input.provider, p_external_id: input.externalId,
  });
}

/** audited | no_identity | event_stale | event_id_reused. Only the two email domains reach the database. */
export async function memberEmailChangedEvent(db: SupabaseClient,
  input: Identity & MemberEventStamp & { oldDomain: string; newDomain: string }): Promise<string> {
  return rpcText(db, "member_event_email_changed", {
    p_site_id: input.siteId, p_event_id: input.eventId, p_occurred_at: input.occurredAt, p_body_sha256: input.bodySha256,
    p_provider: input.provider, p_external_id: input.externalId, p_old_domain: input.oldDomain, p_new_domain: input.newDomain,
  });
}

/** The app account a member_deleted took the identity from (0184 former row, reason "deleted"): the route removes it
 *  (client-invite.ts deleteClientAccount sourceDeleted). Read again on every retry of the event, so nothing else stores it. */
export async function deletedMemberAccount(db: SupabaseClient, id: Identity): Promise<BillingAccountIdentity | null> {
  const { data, error } = await db.from("former_customer_identities").select("organization_id, user_id")
    .eq("site_id", id.siteId).eq("external_id", id.externalId).eq("reason", "deleted")
    .order("replaced_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { organization_id: string; user_id: string } | undefined;
  return row ? { organizationId: row.organization_id, userId: row.user_id } : null;
}

/** When this account's member was deleted on the site (its latest former link, if that was a deletion), with the
 *  brands that deletion left without an owner row (the route's member_account_deleted audit), else null. */
export async function memberDeletedStatus(db: SupabaseClient, organizationId: string,
): Promise<{ at: string; brandsWithoutOwner: string[] } | null> {
  const { data, error } = await db.from("former_customer_identities").select("reason, replaced_at")
    .eq("organization_id", organizationId).order("replaced_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as { reason: string; replaced_at: string } | undefined;
  if (row?.reason !== "deleted") return null;
  const audit = await db.from("ops_audit_events").select("payload").eq("organization_id", organizationId)
    .eq("event_type", "member_account_deleted").order("created_at", { ascending: false }).limit(1);
  if (audit.error) throw new Error(audit.error.message);
  const brands = ((audit.data ?? [])[0] as { payload?: { brands_without_owner?: unknown } } | undefined)?.payload?.brands_without_owner;
  const names = Array.isArray(brands) ? brands.map((b) => (b as { name?: unknown })?.name).filter((n): n is string => typeof n === "string") : [];
  return { at: row.replaced_at, brandsWithoutOwner: names };
}

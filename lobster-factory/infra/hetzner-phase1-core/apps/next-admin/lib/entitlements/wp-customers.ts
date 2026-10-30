// A WordPress member of one cash-register site -> its billing account (ADR 017 step 4b, cards/step-4.md 4b-3; per site
// since 4c-2, cards/step-4-seller.md: one site, one account -- D5). The account records its seller (the site's). The first
// payment of a member who has none creates it: organization, client account, identity row. On aware-wave.com (our own
// site: its key id, never "any site AwareWave sells on" -- critic 2026-10-30 M3) the plugin's email verification is the proof, so the account is made verified and no mail
// is sent; a reseller's site keeps the set-password mail (decision 2026-10-30-customer-self-signup-email-google I6).
// A client staff invited earlier with the same email is linked, not refused, on aware-wave.com only (same decision §5).
// Invariant: one member, one organization. The organization's slug is derived from the WordPress user id and is unique,
// so a retry or two events racing for the same new member land on the same row instead of making a second one; the
// identity row (0124, unique per member and per user) is written last and is the "done" mark. Every step is safe to
// repeat, so a half-made account is finished by the sender's retry. GoTrue and Postgres cannot share a transaction.
import type { SupabaseClient } from "@supabase/supabase-js";
import { findAuthUserByEmail, inviteClientAccount, verifiedClientAccount } from "@/lib/accounts/client-invite";
import { servedNextAdminProducts } from "@/lib/portal/doors";
import { AWARE_WAVE_KEY_ID, siteIdentityProvider, type SellerSite } from "@/lib/payments/sites";
import { findBillingAccount, linkIdentity, type Identity } from "./identities";

/** emailVerified: WordPress (the wp-bridge plugin) proved this member owns the address. WooCommerce does not, so the
 *  plugin must; an account is never made for an unproven address (critic 2026-10-25 second pass, M). */
export type MemberSite = Pick<SellerSite, "id" | "keyId" | "sellerOrganizationId">;
export interface WpMember { site: MemberSite; wpUserId: number; email: string; displayName?: string | null; emailVerified: boolean }

/** Refusals the sender must not retry unchanged (the member's email is already someone else's account, ...). */
export class WpCustomerRefused extends Error {
  constructor(readonly code: string) { super(`wp_customer:${code}`); this.name = "WpCustomerRefused"; }
}

/** aware-wave.com keeps the slugs it had (wp-member-<id>); another site's member is wp-member-<key_id>-<id> (a key id is
 *  2+ characters and the id is digits, so the two shapes never meet). */
export const wpOrgSlug = (site: Pick<SellerSite, "keyId">, wpUserId: number): string =>
  site.keyId === AWARE_WAVE_KEY_ID ? `wp-member-${wpUserId}` : `wp-member-${site.keyId}-${wpUserId}`;
const identityOf = (site: MemberSite, wpUserId: number): Identity =>
  ({ provider: siteIdentityProvider(site), siteId: site.id, externalId: String(wpUserId) });
/** Organizations made before 4c-2 carry no metadata.site_id: all of them are aware-wave.com's. */
const orgSiteMatches = (meta: Record<string, unknown> | null, site: MemberSite): boolean =>
  (meta?.site_id ?? (site.keyId === AWARE_WAVE_KEY_ID && meta?.source === "awarewave-wp" ? site.id : null)) === site.id;

type Org = { id: string; name: string };

/** The member's organization if an earlier call made it; a slug someone else took by hand is refused, never billed. */
export async function findWpOrganization(db: SupabaseClient, site: MemberSite, wpUserId: number): Promise<Org | null> {
  const got = await db.from("organizations").select("id, name, kind, parent_organization_id, metadata").eq("slug", wpOrgSlug(site, wpUserId)).maybeSingle();
  if (got.error) throw new Error(got.error.message);
  const row = got.data as { id: string; name: string; kind: string; parent_organization_id: string | null; metadata: Record<string, unknown> | null } | null;
  if (!row) return null;
  if (row.kind !== "customer" || row.parent_organization_id !== null || row.metadata?.wp_user_id !== wpUserId || !orgSiteMatches(row.metadata, site)) {
    throw new WpCustomerRefused("organization_slug_taken");
  }
  return { id: row.id, name: row.name };
}

/** The member's organization: inserted once, found again by its slug on any later call. */
export async function ensureWpOrganization(db: SupabaseClient, member: WpMember): Promise<Org> {
  const name = (member.displayName ?? "").trim().slice(0, 200) || member.email;
  const ins = await db.from("organizations")
    .insert({
      type: "client", kind: "customer", name, slug: wpOrgSlug(member.site, member.wpUserId),
      sold_by_organization_id: member.site.sellerOrganizationId,   // invariant 2: the buyer is the site's seller's
      metadata: { source: siteIdentityProvider(member.site), wp_user_id: member.wpUserId, site_id: member.site.id },
    })
    .select("id, name").single();
  if (!ins.error && ins.data) return ins.data as Org;
  if (ins.error?.code !== "23505") throw new Error(`wp organization insert failed: ${ins.error?.message ?? "no row"}`);
  const found = await findWpOrganization(db, member.site, member.wpUserId);
  if (!found) throw new Error("wp organization vanished after a duplicate insert");
  return found;
}

/** userId / emailConfirmed: only when GoTrue holds the account (a profile-only owner has neither). orgRootCustomer: the
 *  owner's organization can be billed (0120 billing_apply_payment_event takes only a root customer account). */
export interface EmailOwner {
  userKind: string; orgId: unknown; userId?: string; emailConfirmed?: boolean;
  orgMetadata?: Record<string, unknown> | null; orgRootCustomer?: boolean;
}

/** Who already owns this email, by both places inviteClientAccount reads (GoTrue, then profiles -- a profile can outlive
 *  its auth user and still name another organization, client-invite.ts readyAccount): null = nobody. orgMetadata = the
 *  owner's organization's, so a member of another site can be told apart (email_taken_elsewhere). */
export async function emailOwner(db: SupabaseClient, email: string): Promise<EmailOwner | null> {
  const user = await findAuthUserByEmail(email);
  if (user === "error") throw new Error("auth_lookup_failed");
  let owner: EmailOwner | null = null;
  if (user) {
    const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
    owner = { userKind: String(meta.user_kind ?? "").toLowerCase(), orgId: meta.org_id, userId: user.id, emailConfirmed: Boolean(user.email_confirmed_at) };
  } else {
    const { data, error } = await db.from("profiles").select("default_organization_id").eq("email", email).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) owner = { userKind: "client", orgId: (data as { default_organization_id: string | null }).default_organization_id };
  }
  if (owner?.userKind === "client" && typeof owner.orgId === "string") {
    const org = await db.from("organizations").select("metadata, kind, parent_organization_id").eq("id", owner.orgId).maybeSingle();
    if (org.error) throw new Error(org.error.message);
    const row = org.data as { metadata: Record<string, unknown> | null; kind: string; parent_organization_id: string | null } | null;
    owner.orgMetadata = row?.metadata ?? null;
    owner.orgRootCustomer = row?.kind === "customer" && row.parent_organization_id === null;
  }
  return owner;
}

/** The door the set-password mail points at: the plan's product when its door is served, else the first served door. A plan that
 *  does not exist is refused here, before any account is made: the control plane would refuse the payment anyway. */
async function inviteProductKey(db: SupabaseClient, planKey: string | undefined): Promise<string> {
  const doors = servedNextAdminProducts();
  if (planKey) {
    const { data, error } = await db.from("plans").select("product_key").eq("plan_key", planKey).maybeSingle();
    if (error) throw new Error(error.message);
    const key = (data as { product_key: string } | null)?.product_key;
    if (!key) throw new WpCustomerRefused("unknown_plan");
    if (doors.some((p) => p.key === key)) return key;
  }
  if (!doors.length) throw new Error("no_product_door");
  return doors[0].key;
}

/** The account of a client staff invited (or any client account no site member holds yet) that this member may take
 *  over: same email, proven on both sides -- the site's verification now, so a never-opened invite is confirmed here.
 *  null = not linkable (staff, a site-made organization, one that cannot be billed, or a user or organization some member
 *  already holds: two members on one account would cancel each other's plans -- critic 2026-10-30 L1). */
export async function adoptableClient(db: SupabaseClient, owner: EmailOwner): Promise<{ userId: string; organizationId: string } | null> {
  if (owner.userKind !== "client" || !owner.userId || typeof owner.orgId !== "string") return null;
  if (owner.orgMetadata?.wp_user_id !== undefined || owner.orgRootCustomer !== true) return null;
  const held = await db.from("customer_identities").select("user_id").eq("user_id", owner.userId).limit(1);
  if (held.error) throw new Error(held.error.message);
  if ((held.data ?? []).length > 0) return null;
  const orgHeld = await db.from("customer_identities").select("organization_id").eq("organization_id", owner.orgId).limit(1);
  if (orgHeld.error) throw new Error(orgHeld.error.message);
  if ((orgHeld.data ?? []).length > 0) return null;
  if (!owner.emailConfirmed) {
    const { error } = await db.auth.admin.updateUserById(owner.userId, { email_confirm: true });
    if (error) throw new Error(`confirm_failed: ${error.message}`);
  }
  return { userId: owner.userId, organizationId: owner.orgId };
}

export interface WpCustomerDeps {
  find: typeof findBillingAccount;
  link: typeof linkIdentity;
  existingOrganization: typeof findWpOrganization;
  organization: typeof ensureWpOrganization;
  emailOwner: typeof emailOwner;
  adoptable: typeof adoptableClient;
  invite: typeof inviteClientAccount;
  verified: typeof verifiedClientAccount;
  productKey: (db: SupabaseClient, planKey: string | undefined) => Promise<string>;
}
const DEFAULT_DEPS: WpCustomerDeps = {
  find: findBillingAccount, link: linkIdentity, existingOrganization: findWpOrganization, organization: ensureWpOrganization,
  emailOwner, adoptable: adoptableClient, invite: inviteClientAccount, verified: verifiedClientAccount, productKey: inviteProductKey,
};

async function linkOrRefuse(db: SupabaseClient, deps: WpCustomerDeps, identity: Identity, userId: string, organizationId: string): Promise<void> {
  try {
    await deps.link(db, { ...identity, userId, organizationId });
  } catch (error) {
    if (error instanceof Error && error.message === "identity_conflict") throw new WpCustomerRefused("identity_conflict");
    throw error;
  }
}

/** The member's billing account id. `create` = this event is a payment (subscription_paid, credit_pack): only a payment
 *  may make an account; a refund, cancel or chargeback for an unknown member is a refusal (critic 2026-10-25 M).
 *  Throws WpCustomerRefused for a final refusal, any other error for an outage (the sender retries the same event).
 *  A repeated first payment re-sends the set-password mail (each link replaces the last): the retry's known cost. */
export async function ensureWpCustomer(db: SupabaseClient, member: WpMember, planKey: string | undefined, create: boolean,
  deps: WpCustomerDeps = DEFAULT_DEPS): Promise<{ organizationId: string; created: boolean }> {
  const identity = identityOf(member.site, member.wpUserId);
  const known = await deps.find(db, identity);
  if (known) return { organizationId: known.organizationId, created: false };
  if (!create) throw new WpCustomerRefused("unknown_member");
  if (member.emailVerified !== true) throw new WpCustomerRefused("email_unverified");
  const trusted = member.site.keyId === AWARE_WAVE_KEY_ID;
  // the door a set-password mail points at; aware-wave.com sends none (the plan was already checked: woo-billing maySell)
  const productKey = trusted ? "" : await deps.productKey(db, planKey);

  // The email must be free, or already this member's half-made account, before anything is written: staff's or another
  // organization's email would otherwise leave an orphan organization behind (critic 2026-10-25 M).
  const earlier = await deps.existingOrganization(db, member.site, member.wpUserId);
  const owner = await deps.emailOwner(db, member.email);
  if (owner && !(owner.userKind === "client" && earlier && owner.orgId === earlier.id)) {
    const adopted = trusted && !earlier ? await deps.adoptable(db, owner) : null;
    if (adopted) {
      await linkOrRefuse(db, deps, identity, adopted.userId, adopted.organizationId);
      return { organizationId: adopted.organizationId, created: false };
    }
    // D5: one site, one account. The same person at another site is refused, never merged (an email can change).
    const otherSite = owner.userKind === "client" && owner.orgMetadata?.wp_user_id !== undefined && !orgSiteMatches(owner.orgMetadata ?? null, member.site);
    throw new WpCustomerRefused(otherSite ? "email_taken_elsewhere" : "email_taken");
  }

  const org = earlier ?? await deps.organization(db, member);
  if (trusted) {
    // No mail: a failure is retried by the sender (every step is idempotent), never linked half-confirmed -- a linked
    // unconfirmed account would answer the member's 「進入」 with "check your mail" for a mail that never comes.
    const made = await deps.verified(db, { orgId: org.id, email: member.email });
    if (made.ok === false && (made.status === 409 || made.status === 400)) throw new WpCustomerRefused(made.error);
    if (made.ok === false) throw new Error(`wp customer account failed: ${made.error}`);
    await linkOrRefuse(db, deps, identity, made.userId, org.id);
    return { organizationId: org.id, created: true };
  }
  const invited = await deps.invite(db, { orgId: org.id, orgName: org.name, email: member.email, productKey });
  // A refusal (409/400) is final even when it names a user (client-invite.ts returns one when generateLink resolved
  // someone else): that user is not this member's. A failed mail after the account exists still links it: the payment
  // must not wait for the mail, and the member can ask for a new link at the door. Anything else is retried.
  if (invited.ok === false && (invited.status === 409 || invited.status === 400)) throw new WpCustomerRefused(invited.error);
  if (invited.ok === false && !invited.userId) throw new Error(`wp customer invite failed: ${invited.error}`);
  if (invited.ok === false) console.warn(`[wp-customer] wp_user_id=${member.wpUserId} account made, mail failed: ${invited.error}`);
  await linkOrRefuse(db, deps, identity, invited.userId as string, org.id);
  return { organizationId: org.id, created: true };
}

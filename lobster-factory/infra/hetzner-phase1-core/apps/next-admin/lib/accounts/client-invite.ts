// Staff-created client accounts (ops client hub → 帳號). Invariant (WORKLOG 2026-10-15 續38, migration 0103): an account
// gets a brand role only through an email its owner has proven. So the account is created with email_confirm:false and
// no password; auth.users.email_confirmed_at is set by GoTrue only when the person opens the mailed link and submits
// /login/set-password (verifyOtp). Nothing else records "verified" -- one fact, one place.
// Link: our own page with the hashed token in the URL fragment (never sent to a server, so not in access logs or
// Referer), verified only on a button press so mail scanners that open links do not use it up.
// Every link is GoTrue type "recovery", also for a first invite: generateLink("invite"/"magiclink") CREATES a missing
// user without app_metadata.user_kind, which middleware.ts reads as staff; "recovery" answers 404 instead, and its
// verify confirms an unconfirmed email (supabase/auth verify.go recoverVerify), which is the proof 0103 needs.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { nextAdminProducts, productHost } from "@/lib/portal/doors";
import { sendMail } from "@/lib/mail/resend";
import { inviteMail } from "./invite-copy";

/** Which mail to send; the GoTrue link type is always "recovery" (header). */
export type LinkKind = "invite" | "recovery";

export type InviteOutcome =
  | { ok: true; userId: string; kind: LinkKind; created: boolean }
  | { ok: false; status: 400 | 409 | 500 | 502 | 503; error: string; userId?: string; created?: boolean };

export interface ClientAccount {
  userId: string;
  email: string;
  verified: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export function normalizeEmail(raw: unknown): string | null {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return EMAIL_RE.test(email) && email.length <= 254 ? email : null;
}

/** The door the person will sign in at; only next-admin product doors serve /login/set-password. */
export function inviteProduct(key: unknown) {
  return nextAdminProducts().find((p) => p.key === key) ?? null;
}

export function setPasswordLink(host: string, hashedToken: string): string {
  return `https://${host}/login/set-password#token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
}

function belongsTo(user: User, orgId: string): boolean {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  return String(meta.user_kind ?? "").toLowerCase() === "client" && meta.org_id === orgId;
}

/** The org's client accounts, from organization_memberships (the identity model, 0001_core) + GoTrue's status. */
export async function listClientAccounts(sb: SupabaseClient, orgId: string): Promise<ClientAccount[]> {
  const { data, error } = await sb
    .from("organization_memberships")
    .select("user_id, profiles(email)")
    .eq("organization_id", orgId);
  if (error) throw new Error(`memberships: ${error.message}`);
  const out: ClientAccount[] = [];
  for (const row of (data ?? []) as Array<{ user_id: string; profiles: { email: string } | { email: string }[] | null }>) {
    const { data: got, error: getErr } = await sb.auth.admin.getUserById(row.user_id);
    if (getErr && getErr.status !== 404) throw new Error(`auth user: ${getErr.message}`); // an outage is not "no account"
    const user = got?.user;
    if (!user || !belongsTo(user, orgId)) continue; // staff profiles and other orgs' users are not this list
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    out.push({
      userId: user.id,
      email: user.email ?? profile?.email ?? "",
      verified: Boolean(user.email_confirmed_at),
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
    });
  }
  return out.sort((a, b) => a.email.localeCompare(b.email));
}

/** The membership row, idempotent: also repairs an account whose first setup stopped half-way. */
async function ensureMembership(sb: SupabaseClient, orgId: string, userId: string): Promise<boolean> {
  const { error } = await sb
    .from("organization_memberships")
    .upsert({ organization_id: orgId, user_id: userId, membership_type: "member", status: "active" }, {
      onConflict: "organization_id,user_id",
      ignoreDuplicates: true,
    });
  return !error;
}

/** New account (unverified, no password) + profile + membership. On failure it is undone; if deleting the profile fails
 *  the auth user is kept with it, so pressing the button again finds the pair and finishes it. Left open: deleteUser
 *  failing after the profile is gone, or a createUser whose answer is lost -- an auth user without a profile, which
 *  answers email_taken until removed in Supabase (logged; adopting it needs an auth.users lookup by email). */
async function createAccount(sb: SupabaseClient, orgId: string, email: string): Promise<{ userId: string } | InviteOutcome> {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    email_confirm: false,
    app_metadata: { user_kind: "client", org_id: orgId },
  });
  if (error || !data?.user) {
    const taken = error?.code === "email_exists" || /already/i.test(error?.message ?? "");
    // an auth user with no profile: a staff account or one made outside this flow -- never repurposed here
    return taken ? { ok: false, status: 409, error: "email_taken" } : { ok: false, status: 500, error: "create_failed" };
  }
  const userId = data.user.id;
  const undo = async (why: string): Promise<InviteOutcome> => {
    const { error: profDelErr } = await sb.from("profiles").delete().eq("id", userId); // cascades the membership
    if (profDelErr) {
      console.error("[client-invite] setup failed and undo failed: kept for a retry to finish", { userId, why });
      return { ok: false, status: 500, error: why };
    }
    const { error: delErr } = await sb.auth.admin.deleteUser(userId);
    if (delErr) console.error("[client-invite] CRITICAL: orphan auth user after failed setup", { userId, why, delErr: delErr.message });
    return { ok: false, status: 500, error: why };
  };
  const { error: pErr } = await sb.from("profiles").insert({ id: userId, email, default_organization_id: orgId });
  if (pErr) return undo("profile_write_failed");
  if (!(await ensureMembership(sb, orgId, userId))) return undo("membership_write_failed");
  return { userId };
}

/**
 * Create (or find) the client account for `email` in `orgId` and mail it a set-password link: the invite wording while
 * the email is unverified (opening it is what proves the email), the reset wording once verified (forgotten password,
 * or a person who verified but never chose one). Each send replaces the previous link.
 * Never touches an account that is staff or belongs to another organization.
 */
export async function inviteClientAccount(
  sb: SupabaseClient,
  args: { orgId: string; orgName: string; email: string; productKey: string },
): Promise<InviteOutcome> {
  const product = inviteProduct(args.productKey);
  if (!product) return { ok: false, status: 400, error: "unknown_product" };

  let userId: string;
  let created = false;
  let kind: LinkKind = "invite";
  const { data: profile, error: profErr } = await sb.from("profiles").select("id").eq("email", args.email).maybeSingle();
  if (profErr) return { ok: false, status: 503, error: "profile_lookup_failed" };
  if (profile) {
    const { data: got, error: getErr } = await sb.auth.admin.getUserById((profile as { id: string }).id);
    if (getErr && getErr.status !== 404) return { ok: false, status: 503, error: "auth_lookup_failed" };
    const user = got?.user;
    // generateLink below goes by email, so the account it resolves must be this same user (a profile email can lag
    // an auth email change)
    if (!user || !belongsTo(user, args.orgId) || (user.email ?? "").toLowerCase() !== args.email) {
      return { ok: false, status: 409, error: "email_taken" };
    }
    userId = user.id;
    if (!(await ensureMembership(sb, args.orgId, userId))) return { ok: false, status: 503, error: "membership_write_failed" };
    if (user.email_confirmed_at) kind = "recovery";
  } else {
    const made = await createAccount(sb, args.orgId, args.email);
    if ("ok" in made) return made;
    userId = made.userId;
    created = true;
  }

  // never sends mail itself; "recovery" never creates a user (header). The account it resolved must be the one checked
  // above: between the check and here another request may have deleted it.
  const { data: link, error: linkErr } = await sb.auth.admin.generateLink({ type: "recovery", email: args.email });
  const hashed = link?.properties?.hashed_token;
  if (linkErr || !hashed) return { ok: false, status: 502, error: "link_failed", userId, created };
  if (link.user?.id !== userId) return { ok: false, status: 409, error: "email_taken", userId, created };

  const mail = inviteMail(kind, {
    orgName: args.orgName,
    productName: product.name,
    link: setPasswordLink(productHost(product), hashed),
  });
  const sent = await sendMail({ to: args.email, ...mail });
  // the account stays: pressing 寄出 again sends a fresh link to the same account
  if ("error" in sent) return { ok: false, status: sent.error === "mail_not_configured" ? 503 : 502, error: sent.error, userId, created };
  return { ok: true, userId, kind, created };
}

export type DeleteOutcome = { ok: true; email: string } | { ok: false; status: 404 | 409 | 502 | 503; error: string };

/**
 * Remove a client account of `orgId` (a mistyped email, a person who left). Brand roles are removed first in
 * 社群發文 → 成員, where the last-owner rule lives (0103); an account that still has one is refused here.
 * Auth user first: that ends sign-in at once; the profile (and its membership, by cascade) follows.
 */
export async function deleteClientAccount(sb: SupabaseClient, orgId: string, userId: string): Promise<DeleteOutcome> {
  const { data: got, error: getErr } = await sb.auth.admin.getUserById(userId);
  if (getErr && getErr.status !== 404) return { ok: false, status: 503, error: "auth_lookup_failed" };
  const user = got?.user;
  if (!user || !belongsTo(user, orgId)) return { ok: false, status: 404, error: "account_not_found" };
  const { count, error: memErr } = await sb
    .from("social_brand_members")
    .select("organization_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (memErr) return { ok: false, status: 503, error: "member_lookup_failed" };
  if ((count ?? 0) > 0) return { ok: false, status: 409, error: "still_member" };
  const { error: delErr } = await sb.auth.admin.deleteUser(userId);
  if (delErr) return { ok: false, status: 502, error: "delete_failed" };
  const { error: profErr } = await sb.from("profiles").delete().eq("id", userId);
  // sign-in is already gone; a leftover profile only makes this email answer email_taken until it is removed
  if (profErr) console.error("[client-invite] account deleted, profile left behind", { userId, error: profErr.message });
  return { ok: true, email: user.email ?? "" };
}

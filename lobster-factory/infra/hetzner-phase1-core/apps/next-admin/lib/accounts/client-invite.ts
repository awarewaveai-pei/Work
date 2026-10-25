// Staff-created client accounts (ops client hub → 帳號). Invariant (WORKLOG 2026-10-15 續38, migration 0103): an account
// gets a brand role only through an email its owner has proven. So the account is created with email_confirm:false and
// no password; auth.users.email_confirmed_at is set by GoTrue only when the person opens the mailed link and submits
// /login/set-password (verifyOtp). Nothing else records "verified" -- one fact, one place.
// Link: our own page with the hashed token in the URL fragment (never sent to a server, so not in access logs or
// Referer), verified only on a button press so mail scanners that open links do not use it up.
// Every link is GoTrue type "recovery", also for a first invite: generateLink("invite"/"magiclink") CREATES a missing
// user without app_metadata.user_kind, which middleware.ts reads as staff; "recovery" answers 404 instead, and its
// verify confirms an unconfirmed email (supabase/auth verify.go recoverVerify), which is the proof 0103 needs.
// Self-repair: an account an earlier press left half-made (auth user without profile, or a profile whose auth user is
// gone) is finished or cleared by pressing again -- nobody has to open Supabase. Invariant for every repair step: it
// only touches rows that are provably this client's alone and in use by nothing else; nothing is ever deleted to undo a
// failed press (a half-made account cannot sign in, and the next press completes it), so two presses cannot undo each
// other.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { productHost, servedNextAdminProducts } from "@/lib/portal/doors";
import { getServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-server";
import { sendMail } from "@/lib/mail/resend";
import { inviteMail } from "./invite-copy";

/** Which mail to send; the GoTrue link type is always "recovery" (header). */
export type LinkKind = "invite" | "recovery";

type Fail = { ok: false; status: 400 | 409 | 500 | 502 | 503; error: string; userId?: string; created?: boolean };
export type InviteOutcome = { ok: true; userId: string; kind: LinkKind; created: boolean } | Fail;

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

/** The door the person will sign in at: only a served next-admin door answers /login/set-password (a closed door's
 *  host is 404, middleware.ts door "none"). */
export function inviteProduct(key: unknown) {
  return servedNextAdminProducts().find((p) => p.key === key) ?? null;
}

export function setPasswordLink(host: string, hashedToken: string): string {
  return `https://${host}/login/set-password#token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
}

function belongsTo(user: User, orgId: string): boolean {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  return String(meta.user_kind ?? "").toLowerCase() === "client" && meta.org_id === orgId;
}

/** The auth user with exactly this email, null if none, "error" if GoTrue could not answer. supabase-js listUsers has no
 *  filter; GoTrue's admin list does (`filter` = email ILIKE %x%), so the exact match is made here. */
export async function findAuthUserByEmail(email: string): Promise<User | null | "error"> {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return "error";
  const PER_PAGE = 100;
  for (let page = 1; page <= 1000; page++) {
    let users: User[];
    try {
      const res = await fetch(
        `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&page=${page}&per_page=${PER_PAGE}`,
        { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return "error";
      users = ((await res.json()) as { users?: User[] }).users ?? [];
    } catch {
      return "error";
    }
    const hits = users.filter((u) => (u.email ?? "").toLowerCase() === email);
    if (hits.length > 1) return "error";
    if (hits.length === 1) return hits[0];
    if (users.length < PER_PAGE) return null;
  }
  return "error";
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

type Ready = { userId: string; created: boolean; verified: boolean };

/** An auth user of this org that has no profile (an earlier press stopped half-way): give it its profile + membership. */
async function adoptOrphan(sb: SupabaseClient, orgId: string, email: string): Promise<Ready | Fail> {
  const found = await findAuthUserByEmail(email);
  if (found === "error" || found === null) return { ok: false, status: 503, error: "auth_lookup_failed" };
  if (!belongsTo(found, orgId)) return { ok: false, status: 409, error: "email_taken" }; // staff or another client
  const { data: byId, error: byIdErr } = await sb.from("profiles").select("default_organization_id").eq("id", found.id).maybeSingle();
  if (byIdErr) return { ok: false, status: 503, error: "profile_lookup_failed" };
  const existingOrg = (byId as { default_organization_id: string | null } | null)?.default_organization_id;
  if (byId && existingOrg !== orgId) return { ok: false, status: 409, error: "email_taken" };
  // upsert: a profile row with this id may survive under an old email (the lookup above went by email)
  const { error: pErr } = await sb
    .from("profiles")
    .upsert({ id: found.id, email, default_organization_id: orgId }, { onConflict: "id" });
  if (pErr) return { ok: false, status: 503, error: "profile_write_failed" };
  if (!(await ensureMembership(sb, orgId, found.id))) return { ok: false, status: 503, error: "membership_write_failed" };
  // created: the account shows in the list for the first time
  return { userId: found.id, created: true, verified: Boolean(found.email_confirmed_at) };
}

/** New account (unverified, no password) + profile + membership, each write idempotent. A failure deletes nothing: the
 *  half-made account cannot sign in, and the next press finishes it (adoptOrphan / existing-profile path). */
async function createAccount(sb: SupabaseClient, orgId: string, email: string): Promise<Ready | Fail> {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    email_confirm: false,
    app_metadata: { user_kind: "client", org_id: orgId },
  });
  if (error || !data?.user) {
    const taken = error?.code === "email_exists" || /already/i.test(error?.message ?? "");
    return taken ? adoptOrphan(sb, orgId, email) : { ok: false, status: 500, error: "create_failed" };
  }
  const userId = data.user.id;
  const { error: pErr } = await sb
    .from("profiles")
    .upsert({ id: userId, email, default_organization_id: orgId }, { onConflict: "id" });
  if (pErr) return { ok: false, status: 503, error: "profile_write_failed", userId, created: true };
  if (!(await ensureMembership(sb, orgId, userId))) return { ok: false, status: 503, error: "membership_write_failed", userId, created: true };
  return { userId, created: true, verified: false };
}

/** The account for `email` in `orgId`: existing (repaired if half-made) or new. */
async function readyAccount(sb: SupabaseClient, orgId: string, email: string): Promise<Ready | Fail> {
  const { data, error: profErr } = await sb.from("profiles").select("id, default_organization_id").eq("email", email).maybeSingle();
  if (profErr) return { ok: false, status: 503, error: "profile_lookup_failed" };
  const profile = data as { id: string; default_organization_id: string | null } | null;
  if (!profile) return createAccount(sb, orgId, email);

  const { data: got, error: getErr } = await sb.auth.admin.getUserById(profile.id);
  if (getErr && getErr.status !== 404) return { ok: false, status: 503, error: "auth_lookup_failed" };
  const user = got?.user;
  if (!user) {
    // a profile whose sign-in account is gone: cleared only when it is this client's alone -- no membership in another
    // organization (the delete cascades them). A brand role of the gone account is keyed by its auth id, not the profile
    // (social_brand_members, 0096), so it is untouched here and shows as 「（帳號已刪除）」 in 成員.
    if (profile.default_organization_id !== orgId) return { ok: false, status: 409, error: "email_taken" };
    const { count: elsewhere, error: mErr } = await sb
      .from("organization_memberships")
      .select("organization_id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .neq("organization_id", orgId);
    if (mErr) return { ok: false, status: 503, error: "membership_lookup_failed" };
    if ((elsewhere ?? 0) > 0) return { ok: false, status: 409, error: "email_taken" };
    const { error: delErr } = await sb.from("profiles").delete().eq("id", profile.id);
    if (delErr) return { ok: false, status: 503, error: "profile_cleanup_failed" };
    return createAccount(sb, orgId, email);
  }
  // generateLink goes by email, so the account it resolves must be this same user (a profile email can lag an auth
  // email change)
  if (!belongsTo(user, orgId) || (user.email ?? "").toLowerCase() !== email) return { ok: false, status: 409, error: "email_taken" };
  if (!(await ensureMembership(sb, orgId, user.id))) return { ok: false, status: 503, error: "membership_write_failed" };
  return { userId: user.id, created: false, verified: Boolean(user.email_confirmed_at) };
}

/**
 * Create (or find, or repair) the client account for `email` in `orgId` and mail it a set-password link: the invite
 * wording while the email is unverified (opening it is what proves the email), the reset wording once verified
 * (forgotten password, or a person who verified but never chose one). Each send replaces the previous link.
 * Never touches an account that is staff or belongs to another organization.
 */
export async function inviteClientAccount(
  sb: SupabaseClient,
  args: { orgId: string; orgName: string; email: string; productKey: string },
): Promise<InviteOutcome> {
  const product = inviteProduct(args.productKey);
  if (!product) return { ok: false, status: 400, error: "unknown_product" };

  const ready = await readyAccount(sb, args.orgId, args.email);
  if ("ok" in ready) return ready;
  const { userId, created } = ready;
  const kind: LinkKind = ready.verified ? "recovery" : "invite";

  // never sends mail itself; "recovery" never creates a user (header). The account it resolved must be the one checked
  // above: between the check and here another request may have deleted it.
  const { data: link, error: linkErr } = await sb.auth.admin.generateLink({ type: "recovery", email: args.email });
  const hashed = link?.properties?.hashed_token;
  if (linkErr || !hashed) return { ok: false, status: 502, error: "link_failed", userId, created };
  if (link.user?.id !== userId) return { ok: false, status: 409, error: "email_taken", userId, created };

  const host = productHost(product);
  const mail = inviteMail(kind, {
    orgName: args.orgName,
    productName: product.name,
    link: setPasswordLink(host, hashed),
    login: `https://${host}/login`,
  });
  const sent = await sendMail({ to: args.email, ...mail });
  // the account stays: pressing again sends a fresh link to the same account
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
  // sign-in is already gone; a leftover profile is cleared by the next press for this email (readyAccount)
  if (profErr) console.error("[client-invite] account deleted, profile left behind", { userId, error: profErr.message });
  return { ok: true, email: user.email ?? "" };
}

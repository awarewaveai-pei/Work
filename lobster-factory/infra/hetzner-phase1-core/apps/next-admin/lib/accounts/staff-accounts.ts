// Staff accounts on /ops/staff (agency-os/handoffs/2026-10-24-staff-tool-grants C4): role and ticked tools live in the auth
// user's app_metadata (ops_role, staff_tools) -- the same place middleware reads them, no table of our own.
// Rules: only the owner writes (the route checks); an owner's tools cannot be changed (an owner has every tool); the last
// owner cannot be demoted. Writes run one at a time in this process (the console is one container), so two owners
// demoting each other at once cannot both pass the last-owner check.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { OpsRole } from "@/lib/ops-contracts";
import { staffHosts } from "@/lib/portal/doors";
import { parseStaffTools } from "@/lib/staff-access";
import { sendMail } from "@/lib/mail/resend";
import { inviteMail } from "./invite-copy";
import { findAuthUserByEmail, setPasswordLink } from "./client-invite";

export interface StaffAccount {
  userId: string;
  email: string;
  role: OpsRole;
  /** null = never set (shadow: every tool; enforce: none) */
  tools: string[] | null;
  verified: boolean;
  lastSignInAt: string | null;
}

const ROLES: readonly OpsRole[] = ["owner", "admin", "operator", "viewer"];
export const isOpsRole = (v: unknown): v is OpsRole => typeof v === "string" && (ROLES as readonly string[]).includes(v);

const meta = (u: User) => (u.app_metadata ?? {}) as Record<string, unknown>;
const isStaff = (u: User) => String(meta(u).user_kind ?? "").toLowerCase() !== "client";
// same reading as middleware.ts resolveRoleFromUser: anything else is viewer
const roleOf = (u: User): OpsRole => {
  const raw = String(meta(u).ops_role ?? "").trim().toLowerCase();
  return isOpsRole(raw) ? raw : "viewer";
};

function toAccount(u: User): StaffAccount {
  return {
    userId: u.id,
    email: u.email ?? "",
    role: roleOf(u),
    tools: parseStaffTools(meta(u).staff_tools),
    verified: Boolean(u.email_confirmed_at),
    lastSignInAt: u.last_sign_in_at ?? null,
  };
}

/** Every staff account (auth users that are not customers), owners first, then by email. Throws when GoTrue cannot
 *  answer: an outage must not read as "no owners left". */
export async function listStaff(sb: SupabaseClient): Promise<StaffAccount[]> {
  const out: StaffAccount[] = [];
  const PER_PAGE = 1000;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`list users: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) if (isStaff(u)) out.push(toAccount(u));
    if (users.length < PER_PAGE) {
      return out.sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || a.email.localeCompare(b.email));
    }
  }
  throw new Error("list users: too many pages");
}

let chain: Promise<unknown> = Promise.resolve();
/** Run writes one after another (the last-owner check reads, then writes). */
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

export type UpdateOutcome =
  | { ok: true; before: StaffAccount; after: StaffAccount }
  | { ok: false; status: 400 | 404 | 409 | 502 | 503; error: string };

/** Change one person's role and/or tools. `tools` must be known tool keys (the route validates). */
export function updateStaff(sb: SupabaseClient, userId: string, change: { role?: OpsRole; tools?: string[] }): Promise<UpdateOutcome> {
  return serialized(async () => {
    const { data: got, error: getErr } = await sb.auth.admin.getUserById(userId);
    if (getErr && getErr.status !== 404) return { ok: false, status: 503, error: "auth_lookup_failed" };
    const user = got?.user;
    if (!user || !isStaff(user)) return { ok: false, status: 404, error: "staff_not_found" };
    const before = toAccount(user);
    if (change.tools !== undefined && before.role === "owner") return { ok: false, status: 409, error: "owner_tools_locked" };
    if (change.role !== undefined && before.role === "owner" && change.role !== "owner") {
      let owners: number;
      try {
        owners = (await listStaff(sb)).filter((a) => a.role === "owner").length;
      } catch {
        return { ok: false, status: 503, error: "auth_lookup_failed" };
      }
      if (owners <= 1) return { ok: false, status: 409, error: "last_owner" };
    }
    const next: Record<string, unknown> = { ...meta(user) };
    if (change.role !== undefined) next.ops_role = change.role;
    if (change.tools !== undefined) next.staff_tools = [...new Set(change.tools)];
    const { data: upd, error: updErr } = await sb.auth.admin.updateUserById(userId, { app_metadata: next });
    if (updErr || !upd?.user) return { ok: false, status: 502, error: "update_failed" };
    return { ok: true, before, after: toAccount(upd.user) };
  });
}

export type StaffInviteOutcome =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; status: 409 | 500 | 502 | 503; error: string; userId?: string; created?: boolean };

/** A new staff member: viewer, no tools, unverified until they open the mailed set-password link (the same recovery-link
 *  path as client accounts, lib/accounts/client-invite.ts header). Pressing again for an unverified staff member sends a
 *  fresh link; a verified one or a customer's email is refused. */
export function inviteStaff(sb: SupabaseClient, email: string): Promise<StaffInviteOutcome> {
  return serialized(async () => {
    const found = await findAuthUserByEmail(email);
    if (found === "error") return { ok: false, status: 503, error: "auth_lookup_failed" };
    let userId: string;
    let created = false;
    if (found) {
      if (!isStaff(found)) return { ok: false, status: 409, error: "email_taken" };
      if (found.email_confirmed_at) return { ok: false, status: 409, error: "already_staff" };
      userId = found.id;
    } else {
      const { data, error } = await sb.auth.admin.createUser({
        email,
        email_confirm: false,
        app_metadata: { user_kind: "staff", ops_role: "viewer", staff_tools: [] },
      });
      if (error || !data?.user) return { ok: false, status: 500, error: "create_failed" };
      userId = data.user.id;
      created = true;
    }
    const { data: link, error: linkErr } = await sb.auth.admin.generateLink({ type: "recovery", email });
    const hashed = link?.properties?.hashed_token;
    // a failure after createUser still reports the account, so the route audits it (Codex 2026-10-24 F2)
    if (linkErr || !hashed || link.user?.id !== userId) return { ok: false, status: 502, error: "link_failed", userId, created };
    const host = staffHosts()[0];
    const mail = inviteMail("invite", { orgName: "AwareWave", productName: "員工後台", link: setPasswordLink(host, hashed), login: `https://${host}/login` });
    const sent = await sendMail({ to: email, ...mail });
    if ("error" in sent) return { ok: false, status: sent.error === "mail_not_configured" ? 503 : 502, error: sent.error, userId, created };
    return { ok: true, userId, created };
  });
}

/** The internal organization (organizations.kind = 'internal'): staff-access changes are audited under it. */
export async function internalOrgId(sb: SupabaseClient): Promise<string | null> {
  const { data, error } = await sb.from("organizations").select("id").eq("kind", "internal").limit(1).maybeSingle();
  return error ? null : ((data as { id: string } | null)?.id ?? null);
}

/** One ops_audit_events row per change, under `orgId` (internalOrgId, resolved BEFORE the write: the route refuses to
 *  change access when there is nowhere to audit it). A failed insert after the write is logged and reported as
 *  audited:false, never turned into a failed request (the change already happened; lib/ops-audit.ts). */
export async function auditStaffChange(sb: SupabaseClient, orgId: string, event: string, actorUserId: string, targetUserId: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await sb.from("ops_audit_events").insert({
      organization_id: orgId,
      actor_role: "owner",
      event_type: event,
      target_type: "staff_member",
      target_id: targetUserId,
      trace_id: crypto.randomUUID(),
      payload: { ...payload, actor_user_id: actorUserId },
    });
    if (error) console.error(`[staff-access] ${event} not audited: ${error.message}`, { targetUserId });
    return !error;
  } catch (e) {
    console.error(`[staff-access] ${event} not audited: ${String(e)}`, { targetUserId });
    return false;
  }
}

// The invite link's two ways in (app/invite/page.tsx): engine POST /invites/accept joins a signed-in person, or makes a
// visitor's account in the invitation's workspace (ai_lego/apps/api/blocks/groups.py accept_invite).
import { apiFetch } from "./api";

export type Joined = { group_id: string; identity_id: string; review_state: string };

/** The token of `/invite#<token>`; "" when the link has none. */
export const inviteToken = (hash: string): string => decodeURIComponent(hash.replace(/^#/, "")).trim();

/** A new account from the link. Whoever is signed in on this browser is signed out first, so the link can never join
 * that other person (Codex 2026-10-13 F1); the engine's answer signs the new account in (groups.py accept_invite). */
export async function joinAsNew(token: string, name: string, email: string, password: string): Promise<Joined> {
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
  return apiFetch<Joined>("/invites/accept", { method: "POST", body: JSON.stringify({ token, display_name: name, email, password }) });
}

/** An existing account: sign in first (in ``tenantId`` when the address has several workspaces), then the link joins
 * that account. A 409 LOGIN_CHOOSE_WORKSPACE is thrown before the invitation is touched, so it is still usable. */
export async function joinAsMember(token: string, email: string, password: string, tenantId?: string): Promise<Joined> {
  await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password, ...(tenantId ? { tenant_id: tenantId } : {}) }) });
  return apiFetch<Joined>("/invites/accept", { method: "POST", body: JSON.stringify({ token }) });
}

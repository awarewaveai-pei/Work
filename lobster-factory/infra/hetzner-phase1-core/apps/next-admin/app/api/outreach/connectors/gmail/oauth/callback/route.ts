import { NextResponse } from "next/server";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { putSecret, connectorSecretRef } from "@/lib/secret-vault";
import { appBaseUrl, exchangeCodeForTokens, getGmailProfile, gmailOAuthRedirectUri, verifyState, type OAuthState } from "@/lib/outreach/google-oauth";
import { PRODUCTS } from "@/lib/portal/products";
import { productHost } from "@/lib/portal/hosts";
import { connectedSenderFields, taipeiDay } from "@/lib/outreach/sender";
import { poolEmailRefusal } from "@/lib/outreach/sender-health";
import { baseDomain } from "@/lib/portal/hosts";

// Cold Outreach — Gmail OAuth step 2 (task T10). Google redirects here after consent; no ops-role
// session cookie is guaranteed to be present on this hop (Google's redirect is a fresh top-level
// navigation), so this route trusts ONLY the HMAC-signed `state` param minted by ../../authorize,
// never a client-supplied identity header. Redirect target on both success and failure is the
// connectors page — this is a full-page browser navigation, not a fetch(), so there is no JSON
// response to display to a caller.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_connector_accounts";
const SENDER_TABLE = "co_sender_accounts";

// Never build the browser redirect from req.url: in the standalone container it resolves to the
// bind address (0.0.0.0:3000), not the public host (live bug 2026-10-14, ERR_ADDRESS_INVALID).
// The page the consent started from (OAuthState.from, signed): the outreach door's connectors page, else the staff one.
// Only a missing OAuth client or an invalid state (nothing known about the caller) goes to the staff page.
// A public path (middleware.ts PUBLIC_API_PATHS): no identity headers reach it, so it must never ask resolveTenant /
// resolveOpsRole -- they read an absent identity as staff.
function redirectToConnectors(status: "connected" | "error", detail?: string, from: OAuthState["from"] = "staff"): Response {
  const outreach = PRODUCTS.find((p) => p.key === "outreach")!;
  const u = from === "door" ? new URL(`https://${productHost(outreach)}/connectors`) : new URL("/tools/outreach/connectors", appBaseUrl());
  u.searchParams.set("gmail", status);
  if (detail) u.searchParams.set("detail", detail.slice(0, 200));
  return NextResponse.redirect(u);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectToConnectors("error", "oauth client not configured");
  // Google returns the state on an error too: read it first, so a customer who pressed "deny" lands back on the door.
  const state = stateRaw ? verifyState(stateRaw, clientSecret) : null;
  if (oauthError) return redirectToConnectors("error", `google: ${oauthError}`, state?.from);
  if (!code || !stateRaw) return redirectToConnectors("error", "missing code/state", state?.from);
  if (!state) return redirectToConnectors("error", "invalid or expired state");

  // The database the authorize route read the connector from (signed in the state).
  const supabase = await getOrgSupabaseWriteClient(state.slug ?? null);
  if (!supabase) return redirectToConnectors("error", "supabase not configured", state.from);

  const { data: connector, error: readErr } = await supabase
    .from(TABLE)
    .select("id, organization_id, connector_name")
    .eq("id", state.connectorId)
    .maybeSingle();
  if (readErr) return redirectToConnectors("error", readErr.message, state.from);
  if (!connector) return redirectToConnectors("error", "connector not found", state.from);
  const row = connector as { id: string; organization_id: string | null; connector_name: string };
  if (row.connector_name !== "gmail") return redirectToConnectors("error", "not a gmail connector", state.from);

  const redirectUri = gmailOAuthRedirectUri();

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
  } catch (e) {
    return redirectToConnectors("error", e instanceof Error ? e.message : "token exchange failed", state.from);
  }
  if (!tokens.refresh_token) {
    // Should not happen with prompt=consent, but a stale re-click of an old authorize link could
    // race a still-valid prior grant. Fail loudly rather than silently leaving no refresh token.
    return redirectToConnectors("error", "no refresh_token returned — reconnect and approve again", state.from);
  }

  let profile;
  try {
    profile = await getGmailProfile(tokens.access_token);
  } catch (e) {
    return redirectToConnectors("error", e instanceof Error ? e.message : "profile fetch failed", state.from);
  }

  // A pool connect confirms the address first: the token of another account is never stored.
  if (state.poolEmail && profile.emailAddress.trim().toLowerCase() !== state.poolEmail) {
    return redirectToConnectors("error", `signed in as ${profile.emailAddress}, not ${state.poolEmail} -- pool mailbox not connected`, state.from);
  }
  const refusal = state.poolEmail ? poolEmailRefusal(profile.emailAddress, baseDomain()) : null;
  if (refusal) return redirectToConnectors("error", refusal, state.from);

  const ref = connectorSecretRef(row.id);
  try {
    await putSecret(ref, tokens.refresh_token);
  } catch (e) {
    return redirectToConnectors("error", e instanceof Error ? e.message : "vault write failed", state.from);
  }

  const { error: updErr } = await supabase
    .from(TABLE)
    .update({
      credentials_ref: ref,
      is_enabled: true,
      settings: { email: profile.emailAddress, scope: tokens.scope, connected_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) return redirectToConnectors("error", updErr.message, state.from);

  // Auto-provision the sender identity this connector will draft as. Idempotent: re-connecting the
  // same Gmail account for the same org must not create a second row and must not reset counters.
  // .eq("organization_id", null) does not mean IS NULL on a typed uuid column (same bug class
  // critic caught in gmail-draft/route.ts's sender lookup) — the agency-default connector
  // (organization_id === null) needs .is() or this silently fails to find the existing row and
  // inserts a duplicate on every reconnect.
  let existingSenderQuery = supabase.from(SENDER_TABLE).select("id, send_mode").eq("provider", "gmail").eq("email", profile.emailAddress);
  existingSenderQuery = row.organization_id
    ? existingSenderQuery.eq("organization_id", row.organization_id)
    : existingSenderQuery.is("organization_id", null);
  const { data: existingSender, error: senderReadErr } = await existingSenderQuery.maybeSingle();
  if (senderReadErr) return redirectToConnectors("error", senderReadErr.message, state.from);
  const existing = existingSender as { id: string; send_mode: string } | null;
  // The connector holds one Google token: a mailbox row it served before (another address on this connector) loses the
  // link and stops auto-sending, else it would send as this account (0152 co_sender_accounts_connector_uniq).
  let unlink = supabase.from(SENDER_TABLE).update({ connector_id: null, send_mode: "draft", updated_at: new Date().toISOString() })
    .eq("connector_id", row.id);
  if (existing) unlink = unlink.neq("id", existing.id);
  const { error: unlinkErr } = await unlink;
  if (unlinkErr) return redirectToConnectors("error", unlinkErr.message, state.from);
  const fields = connectedSenderFields(existing, { connectorId: row.id, pool: !!state.poolEmail, today: taipeiDay() });
  const { error: senderErr } = existing
    ? await supabase.from(SENDER_TABLE).update({ ...fields, updated_at: new Date().toISOString() }).eq("id", existing.id)
    : await supabase.from(SENDER_TABLE).insert({ organization_id: row.organization_id, email: profile.emailAddress, ...fields });
  if (senderErr) return redirectToConnectors("error", senderErr.message, state.from);

  return redirectToConnectors("connected", profile.emailAddress, state.from);
}

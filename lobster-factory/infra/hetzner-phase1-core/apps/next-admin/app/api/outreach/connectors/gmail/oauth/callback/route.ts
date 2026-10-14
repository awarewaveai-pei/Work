import { NextResponse } from "next/server";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { putSecret, connectorSecretRef } from "@/lib/secret-vault";
import { exchangeCodeForTokens, getGmailProfile, gmailOAuthRedirectUri, verifyState } from "@/lib/outreach/google-oauth";

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
const DEFAULT_DAILY_LIMIT = 20;

function redirectToConnectors(origin: string, status: "connected" | "error", detail?: string): Response {
  const u = new URL("/outreach/connectors", origin);
  u.searchParams.set("gmail", status);
  if (detail) u.searchParams.set("detail", detail.slice(0, 200));
  return NextResponse.redirect(u);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return redirectToConnectors(url.origin, "error", `google: ${oauthError}`);
  if (!code || !stateRaw) return redirectToConnectors(url.origin, "error", "missing code/state");

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectToConnectors(url.origin, "error", "oauth client not configured");

  const state = verifyState(stateRaw, clientSecret);
  if (!state) return redirectToConnectors(url.origin, "error", "invalid or expired state");

  const supabase = await getOrgSupabaseWriteClient(null);
  if (!supabase) return redirectToConnectors(url.origin, "error", "supabase not configured");

  const { data: connector, error: readErr } = await supabase
    .from(TABLE)
    .select("id, organization_id, connector_name")
    .eq("id", state.connectorId)
    .maybeSingle();
  if (readErr) return redirectToConnectors(url.origin, "error", readErr.message);
  if (!connector) return redirectToConnectors(url.origin, "error", "connector not found");
  const row = connector as { id: string; organization_id: string | null; connector_name: string };
  if (row.connector_name !== "gmail") return redirectToConnectors(url.origin, "error", "not a gmail connector");

  const redirectUri = gmailOAuthRedirectUri();

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
  } catch (e) {
    return redirectToConnectors(url.origin, "error", e instanceof Error ? e.message : "token exchange failed");
  }
  if (!tokens.refresh_token) {
    // Should not happen with prompt=consent, but a stale re-click of an old authorize link could
    // race a still-valid prior grant. Fail loudly rather than silently leaving no refresh token.
    return redirectToConnectors(url.origin, "error", "no refresh_token returned — reconnect and approve again");
  }

  let profile;
  try {
    profile = await getGmailProfile(tokens.access_token);
  } catch (e) {
    return redirectToConnectors(url.origin, "error", e instanceof Error ? e.message : "profile fetch failed");
  }

  const ref = connectorSecretRef(row.id);
  try {
    await putSecret(ref, tokens.refresh_token);
  } catch (e) {
    return redirectToConnectors(url.origin, "error", e instanceof Error ? e.message : "vault write failed");
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
  if (updErr) return redirectToConnectors(url.origin, "error", updErr.message);

  // Auto-provision the sender identity this connector will draft as. Idempotent: re-connecting the
  // same Gmail account for the same org must not create a second row and must not reset counters.
  // .eq("organization_id", null) does not mean IS NULL on a typed uuid column (same bug class
  // critic caught in gmail-draft/route.ts's sender lookup) — the agency-default connector
  // (organization_id === null) needs .is() or this silently fails to find the existing row and
  // inserts a duplicate on every reconnect.
  let existingSenderQuery = supabase.from(SENDER_TABLE).select("id").eq("provider", "gmail").eq("email", profile.emailAddress);
  existingSenderQuery = row.organization_id
    ? existingSenderQuery.eq("organization_id", row.organization_id)
    : existingSenderQuery.is("organization_id", null);
  const { data: existingSender } = await existingSenderQuery.maybeSingle();
  if (!existingSender) {
    await supabase.from(SENDER_TABLE).insert({
      organization_id: row.organization_id,
      email: profile.emailAddress,
      provider: "gmail",
      stream_type: "cold",
      daily_limit: DEFAULT_DAILY_LIMIT,
    });
  }

  return redirectToConnectors(url.origin, "connected", profile.emailAddress);
}

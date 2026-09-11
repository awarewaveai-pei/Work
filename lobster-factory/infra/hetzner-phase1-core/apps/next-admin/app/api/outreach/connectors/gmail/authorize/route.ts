import { NextResponse } from "next/server";
import { resolveOpsRole, canManageOutreach } from "@/lib/ops-role";
import { getOrgSupabaseWriteClient } from "@/lib/org-client";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { buildAuthorizeUrl, gmailOAuthRedirectUri, signState } from "@/lib/outreach/google-oauth";
import crypto from "node:crypto";

// Cold Outreach — Gmail OAuth step 1 (task T10). Redirects the operator to Google's consent
// screen for the connector row already created via ../route.ts's normal "新增 Connector" flow.
// GET only — this is a browser navigation (click "連接 Google 帳號"), never a fetch() call.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "co_connector_accounts";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canManageOutreach(role)) return new NextResponse("forbidden", { status: 403 });

  const url = new URL(req.url);
  const connectorId = url.searchParams.get("connectorId");
  if (!connectorId || !UUID_RE.test(connectorId)) {
    return NextResponse.json({ ok: false, error: "connectorId (uuid) required" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ ok: false, error: "GOOGLE_OAUTH_CLIENT_ID/SECRET not configured" }, { status: 503 });
  }

  const supabase = await getOrgSupabaseWriteClient(url.searchParams.get("orgSlug"));
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 503 });

  const { data: connector, error } = await supabase
    .from(TABLE)
    .select("id, organization_id, connector_name")
    .eq("id", connectorId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!connector) return NextResponse.json({ ok: false, error: "connector not found" }, { status: 404 });
  const row = connector as { id: string; organization_id: string | null; connector_name: string };
  if (row.connector_name !== "gmail") {
    return NextResponse.json({ ok: false, error: "connector is not a gmail connector" }, { status: 400 });
  }
  // Verify caller owns this connector before minting a state that lets them re-authorize it with
  // their own Google account (critic Critical, 2026-09-11: without this, any canManageOutreach
  // caller — including a future Phase-5 client bound to a different org — could hijack another
  // org's Gmail connector, overwrite its stored refresh token, and have drafts.create() run
  // against their own mailbox for that org's leads. Mirrors connectors/route.ts's own check.
  try { assertOrgAccess(req, row.organization_id); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }

  const redirectUri = gmailOAuthRedirectUri();
  const state = signState({ connectorId, nonce: crypto.randomBytes(12).toString("hex"), ts: Date.now() }, clientSecret);
  const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state });

  return NextResponse.redirect(authorizeUrl);
}

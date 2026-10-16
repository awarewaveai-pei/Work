// GET/PUT/DELETE /api/ops/clients/[slug]/cs-config/chatwoot-token
// The operator's Chatwoot User access token, saved to the vault from the 客服 tab so it is never pasted
// to an agent. Read path: lib/cs/chatwoot-client.ts loadReadToken (message reads + contact rename).
// GET    → { configured } — never the value.
// PUT    { token } → checked against Chatwoot first (checkUserToken: a bot token, or a user who cannot
//        read this account's contacts, is refused and nothing is stored), then putSecret. owner/admin only; audited without the value.
//        After a save the Chatwoot baseline is applied once (lib/cs/chatwoot-baseline.ts; it gates itself);
//        its outcome rides in `baseline` and never fails the save. The daily schedule job
//        cs_chatwoot_baseline keeps it applied afterwards (lib/schedules/jobs.ts).
// DELETE → deleteSecret; reads fall back to the bot token.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { deleteSecret, getSecret, putSecret } from "@/lib/secret-vault";
import { recordOpsAudit } from "@/lib/ops-audit";
import { loadCis } from "@/lib/cs/cis";
import { checkUserToken, chatwootUserTokenRef } from "@/lib/cs/chatwoot-client";
import { applyChatwootBaseline, type BaselineChange } from "@/lib/cs/chatwoot-baseline";
import { BLOCKED_CHANGE_CODE } from "@/lib/system-modes/blocked-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** The org id for `slug`, or the error response (404 / 503 / org-access 403). */
async function orgOf(request: Request, context: Ctx): Promise<string | Response> {
  const { slug } = await context.params;
  const supabase = getSupabaseWriteClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  const { data } = await supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
  const orgId = (data as { id?: string } | null)?.id;
  if (!orgId) return NextResponse.json({ ok: false, error: "client_not_found" }, { status: 404 });
  try {
    assertOrgAccess(request, orgId);
  } catch (e) {
    if (e instanceof OrgAccessError) return toOrgAccessResponse(e);
    throw e;
  }
  return orgId;
}

export async function GET(request: Request, context: Ctx) {
  resolveOpsRole(request); // status only — any console role may read
  const org = await orgOf(request, context);
  if (typeof org !== "string") return org;
  try {
    return NextResponse.json({ ok: true, configured: Boolean(await getSecret(chatwootUserTokenRef(org))) });
  } catch {
    return NextResponse.json({ ok: false, error: "vault_unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request, context: Ctx) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "token_required" }, { status: 400 });

  const org = await orgOf(request, context);
  if (typeof org !== "string") return org;

  const cis = await loadCis(org);
  const chatwoot = cis.chatwoot;
  if (!chatwoot) return NextResponse.json({ ok: false, error: "chatwoot_not_configured" }, { status: 409 });

  const check = await checkUserToken(chatwoot, token);
  if (check !== "ok") {
    return NextResponse.json({ ok: false, error: `token_${check}` }, { status: check === "unreachable" ? 502 : 422 });
  }

  try {
    await putSecret(chatwootUserTokenRef(org), token);
  } catch (e) {
    // secret-vault errors carry the RPC failure, never the value.
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "vault_write_failed" }, { status: 500 });
  }
  await recordOpsAudit(org, resolved.role, resolved.source, "cs_chatwoot_user_token_set", { accountId: chatwoot.accountId });

  let baseline: { ok: true; changes: BaselineChange[] } | { ok: false; error: string };
  try {
    const r = await applyChatwootBaseline(getSupabaseWriteClient(), org, chatwoot, cis);
    baseline = "blocked" in r ? { ok: false, error: BLOCKED_CHANGE_CODE } : { ok: true, changes: r.changes };
  } catch (e) {
    baseline = { ok: false, error: e instanceof Error ? e.message : "baseline_failed" };
  }
  if (baseline.ok && baseline.changes.length) {
    await recordOpsAudit(org, resolved.role, resolved.source, "cs_chatwoot_baseline_applied", {
      changes: baseline.changes.map((c) => (c.kind === "account" ? `${c.kind}:${c.field}` : `${c.kind}:${c.name}`)),
    });
  }
  return NextResponse.json({ ok: true, configured: true, baseline });
}

export async function DELETE(request: Request, context: Ctx) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const org = await orgOf(request, context);
  if (typeof org !== "string") return org;
  try {
    await deleteSecret(chatwootUserTokenRef(org));
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "vault_delete_failed" }, { status: 500 });
  }
  await recordOpsAudit(org, resolved.role, resolved.source, "cs_chatwoot_user_token_cleared", {});
  return NextResponse.json({ ok: true, configured: false });
}

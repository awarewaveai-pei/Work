import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { putSecret } from "@/lib/secret-vault";
import { resolveOpsRole, canCreateAiImageJob, canWriteTenantConfig } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { assertMediaProviderAllowed } from "@/lib/content/video/provider-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PROVIDERS = new Set(["anthropic", "openai", "replicate", "pexels", "elevenlabs"]);

function orgFrom(req: Request, value: unknown): string {
  const org = typeof value === "string" ? value.trim() : "";
  if (!org) throw new Error("organizationId required");
  assertOrgAccess(req, org);
  return org;
}

export async function GET(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return new NextResponse("forbidden", { status: 403 });
  const org = new URL(req.url).searchParams.get("organizationId");
  let organizationId: string;
  try { organizationId = orgFrom(req, org); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "invalid organization" }, { status: 400 }); }
  const db = getSupabaseWriteClient();
  if (!db) return new NextResponse("db unavailable", { status: 503 });
  const [account, ledger, providers] = await Promise.all([
    db.from("media_billing_accounts").select("organization_id, plan, status, monthly_credit_limit, hard_credit_limit, current_period_end, metadata").eq("organization_id", organizationId).maybeSingle(),
    db.from("media_credit_ledger").select("units").eq("organization_id", organizationId),
    db.from("media_provider_profiles").select("id, provider, mode, enabled, settings, updated_at").eq("organization_id", organizationId).order("provider"),
  ]);
  if (account.error || ledger.error || providers.error) return NextResponse.json({ ok: false, error: account.error?.message ?? ledger.error?.message ?? providers.error?.message }, { status: 500 });
  const balance = (ledger.data ?? []).reduce((n, row) => n + Number(row.units ?? 0), 0);
  return NextResponse.json({ ok: true, account: account.data ?? { organization_id: organizationId, plan: "free", status: "active", monthly_credit_limit: 0, hard_credit_limit: 0 }, balance, providers: providers.data ?? [] });
}

export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canWriteTenantConfig(role)) return new NextResponse("forbidden", { status: 403 });
  let body: Record<string, unknown>; try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  let organizationId: string;
  try { organizationId = orgFrom(req, body.organizationId); } catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "invalid organization" }, { status: 400 }); }
  const db = getSupabaseWriteClient(); if (!db) return new NextResponse("db unavailable", { status: 503 });

  const plan = typeof body.plan === "string" ? body.plan : undefined;
  const status = typeof body.status === "string" ? body.status : undefined;
  if (plan && !["free", "subscription", "enterprise"].includes(plan)) return NextResponse.json({ ok: false, error: "invalid plan" }, { status: 400 });
  if (status && !["active", "past_due", "canceled"].includes(status)) return NextResponse.json({ ok: false, error: "invalid status" }, { status: 400 });
  for (const [field, value] of [["monthlyCreditLimit", body.monthlyCreditLimit], ["hardCreditLimit", body.hardCreditLimit]] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0)) {
      return NextResponse.json({ ok: false, error: `${field} must be a non-negative safe integer` }, { status: 400 });
    }
  }
  if (plan || status || body.monthlyCreditLimit !== undefined || body.hardCreditLimit !== undefined) {
    const patch = { organization_id: organizationId, ...(plan ? { plan } : {}), ...(status ? { status } : {}), ...(Number.isInteger(body.monthlyCreditLimit) ? { monthly_credit_limit: body.monthlyCreditLimit } : {}), ...(Number.isInteger(body.hardCreditLimit) ? { hard_credit_limit: body.hardCreditLimit } : {}), updated_at: new Date().toISOString() };
    const saved = await db.from("media_billing_accounts").upsert(patch, { onConflict: "organization_id" }).select().single();
    if (saved.error) return NextResponse.json({ ok: false, error: saved.error.message }, { status: 500 });
  }

  if (body.provider !== undefined) {
    const provider = typeof body.provider === "string" ? body.provider : "";
    const mode = body.mode === "byo" ? "byo" : "agency";
    if (!PROVIDERS.has(provider)) return NextResponse.json({ ok: false, error: "unsupported provider" }, { status: 400 });
    try { assertMediaProviderAllowed(provider); } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "provider_not_allowlisted" }, { status: 403 }); }
    // Vault references are server-owned. A request can replace its own BYO
    // secret, but can never point a provider profile at another vault entry.
    let secretRef: string | null = null;
    if (body.providerSecret !== undefined) {
      if (typeof body.providerSecret !== "string" || body.providerSecret.length < 8 || body.providerSecret.length > 4096) return NextResponse.json({ ok: false, error: "providerSecret length invalid" }, { status: 400 });
      secretRef = `media_provider:${organizationId}:${provider}`;
      await putSecret(secretRef, body.providerSecret);
    } else {
      const existing = await db.from("media_provider_profiles")
        .select("secret_ref")
        .eq("organization_id", organizationId)
        .eq("provider", provider)
        .maybeSingle();
      if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
      secretRef = typeof existing.data?.secret_ref === "string" ? existing.data.secret_ref : null;
    }
    const saved = await db.from("media_provider_profiles").upsert({ organization_id: organizationId, provider, mode, secret_ref: secretRef, enabled: body.enabled !== false, settings: (body.settings ?? {}) as object, updated_at: new Date().toISOString() }, { onConflict: "organization_id,provider" }).select("id, provider, mode, enabled, settings, updated_at").single();
    if (saved.error) return NextResponse.json({ ok: false, error: saved.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, provider: saved.data });
  }
  return NextResponse.json({ ok: true });
}

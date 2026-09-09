import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "@/lib/ops-role";
import { assertOrgAccess, OrgAccessError, toOrgAccessResponse } from "@/lib/tenant-guard";
import { getPaymentProvider } from "@/lib/content/video/payment-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a provider-hosted subscription checkout; card details never touch next-admin. */
export async function POST(req: Request): Promise<Response> {
  const { role } = resolveOpsRole(req);
  if (!canCreateAiImageJob(role)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const provider = getPaymentProvider();
  if (!provider) return NextResponse.json({ ok: false, error: "payment_provider_not_configured" }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const priceId = typeof body.priceId === "string" ? body.priceId.trim() : "";
  const successUrl = typeof body.successUrl === "string" ? body.successUrl.trim() : "";
  const cancelUrl = typeof body.cancelUrl === "string" ? body.cancelUrl.trim() : "";
  const customerEmail = typeof body.customerEmail === "string" ? body.customerEmail.trim() : undefined;
  if (!organizationId || !priceId || !successUrl || !cancelUrl) return NextResponse.json({ ok: false, error: "organizationId/priceId/successUrl/cancelUrl required" }, { status: 400 });
  try { assertOrgAccess(req, organizationId); }
  catch (e) { if (e instanceof OrgAccessError) return toOrgAccessResponse(e); throw e; }
  try {
    const session = await provider.createCheckoutSession({ organizationId, priceId, successUrl, cancelUrl, customerEmail });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "checkout_failed" }, { status: 502 });
  }
}

